import { RSSSource, Article, FetchArticlesWithStatsResult } from "../../types";
import { IRSSProvider, FeedInfo } from "./RSSProvider";
import { DatabaseService } from "../../database/DatabaseService";
import { SettingsService } from "../SettingsService";
import { filterService } from "./FilterService";
import AuthService from "../AuthService";
import { cloudConfigService } from "../CloudConfigService";
import { logger } from "./RSSUtils";
import cacheEventEmitter from "../CacheEventEmitter";

export class CloudSyncService implements IRSSProvider {
  private databaseService = DatabaseService.getInstance();
  private settingsService = SettingsService.getInstance();
  private stateSyncTimer: NodeJS.Timeout | null = null;
  private stateSyncInFlight: Promise<void> | null = null;
  private stateSyncNeedsRunAfter: boolean = false;
  private static readonly minStateSyncIntervalMs = 10 * 60 * 1000;
  private static readonly minStatePullIntervalMs = 12 * 60 * 60 * 1000;
  private statePullInFlight: Promise<boolean> | null = null;

  private normalizeFeedUrl(url: string): string {
    return String(url || "")
      .trim()
      .replace(/\/$/, "");
  }

  private async checkAuth(): Promise<void> {
    const cloudConfig = await cloudConfigService.getConfig();
    const token = AuthService.getAuthToken() ?? cloudConfig.auth?.accessToken;
    if (!token) {
      throw new Error(
        "Cloud mode requires login. Please log in to your account.",
      );
    }
  }

  private async getServerUrl(): Promise<string> {
    const cloudConfig = await cloudConfigService.getConfig();
    const url = cloudConfig.serverUrl;
    if (!url) {
      throw new Error("Server URL not configured");
    }
    // Remove trailing slash if present
    return url.replace(/\/$/, "");
  }

