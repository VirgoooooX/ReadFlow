import { RSSSource, Article } from '../../types';
import { IRSSProvider, FeedInfo } from './RSSProvider';
import { DatabaseService } from '../../database/DatabaseService';
import { SettingsService } from '../SettingsService';
import { filterService } from './FilterService';
import AuthService from '../AuthService';
import { cloudConfigService } from '../CloudConfigService';
import { logger } from './RSSUtils';
import cacheEventEmitter from '../CacheEventEmitter';

export class CloudSyncService implements IRSSProvider {
  private databaseService = DatabaseService.getInstance();
  private settingsService = SettingsService.getInstance();

  private checkAuth() {
    if (!AuthService.isAuthenticated()) {
      throw new Error('Cloud mode requires login. Please log in to your account.');
    }
  }

  private async getServerUrl(): Promise<string> {
    const cloudConfig = await cloudConfigService.getConfig();
    const url = cloudConfig.serverUrl;
    if (!url) {
      throw new Error('Server URL not configured');
    }
    // Remove trailing slash if present
    return url.replace(/\/$/, '');
  }

  private getAuthHeaders(): HeadersInit {
    const token = AuthService.getAuthToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  private async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const cloudConfig = await cloudConfigService.getConfig();
    const headers = {
      ...this.getAuthHeaders(),
      ...(cloudConfig.serverAccessKey ? { 'x-server-token': cloudConfig.serverAccessKey, 'x-server-access-key': cloudConfig.serverAccessKey } : {}),
      ...(options.headers || {})
    };
    return fetch(url, { ...options, headers });
  }

