/**
 * 代理模式 RSS 服务
 * 
 * 极简代理架构：
 * - 服务端只做代理转发 + 图片 URL 替换
 * - 客户端复用本地解析逻辑 (LocalRSSService)
 * 
 * 保留的方法（供未来 JSON 方案使用）：
 * - subscribeToProxyServer() - 订阅源到服务器
 * - syncAllSourcesToProxy() - 批量同步订阅列表
 * - acknowledgeItems() - ACK 确认
 */

import { DatabaseService } from '../../database/DatabaseService';
import { RSSSource, Article, ProxyModeConfig } from '../../types';
import { SettingsService } from '../SettingsService';
import { localRSSService } from './LocalRSSService';
import { logger } from './RSSUtils';

export class ProxyRSSService {
  private static instance: ProxyRSSService;
  private databaseService: DatabaseService;

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
  }

  public static getInstance(): ProxyRSSService {
    if (!ProxyRSSService.instance) {
      ProxyRSSService.instance = new ProxyRSSService();
    }
    return ProxyRSSService.instance;
  }

  // =================== 公共方法 ===================

  /**
   * 获取代理配置
   */
  public async getProxyConfig(): Promise<ProxyModeConfig> {
    return await SettingsService.getInstance().getProxyModeConfig();
  }

  /**
   * 检查代理模式是否启用
   */
  public async isProxyEnabled(): Promise<boolean> {
    const config = await this.getProxyConfig();
    return config.enabled && !!config.token;
  }

  /**
   * 订阅 RSS 源到代理服务器
   */
  public async subscribeToProxyServer(
    url: string,
    title: string | undefined,
    config: ProxyModeConfig
  ): Promise<void> {
    try {
      const response = await fetch(`${config.serverUrl}/api/subscribe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, title }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || '订阅失败');
      }
    } catch (error) {
      logger.error('Error subscribing to proxy server:', error);
      throw error;
    }
  }

  /**
   * 批量同步所有订阅源到代理服务器
   */
  public async syncAllSourcesToProxy(
    sources: RSSSource[],
    config: ProxyModeConfig
  ): Promise<void> {
    try {
      const startTime = Date.now();
      
      if (sources.length === 0) {
        logger.info('没有订阅源，无需同步');
        return;
      }
      
      console.log('\n' + '='.repeat(60));
      console.log('[Proxy Sync] 🚀 开始批量同步订阅源到服务端');
      console.log('='.repeat(60));
      console.log(`[Proxy Sync] 服务器地址: ${config.serverUrl}`);
      console.log(`[Proxy Sync] 待同步源数: ${sources.length}`);
      console.log('-'.repeat(60));
      
      let successCount = 0;
      let failCount = 0;
      const failedSources: Array<{ name: string; error: string }> = [];
      
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        try {
          const progress = `[${i + 1}/${sources.length}]`;
          console.log(`${progress} 正在同步: ${source.name}`);
          
          const response = await fetch(`${config.serverUrl}/api/subscribe`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: source.url,
              title: source.name,
            }),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.warn(`${progress} ❌ 同步失败 (HTTP ${response.status}): ${source.name}`);
            failCount++;
            failedSources.push({ name: source.name, error: `HTTP ${response.status}` });
            continue;
          }
          
          successCount++;
          console.log(`${progress} ✅ 同步成功: ${source.name}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.warn(`[${i + 1}/${sources.length}] ❌ 同步异常: ${source.name}`);
          failCount++;
          failedSources.push({ name: source.name, error: errorMsg });
        }
      }
      
      const duration = Date.now() - startTime;
      console.log('-'.repeat(60));
      console.log('[Proxy Sync] 📊 同步总结');
      console.log(`[Proxy Sync] ✅ 成功: ${successCount}/${sources.length}`);
      console.log(`[Proxy Sync] ❌ 失败: ${failCount}/${sources.length}`);
      console.log(`[Proxy Sync] ⏱️  耗时: ${(duration / 1000).toFixed(2)}s`);
      console.log('='.repeat(60) + '\n');
      
    } catch (error) {
      console.error('[Proxy Sync] 💥 同步过程出错:', error);
      throw error;
    }
  }

  /**
   * 从代理服务器同步文章（极简代理模式）
   * 遍历所有源，通过代理获取 XML 并复用本地解析逻辑
   */
  public async syncFromProxyServer(
    options: {
      mode?: 'sync' | 'refresh';
      onProgress?: (current: number, total: number, sourceName: string) => void;
      onError?: (error: Error, sourceName: string) => void;
    } = {}
  ): Promise<{
    success: number;
    failed: number;
    totalArticles: number;
    errors: Array<{ source: string; error: string }>;
  }> {
    try {
      const config = await this.getProxyConfig();
      if (!config.enabled || !config.serverUrl) {
        logger.warn('代理模式未启用');
        return { success: 0, failed: 0, totalArticles: 0, errors: [] };
      }

      // 获取所有活跃的 RSS 源
      const sources = await this.databaseService.executeQuery(
        'SELECT * FROM rss_sources WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
      );

      if (sources.length === 0) {
        return { success: 0, failed: 0, totalArticles: 0, errors: [] };
      }

      console.log(`[syncFromProxyServer] 极简代理模式，待同步源数: ${sources.length}`);

      let success = 0;
      let failed = 0;
      let totalArticles = 0;
      const errors: Array<{ source: string; error: string }> = [];

      for (let i = 0; i < sources.length; i++) {
        const row = sources[i];
        const source: RSSSource = {
          id: row.id,
          name: row.title,
          url: row.url,
          category: row.category || 'General',
          contentType: row.content_type || 'image_text',
          isActive: true,
          sortOrder: row.sort_order || 0,
        };

        try {
          options.onProgress?.(i, sources.length, source.name);
          
          const articles = await this.fetchArticlesViaProxy(source, config);
          success++;
          totalArticles += articles.length;
          
          console.log(`[syncFromProxyServer] ✅ ${source.name}: ${articles.length} 篇`);
        } catch (error) {
          failed++;
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push({ source: source.name, error: errorMsg });
          options.onError?.(error as Error, source.name);
          
          console.error(`[syncFromProxyServer] ❌ ${source.name}: ${errorMsg}`);
        }
      }

      options.onProgress?.(sources.length, sources.length, '完成');

      return { success, failed, totalArticles, errors };
    } catch (error) {
      logger.error('Error syncing from proxy server:', error);
      return { 
        success: 0, 
        failed: 1, 
        totalArticles: 0,
        errors: [{ source: '代理服务器', error: (error as Error).message }],
      };
    }
  }

  /**
   * 从代理服务器获取单个源的文章（极简代理模式）
   * 通过代理获取 XML 并复用本地解析逻辑
   */
  public async fetchArticlesFromProxy(
    source: RSSSource,
    config: ProxyModeConfig,
    options: { mode?: 'sync' | 'refresh' } = {}
  ): Promise<Article[]> {
    // 极简代理模式：直接调用 fetchArticlesViaProxy
    return this.fetchArticlesViaProxy(source, config);
  }

  /**
   * 极简代理模式 - 通过代理获取 RSS
   * 服务端只做转发 + 图片 URL 替换，客户端复用本地解析逻辑
   */
  private async fetchArticlesViaProxy(
    source: RSSSource,
    config: ProxyModeConfig
  ): Promise<Article[]> {
    try {
      console.log(`[fetchArticlesViaProxy] 🚀 通过代理获取: ${source.name}`);
      
      // 调用代理服务器的 RSS 代理接口
      const proxyUrl = `${config.serverUrl}/api/rss?url=${encodeURIComponent(source.url)}`;
      
      const headers: Record<string, string> = {};
      if (config.token) {
        headers['Authorization'] = `Bearer ${config.token}`;
      }
      
      const response = await fetch(proxyUrl, { headers });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const xmlText = await response.text();
      console.log(`[fetchArticlesViaProxy] 收到 XML: ${xmlText.length} bytes`);

      // 复用本地解析逻辑（LocalRSSService 的 parseRSSFeedAndSave）
      const articles = await localRSSService.parseRSSFeedAndSave(xmlText, source);
      
      console.log(`[fetchArticlesViaProxy] ✅ ${source.name}: 解析到 ${articles.length} 篇文章`);
      
      return articles;
    } catch (error) {
      console.error(`[fetchArticlesViaProxy] ❌ ${source.name}:`, error);
      throw error;
    }
  }

  // =================== 内部方法 ===================

  // [已删除] parseRSSFromProxy - 极简代理模式下不再需要，复用 LocalRSSService
  // [已删除] parseProxyServerXML - 极简代理模式下不再需要，服务端不再拼装 XML
  // [已删除] createArticleFromFeedItem - 极简代理模式下不再需要，复用 LocalRSSService

  /**
   * 保存文章到数据库（保留供未来 JSON 方案使用）
   */
  private async saveArticle(article: Omit<Article, 'id'> | Article): Promise<Article | null> {
    try {
      const result = await this.databaseService.executeInsert(
        `INSERT INTO articles (
          title, url, content, summary, author, published_at, rss_source_id, 
          source_name, category, word_count, reading_time, difficulty, 
          is_read, is_favorite, read_progress, tags, guid, image_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          article.title,
          article.url,
          article.content,
          article.summary,
          article.author,
          article.publishedAt.toISOString(),
          article.sourceId,
          article.sourceName,
          article.category,
          article.wordCount,
          article.readingTime,
          article.difficulty,
          article.isRead ? 1 : 0,
          article.isFavorite ? 1 : 0,
          article.readProgress,
          JSON.stringify(article.tags),
          article.url,
          article.imageUrl || null,
        ]
      );

      return {
        ...article,
        id: Number(result.insertId),
      } as Article;
    } catch (error) {
      logger.error('Error saving article:', error);
      return null;
    }
  }

  /**
   * 发送 ACK 确认
   */
  private async acknowledgeItems(
    itemIds: number[],
    config: ProxyModeConfig
  ): Promise<void> {
    try {
      await fetch(`${config.serverUrl}/api/ack`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ item_ids: itemIds }),
      });
      logger.info(`ACK 已发送，清理 ${itemIds.length} 条记录`);
    } catch (error) {
      logger.error('Error acknowledging items:', error);
    }
  }
}

export const proxyRSSService = ProxyRSSService.getInstance();