  private async authenticatedFetch(
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const cloudConfig = await cloudConfigService.getConfig();
    const token = AuthService.getAuthToken() ?? cloudConfig.auth?.accessToken;
    const headers = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cloudConfig.serverAccessKey
        ? {
            "x-server-token": cloudConfig.serverAccessKey,
            "x-server-access-key": cloudConfig.serverAccessKey,
          }
        : {}),
      ...(options.headers || {}),
    };
    return fetch(url, { ...options, headers });
  }

  public async scheduleStateSync(delayMs: number = 10000): Promise<void> {
    this.stateSyncNeedsRunAfter = true;
    void delayMs;
  }

  private async runStateSync(): Promise<void> {
    if (this.stateSyncInFlight) {
      this.stateSyncNeedsRunAfter = true;
      return this.stateSyncInFlight;
    }

    const shouldRun = this.stateSyncNeedsRunAfter;
    this.stateSyncNeedsRunAfter = false;
    if (!shouldRun) return;

    this.stateSyncInFlight = (async () => {
      try {
        await this.syncUserArticleStates();
      } finally {
        this.stateSyncInFlight = null;
        if (this.stateSyncNeedsRunAfter) {
          await this.scheduleStateSync(1000);
        }
      }
    })();

    return this.stateSyncInFlight;
  }

  public async getPublicFeeds(): Promise<any[]> {
    const serverUrl = await this.getServerUrl();
    const url = `${serverUrl}/api/rss/public`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch public feeds: ${response.statusText}`);
    }
    const data = await response.json();
    return data.feeds || [];
  }

  public async lookupPublicFeed(url: string): Promise<any | null> {
    const serverUrl = await this.getServerUrl();
    const apiUrl = `${serverUrl}/api/rss/public/lookup?url=${encodeURIComponent(url)}`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to lookup public feed: ${response.statusText}`);
    }
    const data = await response.json();
    return data?.feed ?? null;
  }

  /**
   * Fetch articles from cloud server
   * options.triggerRefresh: If true, force server to refresh feed
   */
  public async fetchArticles(
    source: RSSSource,
    options: { triggerRefresh?: boolean } = {},
  ): Promise<Article[]> {
    const result = await this.fetchArticlesWithStats(source, options);
    return result.articles;
  }

  public async fetchArticlesWithStats(
    source: RSSSource,
    options: { triggerRefresh?: boolean } = {},
  ): Promise<FetchArticlesWithStatsResult> {
    try {
      const serverUrl = await this.getServerUrl();
      const settings = await this.settingsService.getAppSettings();
      const sync = (settings as any)?.sync || {};
      const imageCompression = sync.imageCompression ?? false;
      const cursors = sync.cloudCursors || {};
      const normalizedSourceUrl = this.normalizeFeedUrl(source.url);
      const since =
        (cursors as any)[normalizedSourceUrl] ??
        (cursors as any)[source.url] ??
        0;
      logger.info(
        `[CloudSync] Cursor snapshot for ${source.name}:`,
        JSON.stringify({
          sourceUrl: source.url,
          normalizedSourceUrl,
          cursorKey: normalizedSourceUrl,
          since,
        }),
      );

      await this.checkAuth();
      await this.pushUserAndFeedsIfNeeded(serverUrl);

      // If triggerRefresh is requested, call refresh endpoint first
      if (options.triggerRefresh) {
        logger.info(`[CloudSync] Triggering server refresh for ${source.name}`);
        try {
          // Assuming server has POST /api/rss/refresh endpoint
          // Based on admin.ts, we have POST /api/admin/feeds/:id/refresh
          // But CloudSyncService doesn't know feed ID on server.
          // We need a public endpoint: POST /api/rss/refresh?url=...
          const refreshUrl = `${serverUrl}/api/rss/refresh?url=${encodeURIComponent(normalizedSourceUrl)}`;
          await this.authenticatedFetch(refreshUrl, { method: "POST" });
        } catch (e) {
          logger.warn(`[CloudSync] Trigger refresh failed:`, e);
        }
      }

      const sourceId =
        typeof source.id === "string" ? parseInt(source.id, 10) : source.id;
      let cursor = since;
      let latestCursor = since;
      const insertedArticles: Article[] = [];
      let insertedCount = 0;
      let updatedCount = 0;
      let upsertedCount = 0;
      let usedServerCursor = false;
      let usedLegacyCursor = false;

      let localExistingCount = 0;
      if (typeof sourceId === "number" && !Number.isNaN(sourceId)) {
        try {
          const rows = await this.databaseService.executeQuery(
            "SELECT COUNT(*) as count FROM articles WHERE rss_source_id = ?",
            [sourceId],
          );
          const n = rows?.[0]?.count;
          localExistingCount =
            typeof n === "number" ? n : parseInt(String(n ?? "0"), 10) || 0;
        } catch {
          localExistingCount = 0;
        }
      }

      const suspiciousCursorReset = since === 0 && localExistingCount > 0;
      let maxPages = 100;
      let page = 0;

      while (page < maxPages) {
        const syncUrl = `${serverUrl}/api/rss/sync?url=${encodeURIComponent(normalizedSourceUrl)}&mode=serverCursor&since=${cursor}&imageCompression=${imageCompression}`;
        logger.info(
          `[CloudSync] Syncing articles for source ${source.name} from ${syncUrl}`,
        );

        const syncResp = await this.authenticatedFetch(syncUrl);
        if (syncResp.ok) {
          const payload = await syncResp.json();
          const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
          const upserts = blocks.flatMap((b: any) =>
            Array.isArray(b?.upserts) ? b.upserts : [],
          );
          const pageArticles = upserts.map((item: any) =>
            this.mapServerArticle(item, source),
          );

          const pageLatest =
            typeof payload?.latest === "number" ? payload.latest : cursor;
          const hasMore = payload?.hasMore === true;
          const deliveryId =
            typeof payload?.deliveryId === "string" && payload.deliveryId
              ? payload.deliveryId
              : null;
          const serverCursorMode = !!deliveryId;
          if (serverCursorMode) {
            usedServerCursor = true;
          }

          const filteredPage = await filterService.applyFilterRules<Article>(
            pageArticles,
            sourceId,
            50,
          );
          logger.info(
            `[CloudSync] Filtered articles: ${pageArticles.length} -> ${filteredPage.length}`,
          );
          const pageSaveResult = await this.saveArticles(filteredPage);
          logger.info(
            `[CloudSync] Page stats for ${source.name}:`,
            JSON.stringify({
              cursorBefore: cursor,
              pageLatest,
              hasMore,
              serverCursorMode,
              deliveryId,
              pageArticles: pageArticles.length,
              filtered: filteredPage.length,
              inserted: pageSaveResult.insertedCount,
            }),
          );
          insertedArticles.push(...pageSaveResult.insertedArticles);
          insertedCount += pageSaveResult.insertedCount;
          updatedCount += pageSaveResult.updatedCount;
          upsertedCount += pageSaveResult.upsertedCount;

          if (serverCursorMode) {
            const ackResp = await this.authenticatedFetch(
              `${serverUrl}/api/rss/syncAck`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ deliveryId }),
              },
            );
            if (!ackResp.ok) {
              logger.warn(
                `[CloudSync] Delivery ACK failed: ${ackResp.status} ${ackResp.statusText}`,
              );
              break;
            }
          } else {
            usedLegacyCursor = true;
            if (pageLatest > cursor) {
              cursor = pageLatest;
              latestCursor = pageLatest;
            } else if (pageLatest < cursor) {
              logger.warn(
                `[CloudSync] Sync cursor regressed for ${source.name}, stopping pagination`,
              );
              break;
            } else if (pageArticles.length > 0 && hasMore) {
              logger.warn(
                `[CloudSync] Sync cursor did not advance for ${source.name}, stopping pagination`,
              );
              break;
            }
          }

          if (!hasMore || pageArticles.length === 0) {
            break;
          }

          page += 1;
          continue;
        }

        if (syncResp.status === 404) {
          const apiUrl = `${serverUrl}/api/rss?url=${encodeURIComponent(normalizedSourceUrl)}&imageCompression=${imageCompression}`;
          logger.info(
            `[CloudSync] Falling back to full fetch for source ${source.name} from ${apiUrl}`,
          );

          const response = await this.authenticatedFetch(apiUrl);
          if (!response.ok) {
            throw new Error(
              `Server returned ${response.status}: ${response.statusText}`,
            );
          }

          const data = await response.json();
          const articles = Array.isArray(data)
            ? data.map((item: any) => this.mapServerArticle(item, source))
            : [];
          const filteredArticles =
            await filterService.applyFilterRules<Article>(
              articles,
              sourceId,
              50,
            );
          logger.info(
            `[CloudSync] Filtered articles: ${articles.length} -> ${filteredArticles.length}`,
          );
          const saveResult = await this.saveArticles(filteredArticles);
          if (typeof sourceId === "number" && !Number.isNaN(sourceId)) {
            await this.updateSourceStats(sourceId);
          }
          return {
            articles: saveResult.insertedArticles,
            insertedCount: saveResult.insertedCount,
            updatedCount: saveResult.updatedCount,
            upsertedCount: saveResult.upsertedCount,
          };
        }

        throw new Error(
          `Server returned ${syncResp.status}: ${syncResp.statusText}`,
        );
      }

      if (usedLegacyCursor && suspiciousCursorReset) {
        logger.warn(
          `[CloudSync] Suspicious legacy cursor reset detected for ${source.name}`,
          JSON.stringify({
            sourceUrl: source.url,
            normalizedSourceUrl,
            localExistingCount,
          }),
        );
      }

      if (!usedServerCursor && latestCursor > since) {
        const currentSettings = await this.settingsService.getAppSettings();
        const currentCursors = currentSettings.sync.cloudCursors || {};
        const nextSync = {
          ...currentSettings.sync,
          cloudCursors: {
            ...currentCursors,
            [normalizedSourceUrl]: latestCursor,
          },
        };
        await this.settingsService.updateAppSettingNoCloudSync(
          "sync",
          nextSync,
        );
      }

      if (typeof sourceId === "number" && !Number.isNaN(sourceId)) {
        await this.updateSourceStats(sourceId);
      }
      return {
        articles: insertedArticles,
        insertedCount,
        updatedCount,
        upsertedCount,
      };
    } catch (error) {
      logger.error("[CloudSync] Fetch failed:", error);
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

      const now = Date.now();
      const last = appSettings.sync.lastProfilePushAt || 0;
      const lastHash = (appSettings.sync as any).lastProfilePushHash || '';

      // 1. Determine User Identity
      // Priority: AuthService User > Existing Sync ID > Generate New Random ID
      const authUser = AuthService.getCurrentUser();
      let userId = appSettings.sync.userId;

      // If logged in and IDs don't match, or sync ID is missing, prefer Auth ID
      if (authUser && authUser.id) {
        if (userId !== authUser.id) {
          userId = authUser.id;
          // Update setting immediately to match Auth User
          await this.settingsService.updateAppSettingNoCloudSync("sync", {
            ...appSettings.sync,
            userId,
          });
        }
      } else if (!userId) {
        // Fallback: Generate random ID for guest
        userId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        await this.settingsService.updateAppSettingNoCloudSync("sync", {
          ...appSettings.sync,
          userId,
        });
      }

      const rows: any[] = await this.databaseService.executeQuery(
        "SELECT id, url, title, description, category, update_frequency FROM rss_sources ORDER BY id DESC",
      );

      const feeds = rows.map((r: any) => ({
        id: r.id,
        url: r.url,
        name: r.title,
        description: r.description,
        category: r.category,
        updateFrequency: r.update_frequency,
      }));

      const fnv1a = (input: string): string => {
        let hash = 0x811c9dc5;
        for (let i = 0; i < input.length; i += 1) {
          hash ^= input.charCodeAt(i);
          hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
        }
        return hash.toString(16).padStart(8, '0');
      };
      const nextHash = fnv1a(
        feeds
          .map((f: any) => `${String(f.url || '')}|${String(f.name || '')}|${String(f.category || '')}|${String(f.description || '')}`)
          .join('\n'),
      );

      if (now - last < 10 * 60 * 1000 && nextHash === lastHash) return;

      const payload = {
        user: {
          id: userId,
          username: authUser?.username || `user-${userId.slice(-6)}`,
          email: authUser?.email,
          registeredAt: authUser?.createdAt,
        },
        settings: { appSettings, readingSettings, llmSettings },
        feeds,
        replaceFeeds: true,
      };

      const apiUrl = `${serverUrl}/api/rss/clientSync`;
      const resp = await this.authenticatedFetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        logger.warn(
          `[CloudSync] Profile push failed: ${resp.status} ${resp.statusText}`,
        );
        return;
      }

      // Update local userId with the canonical one from server (handles merges)
      const respData = await resp.json();
      if (respData.user && respData.user.id && respData.user.id !== userId) {
        logger.info(
          `[CloudSync] Updating local userId from ${userId} to server canonical ${respData.user.id}`,
        );
        userId = respData.user.id;
      }

      await this.settingsService.updateAppSettingNoCloudSync("sync", {
        ...appSettings.sync,
        userId,
        lastProfilePushAt: now,
        lastProfilePushHash: nextHash,
      });
    } catch (error) {
      logger.warn("[CloudSync] Profile push failed:", error);
    }
  }

  /**
   * Sync User Article States (Read/Favorite)
   */
  public async syncUserArticleStates(mode: 'push' | 'pull' | 'both' = 'both'): Promise<boolean> {
    try {
      const [appSettings, cloudConfig] = await Promise.all([
        this.settingsService.getAppSettings(),
        cloudConfigService.getConfig(),
      ]);

      const token = AuthService.getAuthToken() ?? cloudConfig.auth?.accessToken;
      if (!token) {
        logger.info(
          "[CloudSync] Skip state sync: Cloud mode enabled but not logged in",
        );
        return false;
      }

      const userId = appSettings.sync.userId;
      if (!userId) {
        return false;
      }

      const serverUrl = await this.getServerUrl();
      const lastSync = appSettings.sync.lastStateSyncAt || 0;
      const nowIso = new Date().toISOString();

      const remoteSinceIso = new Date(lastSync).toISOString();

      let pushOk = true;
      if (mode === 'push' || mode === 'both') {
        const dirtyRows: any[] = await this.databaseService
          .executeQuery(
            `SELECT article_url, is_read, is_favorite, updated_at
             FROM article_state_changes
             ORDER BY updated_at ASC
             LIMIT 500`
          )
          .catch(() => []);

        const now = Date.now();
        const shouldSkipBecauseRecent =
          dirtyRows.length === 0 &&
          lastSync > 0 &&
          now - lastSync < CloudSyncService.minStateSyncIntervalMs;
        if (shouldSkipBecauseRecent) {
          return true;
        }
        if (!shouldSkipBecauseRecent) {
          let totalPushed = 0;
          while (dirtyRows.length > 0) {
            const batch = dirtyRows.splice(0, 200);
            const payload = batch.map((r: any) => ({
              articleUrl: String(r.article_url),
              isRead: r.is_read === 1,
              isFavorite: r.is_favorite === 1,
              updatedAt: String(r.updated_at || nowIso),
            }));

            const resp = await this.authenticatedFetch(`${serverUrl}/api/rss/syncState`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId, states: payload }),
            });
            if (!resp.ok) {
              pushOk = false;
              break;
            }
            totalPushed += payload.length;

            const placeholders = payload.map(() => '?').join(',');
            await this.databaseService
              .executeStatement(
                `DELETE FROM article_state_changes WHERE article_url IN (${placeholders})`,
                payload.map((p: any) => p.articleUrl)
              )
              .catch(() => { });

            if (dirtyRows.length === 0) {
              const more: any[] = await this.databaseService
                .executeQuery(
                  `SELECT article_url, is_read, is_favorite, updated_at
                   FROM article_state_changes
                   ORDER BY updated_at ASC
                   LIMIT 500`
                )
                .catch(() => []);
              dirtyRows.push(...more);
            }
          }
          if (totalPushed > 0) {
            logger.info(`[CloudSync] Pushed ${totalPushed} article states`);
          }
        }
      }

      if (mode === 'pull' || mode === 'both') {
        const pullUrl = `${serverUrl}/api/rss/syncState?userId=${userId}&since=${encodeURIComponent(remoteSinceIso)}`;
        const resp = await this.authenticatedFetch(pullUrl);
        if (resp.ok) {
          const data = await resp.json();
          const remoteStates = data.states || [];

          if (remoteStates.length > 0) {
            await this.applyRemoteStates(remoteStates);
            logger.info(
              `[CloudSync] Pulled ${remoteStates.length} article states`,
            );
          }
        } else {
          pushOk = false;
        }
      }

      if (pushOk) {
        await this.settingsService.updateAppSettingNoCloudSync("sync", {
          ...appSettings.sync,
          lastStateSyncAt: Date.now(),
        });
      }
      return pushOk;
    } catch (error) {
      logger.error("[CloudSync] State sync failed:", error);
      return false;
    }
  }

  public async flushPendingStateSyncOnAppBackground(): Promise<void> {
    if (this.stateSyncInFlight) return;
    if (!this.stateSyncNeedsRunAfter) return;
    this.stateSyncNeedsRunAfter = false;
    try {
      const ok = await this.syncUserArticleStates('push');
      if (!ok) {
        this.stateSyncNeedsRunAfter = true;
      }
    } catch (e) {
      this.stateSyncNeedsRunAfter = true;
      logger.warn("[CloudSync] Flush state sync on background failed:", e);
    }
  }

  public async pullUserArticleStatesOnAppActiveIfNeeded(): Promise<void> {
    if (this.statePullInFlight) {
      await this.statePullInFlight.catch(() => false);
      return;
    }

    this.statePullInFlight = (async () => {
      const [appSettings, cloudConfig] = await Promise.all([
        this.settingsService.getAppSettings(),
        cloudConfigService.getConfig(),
      ]);
      const token = AuthService.getAuthToken() ?? cloudConfig.auth?.accessToken;
      if (!token) return false;
      if (!cloudConfig.serverUrl) return false;
      if (!appSettings.sync.userId) return false;

      const lastPullAt = Number(appSettings.sync.lastStatePullAt || 0);
      const now = Date.now();
      if (lastPullAt > 0 && now - lastPullAt < CloudSyncService.minStatePullIntervalMs) {
        return true;
      }

      const ok = await this.syncUserArticleStates('pull');
      if (ok) {
        await this.settingsService.updateAppSettingNoCloudSync("sync", {
          ...appSettings.sync,
          lastStatePullAt: Date.now(),
        });
      }
      return ok;
    })();

    try {
      await this.statePullInFlight;
    } finally {
      this.statePullInFlight = null;
    }
  }

  private async applyRemoteStates(states: any[]): Promise<void> {
    const affectedSourceIds = new Set<number>();

    for (const state of states) {
      if (!state.articleUrl) continue;

      // Get article source ID before update
      const article = await this.databaseService.executeQuery(
        "SELECT rss_source_id FROM articles WHERE url = ?",
        [state.articleUrl],
      );

      if (article.length > 0 && article[0].rss_source_id) {
        affectedSourceIds.add(article[0].rss_source_id);
      }

      // Update local article if exists
      await this.databaseService.executeStatement(
        `UPDATE articles 
         SET is_read = ?, is_favorite = ?, updated_at = ? 
         WHERE url = ?`,
        [
          state.isRead ? 1 : 0,
          state.isFavorite ? 1 : 0,
          new Date().toISOString(), // Update local timestamp
          state.articleUrl,
        ],
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
      logger.error("[CloudSync] Validation failed:", error);
      throw error;
    }
  }

  private mapServerArticle(item: any, source: RSSSource): Article {
    // readflow-server 返回的字段通常是 camelCase
    return {
      id: item.id,
      title: item.title,
      content: item.content || "",
      summary: item.summary || item.description || "",
      publishedAt: new Date(
        item.publishedAt || item.published_at || new Date(),
      ),
      sourceId: source.id,
      sourceName: source.name,
      url: item.url || item.link,
      imageUrl: item.imageUrl || item.image_url,
      videoUrl: item.videoUrl || item.video_url,
      author: item.author,
      tags: item.tags || [],
      category: item.category || source.category || "Uncategorized",
      wordCount: item.wordCount || 0,
      readingTime: item.readingTime || 0,
      difficulty: item.difficulty || "intermediate",
      isRead: false,
      isFavorite: false,
      readProgress: 0,
    };
  }

  private async saveArticles(articles: Article[]): Promise<{
    insertedArticles: Article[];
    insertedCount: number;
    updatedCount: number;
    upsertedCount: number;
  }> {
    if (articles.length === 0) {
      return {
        insertedArticles: [],
        insertedCount: 0,
        updatedCount: 0,
        upsertedCount: 0,
      };
    }

    const uniqueByUrl = new Map<string, Article>();
    for (const article of articles) {
      if (!article?.url) continue;
      uniqueByUrl.set(article.url, article);
    }

    const uniqueArticles = Array.from(uniqueByUrl.values());
    const urls = uniqueArticles.map((a) => a.url).filter(Boolean);
    const existingUrls = new Set<string>();
    const inChunkSize = 200;

    for (let i = 0; i < urls.length; i += inChunkSize) {
      const chunk = urls.slice(i, i + inChunkSize);
      if (chunk.length === 0) continue;
      const placeholders = chunk.map(() => "?").join(",");
      const rows = await this.databaseService.executeQuery(
        `SELECT url FROM articles WHERE url IN (${placeholders})`,
        chunk,
      );
      for (const r of rows) {
        if (r?.url) existingUrls.add(String(r.url));
      }
    }

    const toInsert = uniqueArticles.filter(
      (a) => a?.url && !existingUrls.has(a.url),
    );
    const insertedArticles = toInsert;
    let insertedCount = 0;
    let updatedCount = 0;

    const batchSize = 40;
    await this.databaseService.beginTransaction();
    try {
      for (let i = 0; i < toInsert.length; i += batchSize) {
        const batch = toInsert.slice(i, i + batchSize);
        if (batch.length === 0) continue;

        const valuesSql = batch
          .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .join(",");
        const sql = `INSERT OR IGNORE INTO articles (
          title, content, summary, published_at, rss_source_id, source_name,
          url, image_url, video_url, author, category, word_count, reading_time, difficulty
        ) VALUES ${valuesSql}`;

        const params: any[] = [];
        for (const article of batch) {
          params.push(
            article.title,
            article.content,
            article.summary,
            article.publishedAt.toISOString(),
            article.sourceId,
            article.sourceName,
            article.url,
            article.imageUrl,
            article.videoUrl || null,
            article.author,
            article.category,
            article.wordCount,
            article.readingTime,
            article.difficulty,
          );
        }

        const result = await this.databaseService.executeInsert(sql, params);
        insertedCount += result.changes || 0;
      }

      const toUpdateVideoUrl = uniqueArticles.filter(
        (a) =>
          a?.url &&
          typeof a.videoUrl === "string" &&
          a.videoUrl.trim().length > 0,
      );
      for (const article of toUpdateVideoUrl) {
        const result = await this.databaseService.executeInsert(
          'UPDATE articles SET video_url = ? WHERE url = ? AND (video_url IS NULL OR video_url = "")',
          [article.videoUrl, article.url],
        );
        updatedCount += result.changes || 0;
      }

      await this.databaseService.commitTransaction();
    } catch (e) {
      await this.databaseService.rollbackTransaction();
      throw e;
    }

    return {
      insertedArticles,
      insertedCount,
      updatedCount,
      upsertedCount: insertedCount,
    };
  }

  /**
   * Update RSS source stats (unread count, last_updated, etc.) and emit event
   */
  private async updateSourceStats(sourceId: number): Promise<void> {
    try {
      try {
        const sourceConfig = await this.databaseService.executeQuery(
          "SELECT fetch_limit, retention_limit FROM rss_sources WHERE id = ?",
          [sourceId],
        );
        const retentionLimitRaw = sourceConfig[0]?.retention_limit;
        const retentionLimit =
          typeof retentionLimitRaw === "number"
            ? retentionLimitRaw
            : parseInt(String(retentionLimitRaw ?? "100"), 10);

        if (Number.isFinite(retentionLimit) && retentionLimit > 0) {
          const favCountResult = await this.databaseService.executeQuery(
            "SELECT COUNT(*) as count FROM articles WHERE rss_source_id = ? AND is_favorite = 1",
            [sourceId],
          );
          const favCount =
            typeof favCountResult[0]?.count === "number"
              ? favCountResult[0]?.count
              : parseInt(String(favCountResult[0]?.count ?? "0"), 10);
          const keepNonFavorite = Math.max(
            0,
            retentionLimit - (Number.isFinite(favCount) ? favCount : 0),
          );

          await this.databaseService.executeStatement(
            `DELETE FROM articles 
             WHERE id IN (
               SELECT id FROM articles 
               WHERE rss_source_id = ? AND is_favorite = 0
               ORDER BY published_at DESC 
               LIMIT -1 OFFSET ?
             )`,
            [sourceId, keepNonFavorite],
          );
        }
      } catch (e) {
        logger.warn("[CloudSync] Failed to enforce retention_limit:", e);
      }

      const articleCountResult = await this.databaseService.executeQuery(
        "SELECT COUNT(*) as count FROM articles WHERE rss_source_id = ?",
        [sourceId],
      );
      const articleCount = articleCountResult[0]?.count || 0;

      const unreadCountResult = await this.databaseService.executeQuery(
        "SELECT COUNT(*) as count FROM articles WHERE rss_source_id = ? AND is_read = 0",
        [sourceId],
      );
      const unreadCount = unreadCountResult[0]?.count || 0;

      const latestPublishedResult = await this.databaseService.executeQuery(
        "SELECT published_at FROM articles WHERE rss_source_id = ? ORDER BY published_at DESC LIMIT 1",
        [sourceId],
      );
      const latestPublishedAt = latestPublishedResult[0]?.published_at ?? null;

      await this.databaseService.executeStatement(
        "UPDATE rss_sources SET last_updated = ?, latest_published_at = ?, article_count = ?, unread_count = ? WHERE id = ?",
        [
          new Date().toISOString(),
          latestPublishedAt,
          articleCount,
          unreadCount,
          sourceId,
        ],
      );

      // Emit event to update UI
      cacheEventEmitter.emit({
        type: "updateRSSStats",
        reason: "cloudSync",
        sourceId,
      });
    } catch (error) {
      logger.error("[CloudSync] Error updating source stats:", error);
    }
  }
}

export const cloudSyncService = new CloudSyncService();
