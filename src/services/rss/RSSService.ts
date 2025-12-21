/**
 * RSS 服务主入口
 * 统一管理本地直连和代理模式，提供 RSS 源的 CRUD 操作
 */

import { DatabaseService } from '../../database/DatabaseService';
import { RSSSource, Article, AppError } from '../../types';
import { SettingsService } from '../SettingsService';
import { localRSSService } from './LocalRSSService';
import { proxyRSSService } from './ProxyRSSService';
import { logger } from './RSSUtils';

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
    category: string = '技术'
  ): Promise<RSSSource> {
    try {
      // 1. 验证 RSS 源
      const feedInfo = await localRSSService.validateRSSFeed(url);
      
      // 2. 代理模式：调用服务端订阅 API
      const proxyConfig = await SettingsService.getInstance().getProxyModeConfig();
      if (proxyConfig.enabled && proxyConfig.token) {
        await proxyRSSService.subscribeToProxyServer(url, title, proxyConfig);
      }
      
      // 3. 保存到本地数据库
      const rssSource: Omit<RSSSource, 'id'> = {
        sortOrder: 0,
        name: title || feedInfo.title || 'Unknown Feed',
        url,
        category,
        contentType,
        isActive: true,
        lastFetchAt: new Date(),
        errorCount: 0,
        description: feedInfo.description,
        sourceMode: undefined,
      };

      const result = await this.databaseService.executeInsert(
        `INSERT INTO rss_sources (url, title, description, category, content_type, is_active, last_updated) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          rssSource.url,
          rssSource.name,
          rssSource.description,
          rssSource.category,
          rssSource.contentType,
          rssSource.isActive ? 1 : 0,
          rssSource.lastFetchAt?.toISOString() || new Date().toISOString(),
        ]
      );

      const newSource: RSSSource = {
        id: Number(result.insertId),
        ...rssSource,
      };

      // 4. 直连模式：立即获取文章
      if (!proxyConfig.enabled) {
        await this.fetchArticlesFromSource(newSource);
      }

      return newSource;
    } catch (error) {
      logger.error('Error adding RSS source:', error);
      throw new AppError({
        code: 'RSS_ADD_ERROR',
        message: `Failed to add RSS source: ${url}`,
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
      
      if (setClause.length === 0) {
        return;
      }
      
      values.push(id);
      
      const sql = `UPDATE rss_sources SET ${setClause.join(', ')} WHERE id = ?`;
      await this.databaseService.executeStatement(sql, values);
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
      
      // 代理模式：调用服务端 API
      if (source.sourceMode === 'proxy') {
        const config = await SettingsService.getInstance().getProxyModeConfig();
        if (config.enabled && config.token) {
          try {
            await fetch(`${config.serverUrl}/api/subscribe/${source.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${config.token}` },
            });
          } catch (error) {
            logger.warn('Failed to delete source from proxy server:', error);
          }
        }
      }
      
      // 删除本地数据
      await this.databaseService.executeStatement(
        'DELETE FROM articles WHERE rss_source_id = ?',
        [id]
      );
      
      await this.databaseService.executeStatement(
        'DELETE FROM rss_sources WHERE id = ?',
        [id]
      );
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

  // =================== 文章获取 ===================

  /**
   * 获取 RSS 源文章 - 统一入口
   * 内部自动判断是否使用代理
   * @param source - RSS 源
   * @param options.mode - 代理模式下的同步方式：'sync' 仅同步，'refresh' 刷新源+同步
   */
  public async fetchArticlesFromSource(
    source: RSSSource,
    options: { mode?: 'sync' | 'refresh' } = {}
  ): Promise<Article[]> {
    const proxyConfig = await SettingsService.getInstance().getProxyModeConfig();
    
    if (proxyConfig.enabled && proxyConfig.token) {
      // 代理模式：默认使用 refresh 模式让服务端刷新该源
      const mode = options.mode || 'refresh';
      console.log(`[fetchArticlesFromSource] 🚀 代理模式: ${source.name} (mode: ${mode})`);
      return await proxyRSSService.fetchArticlesFromProxy(source, proxyConfig, { mode });
    } else {
      // 直连模式
      console.log(`[fetchArticlesFromSource] 直连模式: ${source.name}`);
      return await localRSSService.fetchArticlesWithRetry(source, 3);
    }
  }

  /**
   * 刷新所有活跃 RSS 源
   * @param options.mode - 代理模式下的同步方式：'sync' 仅同步，'refresh' 刷新源+同步
   */
  public async refreshAllSources(
    options: {
      mode?: 'sync' | 'refresh';
      maxConcurrent?: number;
      onProgress?: (current: number, total: number, sourceName: string) => void;
      onError?: (error: Error, sourceName: string) => void;
    } = {}
  ): Promise<{ 
    success: number; 
    failed: number; 
    totalArticles: number;
    errors: Array<{ source: string; error: string }>;
  }> {
    const sources = await this.getActiveRSSSources();
    
    if (sources.length === 0) {
      return { success: 0, failed: 0, totalArticles: 0, errors: [] };
    }

    const proxyConfig = await SettingsService.getInstance().getProxyModeConfig();
    
    if (proxyConfig.enabled && proxyConfig.token) {
      // 代理模式：默认使用 'refresh' 模式让服务端先拓取最新文章
      const mode = options.mode || 'refresh';
      console.log(`[RefreshAllSources] 🚀 代理模式 (${mode})`);
      return await proxyRSSService.syncFromProxyServer({ ...options, mode });
    } else {
      // 直连模式
      console.log('[RefreshAllSources] 直连模式');
      return await localRSSService.refreshSources(sources, options);
    }
  }

  /**
   * 后台刷新所有 RSS 源
   */
  public async refreshAllSourcesBackground(
    options: {
      maxConcurrent?: number;
      onProgress?: (current: number, total: number, sourceName: string) => void;
      onError?: (error: Error, sourceName: string) => void;
      onArticlesReady?: (articles: Article[], sourceName: string) => void;
    } = {}
  ): Promise<{ 
    success: number; 
    failed: number; 
    totalArticles: number;
    errors: Array<{ source: string; error: string }>;
  }> {
    const { maxConcurrent = 3, onProgress, onError, onArticlesReady } = options;
    const sources = await this.getActiveRSSSources();
    
    if (sources.length === 0) {
      return { success: 0, failed: 0, totalArticles: 0, errors: [] };
    }

    let success = 0;
    let failed = 0;
    let totalArticles = 0;
    const errors: Array<{ source: string; error: string }> = [];
    let completed = 0;

    const executeWithConcurrency = async (sources: RSSSource[]) => {
      const executing: Promise<void>[] = [];
      
      for (const source of sources) {
        const promise = this.fetchArticlesFromSource(source)
          .then((articles) => {
            success++;
            totalArticles += articles.length;
            completed++;
            
            if (onArticlesReady && articles.length > 0) {
              onArticlesReady(articles, source.name);
            }
            
            onProgress?.(completed, sources.length, source.name);
          })
          .catch((error) => {
            failed++;
            completed++;
            const errorMsg = error.message || '未知错误';
            errors.push({ source: source.name, error: errorMsg });
            
            onError?.(error, source.name);
            onProgress?.(completed, sources.length, source.name);
          });

        executing.push(promise);

        if (executing.length >= maxConcurrent) {
          await Promise.race(executing);
          for (let i = executing.length - 1; i >= 0; i--) {
            if (await Promise.race([executing[i].then(() => true), Promise.resolve(false)])) {
              executing.splice(i, 1);
              break;
            }
          }
        }
      }

      await Promise.all(executing);
    };

    await executeWithConcurrency(sources);

    return { success, failed, totalArticles, errors };
  }

  /**
   * 同步所有源到代理服务器
   */
  public async syncAllSourcesWithProxyServer(): Promise<void> {
    const proxyConfig = await SettingsService.getInstance().getProxyModeConfig();
    if (!proxyConfig.enabled || !proxyConfig.token) {
      throw new Error('代理模式未启用');
    }
    
    const sources = await this.getAllRSSSources();
    await proxyRSSService.syncAllSourcesToProxy(sources, proxyConfig);
  }

  /**
   * 验证 RSS 源
   */
  public async validateRSSFeed(url: string): Promise<{
    title?: string;
    description?: string;
    language?: string;
  }> {
    return await localRSSService.validateRSSFeed(url);
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
      isActive: Boolean(row.is_active),
      lastFetchAt: row.last_updated ? new Date(row.last_updated) : new Date(),
      errorCount: row.error_count || 0,
      updateFrequency: row.update_frequency,
      article_count: row.article_count || 0,
      unread_count: row.unread_count || 0,
      last_updated: row.last_updated,
    };
  }
}

export const rssService = RSSService.getInstance();
