/**
 * RSS 服务主入口
 * 统一管理本地直连和代理模式，提供 RSS 源的 CRUD 操作
 */

import { DatabaseService } from '../../database/DatabaseService';
import { RSSSource, Article, AppError, FetchArticlesWithStatsResult, RefreshSourcesResult } from '../../types';
import { SettingsService } from '../SettingsService';
import { cloudSyncService } from './CloudSyncService';
import { logger } from './RSSUtils';
import { InteractionManager } from 'react-native';
import { cloudConfigService } from '../CloudConfigService';

export class RSSService {
  private static instance: RSSService;
  private databaseService: DatabaseService;

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
  }

  public static getInstance(): RSSService {
    if (!RSSService.instance) {
      RSSService.instance = new RSSService();
    }
    return RSSService.instance;
  }

  // =================== RSS 源 CRUD 操作 ===================

  /**
   * 添加 RSS 源
   */
  public async addRSSSource(
    url: string,
    title?: string,
    contentType: 'text' | 'image_text' = 'image_text',
    category: string = '技术',
    sourceMode: 'direct' | 'proxy' = 'direct',
    fetchLimit: number = 50,
    retentionLimit: number = 100
  ): Promise<RSSSource> {
    try {
      // 🔥 清理 URL：去除空格和末尾多余斜杠
      let cleanUrl = url.trim();
      if (cleanUrl.match(/\/[^/]+\/$/) && !cleanUrl.endsWith('://')) {
        cleanUrl = cleanUrl.replace(/\/$/, '');
        logger.info(`[addRSSSource] 已移除末尾斜杠: ${url} -> ${cleanUrl}`);
      }

      let resolvedName = '';
      let resolvedDescription: string | undefined = undefined;
      let resolvedCategory = category;

      const publicFeed = await cloudSyncService.lookupPublicFeed(cleanUrl).catch(() => null);
      if (publicFeed && publicFeed.url) {
        cleanUrl = String(publicFeed.url);
        resolvedName = String(publicFeed.name || '');
        resolvedDescription = publicFeed.description ? String(publicFeed.description) : undefined;
        resolvedCategory = publicFeed.category ? String(publicFeed.category) : resolvedCategory;
      } else {
        const feedInfo = await cloudSyncService.validateFeed(cleanUrl);
        if (feedInfo.url && feedInfo.url !== cleanUrl) {
          logger.info(`[addRSSSource] URL 更新: ${cleanUrl} -> ${feedInfo.url}`);
          cleanUrl = feedInfo.url;
        }
        resolvedDescription = feedInfo.description;
        const titleCandidate = (title || '').trim();
        if (titleCandidate && titleCandidate !== '未命名RSS源') {
          resolvedName = titleCandidate;
        } else {
          resolvedName = feedInfo.title || 'Unknown Feed';
        }
      }

      // 3. 保存到本地数据库
      const rssSource: Omit<RSSSource, 'id'> = {
        sortOrder: 0,
        name: resolvedName || 'Unknown Feed',
        url: cleanUrl,
        category: resolvedCategory,
        contentType,
        sourceMode,
        isActive: true,
        lastFetchAt: new Date(),
        errorCount: 0,
        description: resolvedDescription,
        groupId: null, // 新源默认未分组
        fetchLimit,
        retentionLimit,
      };

      const existingRows = await this.databaseService.executeQuery(
        'SELECT * FROM rss_sources WHERE url = ?',
        [rssSource.url]
      );

      let newSource: RSSSource;
      if (existingRows.length > 0) {
        const existing = this.mapRSSSourceRow(existingRows[0]);
        await this.databaseService.executeStatement(
          `UPDATE rss_sources SET 
            title = ?, description = ?, category = ?, content_type = ?, 
            source_mode = ?, is_active = ?, last_updated = ?, fetch_limit = ?, retention_limit = ?
           WHERE id = ?`,
          [
            rssSource.name,
            rssSource.description,
            rssSource.category,
            rssSource.contentType,
            rssSource.sourceMode,
            rssSource.isActive ? 1 : 0,
            rssSource.lastFetchAt?.toISOString() || new Date().toISOString(),
            rssSource.fetchLimit,
            rssSource.retentionLimit,
            existing.id,
          ]
        );
        newSource = { ...existing, ...rssSource, id: existing.id, groupId: existing.groupId };
      } else {
        const result = await this.databaseService.executeInsert(
          `INSERT INTO rss_sources (url, title, description, category, content_type, source_mode, is_active, last_updated, fetch_limit, retention_limit) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rssSource.url,
            rssSource.name,
            rssSource.description,
            rssSource.category,
            rssSource.contentType,
            rssSource.sourceMode,
            rssSource.isActive ? 1 : 0,
            rssSource.lastFetchAt?.toISOString() || new Date().toISOString(),
            rssSource.fetchLimit,
            rssSource.retentionLimit,
          ]
        );
        newSource = {
          id: Number(result.insertId),
          ...rssSource,
        };
      }

      await cloudSyncService.fetchArticlesWithStats(newSource, { triggerRefresh: true });

      this.triggerSync();
      return newSource;
    } catch (error) {
      logger.error('Error adding RSS source:', error);
      throw new AppError({
        code: 'RSS_ADD_ERROR',
        message: `Failed to add RSS source: ${url.trim()}`,
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 获取所有 RSS 源
   */
  public async getAllRSSSources(): Promise<RSSSource[]> {
    try {
      const results = await this.databaseService.executeQuery(`
        SELECT * FROM rss_sources ORDER BY sort_order ASC, id ASC
      `);

      return results.map(this.mapRSSSourceRow);
    } catch (error) {
      logger.error('Error getting RSS sources:', error);
      return [];
    }
  }

  /**
   * 根据 ID 获取 RSS 源
   */
  public async getSourceById(id: number): Promise<RSSSource | null> {
    try {
      const results = await this.databaseService.executeQuery(
        'SELECT * FROM rss_sources WHERE id = ?',
        [id]
      );

      if (results.length === 0) {
        return null;
      }

      return this.mapRSSSourceRow(results[0]);
    } catch (error) {
      logger.error('Error getting RSS source by ID:', error);
      return null;
    }
  }

  /**
   * 获取活跃的 RSS 源
   */
  public async getActiveRSSSources(): Promise<RSSSource[]> {
    try {
      const results = await this.databaseService.executeQuery(
        'SELECT * FROM rss_sources WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
      );

      return results.map(this.mapRSSSourceRow);
    } catch (error) {
      logger.error('Error getting active RSS sources:', error);
      return [];
    }
  }

  /**
   * 更新 RSS 源排序
   */
  public async updateSourcesOrder(sourceOrder: { id: number; sortOrder: number }[]): Promise<void> {
    try {
      for (const item of sourceOrder) {
        await this.databaseService.executeStatement(
          'UPDATE rss_sources SET sort_order = ? WHERE id = ?',
          [item.sortOrder, item.id]
        );
      }
      this.triggerSync();
    } catch (error) {
      logger.error('Error updating RSS sources order:', error);
      throw error;
    }
  }

  /**
   * 更新 RSS 源
   */
  public async updateRSSSource(id: number, updates: Partial<RSSSource>): Promise<void> {
    try {
      const setClause = [];
      const values = [];

      if (updates.name !== undefined) {
        setClause.push('title = ?');
        values.push(updates.name);
      }
      if (updates.url !== undefined) {
        setClause.push('url = ?');
        values.push(updates.url);
      }
      if (updates.description !== undefined) {
        setClause.push('description = ?');
        values.push(updates.description);
      }
      if (updates.category !== undefined) {
        setClause.push('category = ?');
        values.push(updates.category);
      }
      if (updates.contentType !== undefined) {
        setClause.push('content_type = ?');
        values.push(updates.contentType);
      }
      if (updates.isActive !== undefined) {
        setClause.push('is_active = ?');
        values.push(updates.isActive ? 1 : 0);
      }
      if (updates.updateFrequency !== undefined) {
        setClause.push('update_frequency = ?');
        values.push(updates.updateFrequency);
      }
      if (updates.sourceMode !== undefined) {
        setClause.push('source_mode = ?');
        values.push(updates.sourceMode);
      }
      if (updates.fetchLimit !== undefined) {
        setClause.push('fetch_limit = ?');
        values.push(updates.fetchLimit);
      }
      if (updates.retentionLimit !== undefined) {
        setClause.push('retention_limit = ?');
        values.push(updates.retentionLimit);
      }

      if (setClause.length === 0) {
        return;
      }

      values.push(id);

      const sql = `UPDATE rss_sources SET ${setClause.join(', ')} WHERE id = ?`;
      await this.databaseService.executeStatement(sql, values);
      this.triggerSync();
    } catch (error) {
      logger.error('Error updating RSS source:', error);
      throw new AppError({
        code: 'RSS_UPDATE_ERROR',
        message: `Failed to update RSS source: ${id}`,
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 删除 RSS 源
   */
  public async deleteRSSSource(id: number): Promise<void> {
    try {
      const source = await this.getSourceById(id);
      if (!source) return;

      if (!source) return;

      // 删除本地数据
      await this.databaseService.executeStatement(
        'DELETE FROM articles WHERE rss_source_id = ?',
        [id]
      );

      await this.databaseService.executeStatement(
        'DELETE FROM rss_sources WHERE id = ?',
        [id]
      );
      this.triggerSync();
    } catch (error) {
      logger.error('Error deleting RSS source:', error);
      throw new AppError({
        code: 'RSS_DELETE_ERROR',
        message: `Failed to delete RSS source: ${id}`,
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 获取 RSS 源文章 - 统一入口
   */
  public async fetchArticlesFromSource(
    source: RSSSource,
    options: { mode?: 'sync' | 'refresh' } = {}
  ): Promise<Article[]> {
    const result = await this.fetchArticlesFromSourceWithStats(source, options);
    return result.articles;
  }

  public async fetchArticlesFromSourceWithStats(
    source: RSSSource,
    options: { mode?: 'sync' | 'refresh' } = {}
  ): Promise<FetchArticlesWithStatsResult> {
    if (source.isActive === false) {
      logger.info(`[fetchArticlesFromSource] 源已停用，跳过刷新: ${source.name}`);
      return { articles: [], insertedCount: 0, updatedCount: 0, upsertedCount: 0 };
    }

    logger.info(`[fetchArticlesFromSource] ☁️ 云端模式: ${source.name}`);
    try {
      return await cloudSyncService.fetchArticlesWithStats(source);
    } catch (error) {
      logger.error(`[fetchArticlesFromSource] 云端同步失败: ${source.name}`, error);
      throw error;
    }
  }

  /**
   *后台刷新所有 RSS 源 (使用优化的并发控制)
   * 核心优化：使用简单但有效的 p-limit 模例
   */
  public async refreshAllSourcesBackground(
    options: {
      maxConcurrent?: number;
      onProgress?: (current: number, total: number, sourceName: string) => void;
      onError?: (error: Error, sourceName: string) => void;
      onArticlesReady?: (articles: Article[], sourceName: string) => void;
    } = {}
  ): Promise<RefreshSourcesResult> {
    return this.refreshSources([], options);
  }

  public async refreshAllSources(options: any = {}): Promise<RefreshSourcesResult> {
    return this.refreshAllSourcesBackground(options);
  }

  public async forceCloudRefreshSources(sourceIds: number[], options: any = {}): Promise<RefreshSourcesResult> {
    return this.refreshSources(sourceIds, options);
  }

  public async refreshSources(
    sourceIds: number[] = [],
    options: {
      maxConcurrent?: number;
      onProgress?: (current: number, total: number, sourceName: string) => void;
      onError?: (error: Error, sourceName: string) => void;
      onArticlesReady?: (articles: Article[], sourceName: string) => void;
      mode?: string;
    } = {}
  ): Promise<RefreshSourcesResult> {
    const { maxConcurrent = 3, onProgress, onError, onArticlesReady } = options;
    const allSources = await this.getActiveRSSSources();
    const sources = sourceIds.length > 0
      ? allSources.filter(s => sourceIds.includes(s.id))
      : allSources;

    if (sources.length === 0) {
      return { success: 0, failed: 0, totalArticles: 0, insertedCount: 0, updatedCount: 0, upsertedCount: 0, errors: [] };
    }

    // 使用简单的并发控制器
    const limiter = this.createLimiter(maxConcurrent);

    let success = 0;
    let failed = 0;
    let totalArticles = 0;
    let insertedCount = 0;
    let updatedCount = 0;
    let upsertedCount = 0;
    const errors: Array<{ source: string; error: string }> = [];
    let completed = 0;

    const tasks = sources.map(source =>
      limiter(() =>
        new Promise<void>((resolve, reject) => {
          InteractionManager.runAfterInteractions(() => {
            this.fetchArticlesFromSourceWithStats(source)
              .then((result) => {
                success++;
                totalArticles += result.insertedCount;
                insertedCount += result.insertedCount;
                updatedCount += result.updatedCount;
                upsertedCount += result.upsertedCount;
                completed++;

                if (onArticlesReady && result.articles.length > 0) {
                  onArticlesReady(result.articles, source.name);
                }

                onProgress?.(completed, sources.length, source.name);
                resolve();
              })
              .catch((error) => {
                failed++;
                completed++;
                const errorMsg = error.message || '未知错误';
                errors.push({ source: source.name, error: errorMsg });

                onError?.(error, source.name);
                onProgress?.(completed, sources.length, source.name);
                // 即使失败也 resolve，避免中断整个 Promise.all
                resolve();
              });
          });
        })
      )
    );

    await Promise.all(tasks);

    return { success, failed, totalArticles, insertedCount, updatedCount, upsertedCount, errors };
  }

  /**
   * 【辅助】不需要依赖外部库的 p-limit 模例
   * 配置最大3个同时请求，防止主线程阻塞或服务器过载
   */
  private createLimiter(maxConcurrent: number = 3) {
    let running = 0;
    const queue: Array<(value: void) => void> = [];

    const run = async (fn: () => Promise<any>) => {
      while (running >= maxConcurrent) {
        await new Promise<void>(resolve => queue.push(resolve));
      }
      running++;
      try {
        return await fn();
      } finally {
        running--;
        const resolve = queue.shift();
        if (resolve) resolve();
      }
    };

    return (fn: () => Promise<any>) => run(fn);
  }


  /**
   * 验证 RSS 源
   */
  public async validateRSSFeed(url: string): Promise<{
    title?: string;
    description?: string;
    language?: string;
  }> {
    const data = await cloudSyncService.validateFeed(url);
    return {
      title: data.title,
      description: data.description,
      language: data.language,
    };
  }

  /**
   * 导出源用于同步（包含分组名称）
   */
  public async exportSourcesForSync(): Promise<any[]> {
    try {
      const query = `
        SELECT s.*, g.name as group_name 
        FROM rss_sources s
        LEFT JOIN rss_groups g ON s.group_id = g.id
        ORDER BY s.sort_order ASC
      `;
      const results = await this.databaseService.executeQuery(query);
      return results.map(row => ({
        url: row.url,
        name: row.title,
        description: row.description,
        category: row.category,
        contentType: row.content_type,
        sourceMode: row.source_mode,
        isActive: Boolean(row.is_active),
        fetchLimit: row.fetch_limit,
        retentionLimit: row.retention_limit,
        groupName: row.group_name,
        sortOrder: row.sort_order,
        updateFrequency: row.update_frequency,
      }));
    } catch (error) {
      logger.error('Error exporting sources for sync:', error);
      return [];
    }
  }

  /**
   * 导入同步的源
   */
  public async importSourcesFromSync(sources: any[]): Promise<void> {
    try {
      await this.databaseService.beginTransaction();

      // 获取所有分组映射 (name -> id)
      const groups = await this.databaseService.executeQuery('SELECT id, name FROM rss_groups');
      const groupMap = new Map(groups.map((g: any) => [g.name, g.id]));

      for (const source of sources) {
        // 解析 Group ID
        let groupId = null;
        if (source.groupName && groupMap.has(source.groupName)) {
          groupId = groupMap.get(source.groupName);
        }

        // 检查是否存在 (by URL)
        const existing = await this.databaseService.executeQuery(
          'SELECT id FROM rss_sources WHERE url = ?',
          [source.url]
        );

        if (existing.length > 0) {
          // Update
          const id = existing[0].id;
          await this.databaseService.executeStatement(
            `UPDATE rss_sources SET 
              title = ?, description = ?, category = ?, content_type = ?, 
              source_mode = ?, is_active = ?, fetch_limit = ?, retention_limit = ?, 
              group_id = ?, sort_order = ?, update_frequency = ?
             WHERE id = ?`,
            [
              source.name, source.description, source.category, source.contentType,
              source.sourceMode, source.isActive ? 1 : 0,
              source.fetchLimit ?? source.maxArticles ?? 50,
              source.retentionLimit ?? source.maxArticles ?? 100,
              groupId, source.sortOrder, source.updateFrequency,
              id
            ]
          );
        } else {
          // Insert
          await this.databaseService.executeStatement(
            `INSERT INTO rss_sources 
              (url, title, description, category, content_type, source_mode, is_active, fetch_limit, retention_limit, group_id, sort_order, update_frequency, last_updated)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              source.url, source.name, source.description, source.category,
              source.contentType, source.sourceMode, source.isActive ? 1 : 0,
              source.fetchLimit ?? source.maxArticles ?? 50,
              source.retentionLimit ?? source.maxArticles ?? 100,
              groupId, source.sortOrder, source.updateFrequency,
              new Date().toISOString()
            ]
          );
        }
      }

      await this.databaseService.commitTransaction();
    } catch (error) {
      await this.databaseService.rollbackTransaction();
      logger.error('Error importing sources from sync:', error);
      throw error;
    }
  }

  private syncTimer: any = null;

  private triggerSync() {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(async () => {
      this.syncTimer = null;
      try {
        // Use require to avoid circular dependency
        const { configSyncService } = require('../ConfigSyncService');
        if (configSyncService) {
          await configSyncService.syncConfig('push');
        }
      } catch (e) {
        // Ignore errors during sync trigger
      }
    }, 2000);
  }

  // =================== 私有方法 ===================

  /**
   * 数据库行映射为 RSSSource 对象
   */
  private mapRSSSourceRow(row: any): RSSSource {
    return {
      id: Number(row.id),
      sortOrder: row.sort_order || 0,
      name: row.title,
      url: row.url,
      description: row.description,
      category: row.category || 'General',
      contentType: row.content_type || 'image_text',
      sourceMode: row.source_mode || 'direct',
      isActive: Boolean(row.is_active),
      lastFetchAt: row.last_updated ? new Date(row.last_updated) : new Date(),
      errorCount: row.error_count || 0,
      updateFrequency: row.update_frequency,
      article_count: row.article_count || 0,
      unread_count: row.unread_count || 0,
      last_updated: row.last_updated,
      latest_published_at: row.latest_published_at,
      // 📦 分组字段
      groupId: row.group_id || null,
      groupSortOrder: row.group_sort_order || 0,
      fetchLimit: row.fetch_limit ?? 50,
      retentionLimit: row.retention_limit ?? 100,
      maxArticles: row.max_articles,
    };
  }
}

export const rssService = RSSService.getInstance();