  /**
   * Fetch articles from cloud server
   * options.triggerRefresh: If true, force server to refresh feed
   */
  public async fetchArticles(source: RSSSource, options: { triggerRefresh?: boolean } = {}): Promise<Article[]> {
    try {
      const serverUrl = await this.getServerUrl();
      const settings = await this.settingsService.getAppSettings();
      const imageCompression = settings.sync.imageCompression ?? false;
      const cursors = settings.sync.cloudCursors || {};
      const since = cursors[source.url] || 0;

      this.checkAuth();
      await this.pushUserAndFeedsIfNeeded(serverUrl);

      // If triggerRefresh is requested, call refresh endpoint first
      if (options.triggerRefresh) {
        logger.info(`[CloudSync] Triggering server refresh for ${source.name}`);
        try {
          // Assuming server has POST /api/rss/refresh endpoint
          // Based on admin.ts, we have POST /api/admin/feeds/:id/refresh
          // But CloudSyncService doesn't know feed ID on server.
          // We need a public endpoint: POST /api/rss/refresh?url=...
          const refreshUrl = `${serverUrl}/api/rss/refresh?url=${encodeURIComponent(source.url)}`;
          await this.authenticatedFetch(refreshUrl, { method: 'POST' });
        } catch (e) {
          logger.warn(`[CloudSync] Trigger refresh failed:`, e);
        }
      }

      const sourceId = typeof source.id === 'string' ? parseInt(source.id, 10) : source.id;
      let cursor = since;
      let latestCursor = since;
      const aggregated: Article[] = [];
      const seenUrls = new Set<string>();

      const maxPages = 100;
      let page = 0;

      while (page < maxPages) {
        const syncUrl = `${serverUrl}/api/rss/sync?url=${encodeURIComponent(source.url)}&since=${cursor}&imageCompression=${imageCompression}`;
        logger.info(`[CloudSync] Syncing articles for source ${source.name} from ${syncUrl}`);

        const syncResp = await this.authenticatedFetch(syncUrl);
        if (syncResp.ok) {
          const payload = await syncResp.json();
          const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
          const upserts = blocks.flatMap((b: any) => (Array.isArray(b?.upserts) ? b.upserts : []));
          const pageArticles = upserts.map((item: any) => this.mapServerArticle(item, source));

          const pageLatest = typeof payload?.latest === 'number' ? payload.latest : cursor;
          const hasMore = payload?.hasMore === true;

          const filteredPage = await filterService.applyFilterRules<Article>(pageArticles, sourceId);
          logger.info(`[CloudSync] Filtered articles: ${pageArticles.length} -> ${filteredPage.length}`);
          await this.saveArticles(filteredPage);

          for (const a of filteredPage) {
            if (!a?.url) continue;
            if (seenUrls.has(a.url)) continue;
            seenUrls.add(a.url);
            aggregated.push(a);
          }

          if (pageLatest > cursor) {
            cursor = pageLatest;
            latestCursor = pageLatest;
            const nextSync = {
              ...settings.sync,
              cloudCursors: { ...cursors, [source.url]: latestCursor },
            };
            await this.settingsService.updateAppSettingNoCloudSync('sync', nextSync);
          } else if (pageLatest < cursor) {
            logger.warn(`[CloudSync] Sync cursor regressed for ${source.name}, stopping pagination`);
            break;
          } else if (pageArticles.length > 0 && hasMore) {
            logger.warn(`[CloudSync] Sync cursor did not advance for ${source.name}, stopping pagination`);
            break;
          }

          if (!hasMore || pageArticles.length === 0) {
            break;
          }

          page += 1;
          continue;
        }

        if (syncResp.status === 404) {
          const apiUrl = `${serverUrl}/api/rss?url=${encodeURIComponent(source.url)}&imageCompression=${imageCompression}`;
          logger.info(`[CloudSync] Falling back to full fetch for source ${source.name} from ${apiUrl}`);

          const response = await this.authenticatedFetch(apiUrl);
          if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
          }

          const data = await response.json();
          const articles = Array.isArray(data) ? data.map((item: any) => this.mapServerArticle(item, source)) : [];
          const filteredArticles = await filterService.applyFilterRules<Article>(articles, sourceId);
          logger.info(`[CloudSync] Filtered articles: ${articles.length} -> ${filteredArticles.length}`);
          await this.saveArticles(filteredArticles);
          return filteredArticles;
        }

        throw new Error(`Server returned ${syncResp.status}: ${syncResp.statusText}`);
      }

      return aggregated;
    } catch (error) {
      logger.error('[CloudSync] Fetch failed:', error);
      throw error;
    }
  }

  private async pushUserAndFeedsIfNeeded(serverUrl: string): Promise<void> {
    try {
      const [appSettings, readingSettings, llmSettings] = await Promise.all([
        this.settingsService.getAppSettings(),
        this.settingsService.getReadingSettings(),
        this.settingsService.getLLMSettingsStore(),
      ]);
      const cloudConfig = await cloudConfigService.getConfig();
      if (cloudConfig.mode !== 'cloud') return;

      const now = Date.now();
      const last = appSettings.sync.lastProfilePushAt || 0;
      if (now - last < 10 * 60 * 1000) return;

      // 1. Determine User Identity
      // Priority: AuthService User > Existing Sync ID > Generate New Random ID
      const authUser = AuthService.getCurrentUser();
      let userId = appSettings.sync.userId;

      // If logged in and IDs don't match, or sync ID is missing, prefer Auth ID
      if (authUser && authUser.id) {
        if (userId !== authUser.id) {
          userId = authUser.id;
          // Update setting immediately to match Auth User
          await this.settingsService.updateAppSettingNoCloudSync('sync', { ...appSettings.sync, userId });
        }
      } else if (!userId) {
        // Fallback: Generate random ID for guest
        userId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        await this.settingsService.updateAppSettingNoCloudSync('sync', { ...appSettings.sync, userId });
      }

      const rows: any[] = await this.databaseService.executeQuery(
        'SELECT id, url, title, category, update_frequency FROM rss_sources ORDER BY id DESC'
      );

      const feeds = rows.map((r: any) => ({
        id: r.id,
        url: r.url,
        name: r.title,
        category: r.category,
        updateFrequency: r.update_frequency,
      }));

      const payload = {
        user: {
          id: userId,
          username: authUser?.username || `user-${userId.slice(-6)}`,
          email: authUser?.email,
          registeredAt: authUser?.createdAt,
        },
        settings: { appSettings, readingSettings, llmSettings },
        feeds,
      };

      const apiUrl = `${serverUrl}/api/rss/clientSync`;
      const resp = await this.authenticatedFetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        logger.warn(`[CloudSync] Profile push failed: ${resp.status} ${resp.statusText}`);
        return;
      }

      // Update local userId with the canonical one from server (handles merges)
      const respData = await resp.json();
      if (respData.user && respData.user.id && respData.user.id !== userId) {
        logger.info(`[CloudSync] Updating local userId from ${userId} to server canonical ${respData.user.id}`);
        userId = respData.user.id;
      }

      await this.settingsService.updateAppSettingNoCloudSync('sync', { ...appSettings.sync, userId, lastProfilePushAt: now });
    } catch (error) {
      logger.warn('[CloudSync] Profile push failed:', error);
    }
  }

  /**
   * Sync User Article States (Read/Favorite)
   */
  public async syncUserArticleStates(): Promise<void> {
    try {
      const [appSettings, cloudConfig] = await Promise.all([
        this.settingsService.getAppSettings(),
        cloudConfigService.getConfig(),
      ]);
      if (cloudConfig.mode !== 'cloud') return;

      if (!AuthService.isAuthenticated()) {
        logger.info('[CloudSync] Skip state sync: Cloud mode enabled but not logged in');
        return;
      }

      const userId = appSettings.sync.userId;
      if (!userId) {
        return;
      }
      
      const serverUrl = await this.getServerUrl();
      const lastSync = appSettings.sync.lastStateSyncAt || 0;
      const nowIso = new Date().toISOString();

      // 1. Gather local changes (dirty states) - Simplified: Just send all read/fav articles updated recently
      // In a real app, we should track dirty flags. Here we scan articles updated > lastSync
      // Or just send everything marked as read/fav? Sending all might be heavy.
      // Let's optimize: Send states for articles that are read or favorite
      
      // For MVP: Send all local read/favorite states to server (Merge strategy)
      const localStates = await this.databaseService.executeQuery(
        `SELECT url, is_read, is_favorite, read_progress, updated_at 
         FROM articles 
         WHERE (is_read = 1 OR is_favorite = 1) 
         AND updated_at > ?`, // Only send changes since last sync? Or just all?
        [new Date(lastSync).toISOString()]
      );

      if (localStates.length > 0) {
        const payload = localStates.map((r: any) => ({
          userId,
          articleUrl: r.url,
          isRead: r.is_read === 1,
          isFavorite: r.is_favorite === 1,
          readProgress: r.read_progress,
          updatedAt: new Date(r.updated_at).toISOString()
        }));

        await this.authenticatedFetch(`${serverUrl}/api/rss/syncState`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, states: payload })
        });
        logger.info(`[CloudSync] Pushed ${payload.length} article states`);
      }

      // 2. Pull remote changes
      const pullUrl = `${serverUrl}/api/rss/syncState?userId=${userId}&since=${new Date(lastSync).toISOString()}`;
      const resp = await this.authenticatedFetch(pullUrl);
      if (resp.ok) {
        const data = await resp.json();
        const remoteStates = data.states || [];
        
        if (remoteStates.length > 0) {
          await this.applyRemoteStates(remoteStates);
          logger.info(`[CloudSync] Pulled ${remoteStates.length} article states`);
        }
        
        // Update sync timestamp
        await this.settingsService.updateAppSettingNoCloudSync('sync', { 
          ...appSettings.sync, 
          lastStateSyncAt: Date.now() 
        });
      }

    } catch (error) {
      logger.error('[CloudSync] State sync failed:', error);
    }
  }

  private async applyRemoteStates(states: any[]): Promise<void> {
    const affectedSourceIds = new Set<number>();

    for (const state of states) {
      if (!state.articleUrl) continue;
      
      // Get article source ID before update
      const article = await this.databaseService.executeQuery(
        'SELECT rss_source_id FROM articles WHERE url = ?',
        [state.articleUrl]
      );
      
      if (article.length > 0 && article[0].rss_source_id) {
        affectedSourceIds.add(article[0].rss_source_id);
      }

      // Update local article if exists
      await this.databaseService.executeStatement(
        `UPDATE articles 
         SET is_read = ?, is_favorite = ?, read_progress = ?, updated_at = ? 
         WHERE url = ?`,
        [
          state.isRead ? 1 : 0,
          state.isFavorite ? 1 : 0,
          state.readProgress || 0,
          new Date().toISOString(), // Update local timestamp
          state.articleUrl
        ]
      );
    }

    // Refresh stats for affected sources
    for (const sourceId of affectedSourceIds) {
      await this.updateSourceStats(sourceId);
    }
  }

  /**
   * Validate feed via cloud server
   */
  public async validateFeed(url: string): Promise<FeedInfo> {
    try {
      const serverUrl = await this.getServerUrl();
      // readflow-server 使用 GET /api/rss/validate
      const apiUrl = `${serverUrl}/api/rss/validate?url=${encodeURIComponent(url)}`;

      const response = await this.authenticatedFetch(apiUrl);

      if (!response.ok) {
        throw new Error(`Server validation failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('[CloudSync] Validation failed:', error);
      throw error;
    }
  }

  private mapServerArticle(item: any, source: RSSSource): Article {
    // readflow-server 返回的字段通常是 camelCase
    return {
      id: item.id, 
      title: item.title,
      content: item.content || '',
      summary: item.summary || item.description || '', 
      publishedAt: new Date(item.publishedAt || item.published_at || new Date()),
      sourceId: source.id,
      sourceName: source.name,
      url: item.url || item.link,
      imageUrl: item.imageUrl || item.image_url,
      author: item.author,
      tags: item.tags || [],
      category: item.category || source.category || 'Uncategorized',
      wordCount: item.wordCount || 0,
      readingTime: item.readingTime || 0,
      difficulty: item.difficulty || 'intermediate',
      isRead: false,
      isFavorite: false,
      readProgress: 0
    };
  }

  private async saveArticles(articles: Article[]): Promise<void> {
    if (articles.length === 0) return;

    const affectedSourceIds = new Set<number>();

    for (const article of articles) {
      if (article.sourceId) {
        // Handle both string and number types for sourceId
        const sId = typeof article.sourceId === 'string' ? parseInt(article.sourceId, 10) : article.sourceId;
        if (!isNaN(sId)) {
          affectedSourceIds.add(sId);
        }
      }

      // Check existence by URL
      const existing = await this.databaseService.executeQuery(
        'SELECT id FROM articles WHERE url = ?',
        [article.url]
      );
      
      if (existing.length === 0) {
        // Re-use DatabaseService logic to insert
        // Note: DatabaseService might need a dedicated insert method that takes Article object
        // For now, we manually construct the insert query matching DatabaseService pattern
        await this.databaseService.executeInsert(
          `INSERT INTO articles (
            title, content, summary, published_at, rss_source_id, source_name, 
            url, image_url, author, category, word_count, reading_time, difficulty
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            article.title,
            article.content,
            article.summary,
            article.publishedAt.toISOString(),
            article.sourceId,
            article.sourceName,
            article.url,
            article.imageUrl,
            article.author,
            article.category,
            article.wordCount,
            article.readingTime,
            article.difficulty
          ]
        );
      } else {
        // Update existing article content to ensure we get the latest version (e.g. with proxied images)
        // We preserve user states (is_read, is_favorite, etc.)
        await this.databaseService.executeQuery(
          `UPDATE articles SET 
            content = ?, 
            summary = ?, 
            image_url = ?,
            word_count = ?,
            reading_time = ?
           WHERE url = ?`,
          [
            article.content,
            article.summary,
            article.imageUrl,
            article.wordCount,
            article.readingTime,
            article.url
          ]
        );
      }
    }

    // Refresh stats for affected sources after sync
    for (const sourceId of affectedSourceIds) {
      await this.updateSourceStats(sourceId);
    }
  }

  /**
   * Update RSS source stats (unread count, etc.) and emit event
   */
  private async updateSourceStats(sourceId: number): Promise<void> {
    try {
      const unreadCountResult = await this.databaseService.executeQuery(
        'SELECT COUNT(*) as count FROM articles WHERE rss_source_id = ? AND is_read = 0',
        [sourceId]
      );
      const unreadCount = unreadCountResult[0]?.count || 0;
      
      await this.databaseService.executeStatement(
        'UPDATE rss_sources SET unread_count = ? WHERE id = ?',
        [unreadCount, sourceId]
      );
      
      // Emit event to update UI
      cacheEventEmitter.emit({ 
        type: 'updateRSSStats', 
        reason: 'cloudSync',
        sourceId 
      });
    } catch (error) {
      logger.error('[CloudSync] Error updating source stats:', error);
    }
  }
}

export const cloudSyncService = new CloudSyncService();
