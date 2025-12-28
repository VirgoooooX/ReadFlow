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
import { InteractionManager } from 'react-native';

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
    sourceMode: 'direct' | 'proxy' = 'direct'
  ): Promise<RSSSource> {
    try {
      // 🔥 清理 URL：去除空格和末尾多余斜杠
      let cleanUrl = url.trim();
      if (cleanUrl.match(/\/[^/]+\/$/) && !cleanUrl.endsWith('://')) {
        cleanUrl = cleanUrl.replace(/\/$/, '');
        logger.info(`[addRSSSource] 已移除末尾斜杠: ${url} -> ${cleanUrl}`);
      }
      
      // 1. 验证 RSS 源
      const feedInfo = await localRSSService.validateRSSFeed(cleanUrl);
      
      // 🔥 如果验证过程中发生了 URL 变更（例如 HTTPS -> HTTP 降级），使用新的 URL
      if (feedInfo.url && feedInfo.url !== cleanUrl) {
        logger.info(`[addRSSSource] URL 更新: ${cleanUrl} -> ${feedInfo.url}`);
        cleanUrl = feedInfo.url;
      }
      
      // 2. 代理模式：调用服务端订阅 API（仅当源级别选择代理模式时）
      if (sourceMode === 'proxy') {
        const proxyConfig = await SettingsService.getInstance().getProxyModeConfig();
        if (proxyConfig.enabled && proxyConfig.token) {
          await proxyRSSService.subscribeToProxyServer(cleanUrl, title, proxyConfig);
        }
      }
      
      // 3. 保存到本地数据库
      const rssSource: Omit<RSSSource, 'id'> = {
        sortOrder: 0,
        name: title || feedInfo.title || 'Unknown Feed',
        url: cleanUrl,
        category,
        contentType,
        sourceMode,
        isActive: true,
        lastFetchAt: new Date(),
        errorCount: 0,
        description: feedInfo.description,
        groupId: null, // 新源默认未分组
        maxArticles: 20, // 默认限制 20 篇
      };

      const result = await this.databaseService.executeInsert(
        `INSERT INTO rss_sources (url, title, description, category, content_type, source_mode, is_active, last_updated, max_articles) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          rssSource.url,
          rssSource.name,
          rssSource.description,
          rssSource.category,
          rssSource.contentType,
          rssSource.sourceMode,
          rssSource.isActive ? 1 : 0,
          rssSource.lastFetchAt?.toISOString() || new Date().toISOString(),
          rssSource.maxArticles,
        ]
      );

      const newSource: RSSSource = {
        id: Number(result.insertId),
        ...rssSource,
      };

      // 4. 直连模式：立即获取文章（忽略全局代理设置，使用源级别配置）
      if (sourceMode === 'direct') {
        await localRSSService.fetchArticlesWithRetry(newSource, 3);
      } else {
        // 代理模式：立即获取文章
        const proxyConfig = await SettingsService.getInstance().getProxyModeConfig();
        if (proxyConfig.serverUrl) {
          await proxyRSSService.fetchArticlesFromProxy(newSource, proxyConfig, { mode: 'refresh' });
        }
      }

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
      if (updates.maxArticles !== undefined) {
        setClause.push('max_articles = ?');
        values.push(updates.maxArticles);
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
   * 根据源级别的 sourceMode 判断是否使用代理
   */
  public async fetchArticlesFromSource(
    source: RSSSource,
    options: { mode?: 'sync' | 'refresh' } = {}
  ): Promise<Article[]> {
    // 根据源级别配置判断
    if (source.sourceMode === 'proxy') {
      // 代理模式
      const proxyConfig = await SettingsService.getInstance().getProxyModeConfig();
      if (!proxyConfig.serverUrl) {
        logger.warn(`[fetchArticlesFromSource] 源 ${source.name} 配置为代理模式，但未配置代理服务器，回退到直连模式`);
        return await localRSSService.fetchArticlesWithRetry(source, 3);
      }
      const mode = options.mode || 'refresh';
      logger.info(`[fetchArticlesFromSource] 🚀 代理模式: ${source.name} (mode: ${mode})`);
      return await proxyRSSService.fetchArticlesFromProxy(source, proxyConfig, { mode });
    } else {
      // 直连模式
      logger.info(`[fetchArticlesFromSource] 直连模式: ${source.name}`);
      return await localRSSService.fetchArticlesWithRetry(source, 3);
    }
  }

  /**
   * 刷新所有活跃 RSS 源
   * 根据每个源的 sourceMode 分别处理
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

    // 按 sourceMode 分组
    const directSources = sources.filter(s => s.sourceMode !== 'proxy');
    const proxySources = sources.filter(s => s.sourceMode === 'proxy');
    
    let success = 0;
    let failed = 0;
    let totalArticles = 0;
    const errors: Array<{ source: string; error: string }> = [];
    let completed = 0;
    const total = sources.length;

    // 处理直连源
    if (directSources.length > 0) {
      logger.info(`[RefreshAllSources] 直连模式: ${directSources.length} 个源`);
      const directResult = await localRSSService.refreshSources(directSources, {
        ...options,
        onProgress: (current, _, sourceName) => {
          completed++;
          options.onProgress?.(completed, total, sourceName);
        },
      });
      success += directResult.success;
      failed += directResult.failed;
      totalArticles += directResult.totalArticles;
      errors.push(...directResult.errors);
    }

    // 处理代理源
    if (proxySources.length > 0) {
      const proxyConfig = await SettingsService.getInstance().getProxyModeConfig();
      if (proxyConfig.serverUrl) {
        logger.info(`[RefreshAllSources] 代理模式: ${proxySources.length} 个源`);
        const mode = options.mode || 'refresh';
        
        for (const source of proxySources) {
          try {
            const articles = await proxyRSSService.fetchArticlesFromProxy(source, proxyConfig, { mode });
            success++;
            totalArticles += articles.length;
          } catch (error: any) {
            failed++;
            errors.push({ source: source.name, error: error.message || '未知错误' });
            options.onError?.(error, source.name);
          }
          completed++;
          options.onProgress?.(completed, total, source.name);
        }
      } else {
        logger.warn('[RefreshAllSources] 有代理源但未配置代理服务器，跳过');
        failed += proxySources.length;
        for (const source of proxySources) {
          errors.push({ source: source.name, error: '未配置代理服务器' });
          completed++;
          options.onProgress?.(completed, total, source.name);
        }
      }
    }

    return { success, failed, totalArticles, errors };
  }

  /**
   * 刷新指定的 RSS 源列表
   */
  public async refreshSources(
    sourceIds: number[],
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
    
    // 1. 获取所有活跃源
    const allSources = await this.getActiveRSSSources();
    
    // 2. 过滤出需要刷新的源（且必须是活跃的）
    const sourcesToRefresh = allSources.filter(s => sourceIds.includes(s.id));
    
    if (sourcesToRefresh.length === 0) {
      return { success: 0, failed: 0, totalArticles: 0, errors: [] };
    }

    // 3. 复用并发逻辑
    const limiter = this.createLimiter(maxConcurrent);
    
    let success = 0;
    let failed = 0;
    let totalArticles = 0;
    const errors: Array<{ source: string; error: string }> = [];
    let completed = 0;
    const total = sourcesToRefresh.length;

    const tasks = sourcesToRefresh.map(source => 
      limiter(() => 
        new Promise<void>((resolve, reject) => {
          InteractionManager.runAfterInteractions(() => {
            this.fetchArticlesFromSource(source)
              .then((articles) => {
                success++;
                totalArticles += articles.length;
                completed++;
                
                if (onArticlesReady && articles.length > 0) {
                  onArticlesReady(articles, source.name);
                }
                
                onProgress?.(completed, total, source.name);
                resolve();
              })
              .catch((error) => {
                failed++;
                completed++;
                const errorMsg = error.message || '未知错误';
                errors.push({ source: source.name, error: errorMsg });
                
                onError?.(error, source.name);
                onProgress?.(completed, total, source.name);
                // 即使失败也 resolve，避免中断整个 Promise.all
                resolve(); 
              });
          });
        })
      )
    );

    await Promise.all(tasks);

    return { success, failed, totalArticles, errors };
  }

  /**
   * 【改进】后台刷新所有 RSS 源 (使用优化的并发控制)
   * 核心优化：使用简单但有效的 p-limit 模例
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

    // 使用简单的并发控制器
    const limiter = this.createLimiter(maxConcurrent);
    
    let success = 0;
    let failed = 0;
    let totalArticles = 0;
    const errors: Array<{ source: string; error: string }> = [];
    let completed = 0;

    const tasks = sources.map(source => 
      limiter(() => 
        new Promise<void>((resolve, reject) => {
          InteractionManager.runAfterInteractions(() => {
            this.fetchArticlesFromSource(source)
              .then((articles) => {
                success++;
                totalArticles += articles.length;
                completed++;
                
                if (onArticlesReady && articles.length > 0) {
                  onArticlesReady(articles, source.name);
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

    return { success, failed, totalArticles, errors };
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
      sourceMode: row.source_mode || 'direct',
      isActive: Boolean(row.is_active),
      lastFetchAt: row.last_updated ? new Date(row.last_updated) : new Date(),
      errorCount: row.error_count || 0,
      updateFrequency: row.update_frequency,
      article_count: row.article_count || 0,
      unread_count: row.unread_count || 0,
      last_updated: row.last_updated,
      // 📦 分组字段
      groupId: row.group_id || null,
      groupSortOrder: row.group_sort_order || 0,
      maxArticles: row.max_articles || 20,
    };
  }
}

export const rssService = RSSService.getInstance();
