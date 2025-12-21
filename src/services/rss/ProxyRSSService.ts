/**
 * 代理模式 RSS 服务
 * 负责通过代理服务器获取和同步文章
 */

import { DatabaseService } from '../../database/DatabaseService';
import { RSSSource, Article, ProxyModeConfig } from '../../types';
import { SettingsService } from '../SettingsService';
import { parseEnhancedRSS, extractBestImageUrlFromItem } from '../EnhancedRSSParser';
import { imageLocalizer } from './ImageLocalizer';
import {
  logger,
  cleanTextContent,
  generateSummary,
  countWords,
  parsePublishedDate,
  decodeHTMLEntities,
} from './RSSUtils';

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
   * 从代理服务器同步文章
   * @param options.mode - 同步模式：'sync' 仅同步已有数据，'refresh' 先刷新源再同步
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
      if (!config.enabled || !config.token) {
        logger.warn('代理模式未启用或未登录');
        return { success: 0, failed: 0, totalArticles: 0, errors: [] };
      }

      const mode = options.mode || 'sync';
      options.onProgress?.(0, 1, '代理服务器');
      
      console.log(`[syncFromProxyServer] 模式: ${mode}`);

      const response = await fetch(`${config.serverUrl}/api/sync?mode=${mode}&limit=100`, {
        headers: { 'Authorization': `Bearer ${config.token}` },
      });

      if (!response.ok) {
        console.error(`[syncFromProxyServer] ❌ HTTP ${response.status}`);
        throw new Error(`HTTP ${response.status}`);
      }

      const xmlText = await response.text();
      console.log(`[syncFromProxyServer] 收到响应，长度: ${xmlText.length}`);

      // 解析 XML
      const articles = await this.parseProxyServerXML(xmlText, config.serverUrl);
      console.log(`[syncFromProxyServer] 解析到 ${articles.length} 篇文章`);

      // 保存到本地数据库
      const savedArticles: Article[] = [];
      for (const article of articles) {
        // 匹配本地的 RSS 源 ID
        if (article.sourceUrl) {
          try {
            const localSource = await this.databaseService.executeQuery(
              'SELECT id FROM rss_sources WHERE url = ? LIMIT 1',
              [article.sourceUrl]
            );
            
            if (localSource.length > 0) {
              article.sourceId = localSource[0].id;
            } else {
              // 本地没有这个源，创建一个
              const newSourceResult = await this.databaseService.executeInsert(
                `INSERT INTO rss_sources (url, title, category, content_type, is_active, last_updated) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  article.sourceUrl,
                  article.sourceName,
                  'General',
                  'image_text',
                  1,
                  new Date().toISOString(),
                ]
              );
              article.sourceId = Number(newSourceResult.insertId);
            }
          } catch (error) {
            console.error(`[syncFromProxyServer] 匹配源失败:`, error);
          }
        }
        
        const saved = await this.saveArticle(article);
        if (saved) savedArticles.push(saved);
      }

      // 代理模式下不需要下载图片到本地，直接使用服务器 URL
      // 图片已经由服务端缓存，客户端直接访问服务器即可
      // imageLocalizer.downloadAndReplaceImages(savedArticles, config.serverUrl);

      // 发送 ACK
      const itemIds = articles.map((a: any) => a.proxyItemId).filter(Boolean);
      if (itemIds.length > 0) {
        await this.acknowledgeItems(itemIds, config);
      }

      options.onProgress?.(1, 1, '代理服务器');

      return { 
        success: 1, 
        failed: 0, 
        totalArticles: savedArticles.length,
        errors: [],
      };
    } catch (error) {
      logger.error('Error syncing from proxy server:', error);
      options.onError?.(error as Error, '代理服务器');
      return { 
        success: 0, 
        failed: 1, 
        totalArticles: 0,
        errors: [{ source: '代理服务器', error: (error as Error).message }],
      };
    }
  }

  /**
   * 从代理服务器获取单个源的文章
   * @param source - RSS 源
   * @param config - 代理配置
   * @param options.mode - 同步模式：'sync' 仅同步，'refresh' 刷新源+同步
   */
  public async fetchArticlesFromProxy(
    source: RSSSource,
    config: ProxyModeConfig,
    options: { mode?: 'sync' | 'refresh' } = {}
  ): Promise<Article[]> {
    try {
      const mode = options.mode || 'refresh'; // 单源刷新默认使用 refresh 模式
      console.log(`[fetchArticlesFromProxy] 开始从代理获取: ${source.name} (模式: ${mode})`);
      
      // 传递 source_url 让服务端只刷新这个源
      const url = new URL(`${config.serverUrl}/api/sync`);
      url.searchParams.set('mode', mode);
      url.searchParams.set('source_url', source.url);
      url.searchParams.set('limit', '100');
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`[fetchArticlesFromProxy] ❌ HTTP ${response.status}`);
        return [];
      }

      const data = await response.json();
      
      if (data.rss) {
        return await this.parseRSSFromProxy(data.rss, source);
      }

      if (data.sources) {
        const matchingSource = data.sources.find((s: any) => s.url === source.url);
        
        if (!matchingSource) {
          await this.subscribeToProxyServer(source.url, source.name, config);
          return [];
        }

        if (matchingSource.rss) {
          return await this.parseRSSFromProxy(matchingSource.rss, source);
        }
      }

      return [];
    } catch (error) {
      console.error(`[fetchArticlesFromProxy] 💥 失败:`, error);
      return [];
    }
  }

  // =================== 内部方法 ===================

  /**
   * 解析从代理服务器获取的 RSS XML
   */
  private async parseRSSFromProxy(rssXml: string, source: RSSSource): Promise<Article[]> {
    try {
      const rss = await parseEnhancedRSS(rssXml);
      
      const articles: Article[] = [];
      for (const item of rss.items) {
        const article = await this.createArticleFromFeedItem(item, source);
        if (article) {
          articles.push(article);
        }
      }
      
      // 保存到数据库
      for (const article of articles) {
        await this.saveArticle(article);
      }
      
      return articles;
    } catch (error) {
      console.error(`[parseRSSFromProxy] 解析失败:`, error);
      return [];
    }
  }

  /**
   * 解析代理服务器返回的 XML
   */
  private async parseProxyServerXML(xmlText: string, serverUrl?: string): Promise<any[]> {
    try {
      const rss = await parseEnhancedRSS(xmlText);

      const articles: any[] = [];
      
      // 预先提取所有 <item> 标签的属性
      const itemSourceMap = new Map<string, { 
        sourceId: number; 
        sourceName: string; 
        sourceUrl: string; 
        proxyItemId: number 
      }>();
      
      const itemTagPattern = /<item\s+([^>]+)>/gi;
      let tagMatch;
      
      while ((tagMatch = itemTagPattern.exec(xmlText)) !== null) {
        const attributes = tagMatch[1];
        
        const itemIdMatch = attributes.match(/data-item-id="(\d+)"/);
        if (!itemIdMatch) continue;
        
        const itemId = itemIdMatch[1];
        const proxyItemId = parseInt(itemId);
        
        const sourceIdMatch = attributes.match(/data-source-id="(\d+)"/);
        const sourceId = sourceIdMatch ? parseInt(sourceIdMatch[1]) : 0;
        
        const sourceNameMatch = attributes.match(/data-source-name="([^"]+)"/);
        const sourceName = sourceNameMatch ? decodeHTMLEntities(sourceNameMatch[1]) : '代理服务器';
        
        const sourceUrlMatch = attributes.match(/data-source-url="([^"]+)"/);
        const sourceUrl = sourceUrlMatch ? decodeHTMLEntities(sourceUrlMatch[1]) : '';
        
        itemSourceMap.set(itemId, { sourceId, sourceName, sourceUrl, proxyItemId });
      }
      
      for (let i = 0; i < rss.items.length; i++) {
        const item = rss.items[i];
        
        const itemKeys = Array.from(itemSourceMap.keys());
        const itemKey = itemKeys[i];
        
        let proxyItemId = null;
        let sourceId = 0;
        let sourceName = '代理服务器';
        let sourceUrl = '';
        
        if (itemKey && itemSourceMap.has(itemKey)) {
          const sourceInfo = itemSourceMap.get(itemKey)!;
          proxyItemId = sourceInfo.proxyItemId;
          sourceId = sourceInfo.sourceId;
          sourceName = sourceInfo.sourceName;
          sourceUrl = sourceInfo.sourceUrl;
        }

        const itemLink = item.links?.[0]?.url || item.id || '';
        let rawContent = item.content || item.description || '';
        
        // 替换 localhost 图片 URL
        if (serverUrl) {
          rawContent = imageLocalizer.replaceLocalhostInContent(rawContent, serverUrl);
        }

        const content = rawContent;
        const wordCount = countWords(content);

        let publishedAt = new Date();
        if (item.published) {
          publishedAt = parsePublishedDate(item.published);
        }

        const article: any = {
          title: cleanTextContent(item.title || ''),
          url: itemLink,
          content: content,
          summary: generateSummary(content),
          author: item.authors?.[0]?.name ? cleanTextContent(item.authors[0].name) : '',
          publishedAt: publishedAt,
          sourceId: sourceId,
          sourceName: sourceName,
          category: 'General',
          wordCount: wordCount,
          readingTime: Math.ceil(wordCount / 200),
          difficulty: 'intermediate' as const,
          isRead: false,
          isFavorite: false,
          readProgress: 0,
          tags: [],
          proxyItemId,
          sourceUrl,
        };

        // 提取封面图片
        let imageUrl = null;
        try {
          imageUrl = extractBestImageUrlFromItem(item, { sourceUrl: sourceUrl });
        } catch (error) {
          // 忽略
        }

        if (!imageUrl && item.enclosures?.length > 0) {
          const imageEnclosure = item.enclosures.find((enc: any) => 
            enc.mimeType?.startsWith('image/')
          );
          if (imageEnclosure) {
            imageUrl = imageEnclosure.url;
          }
        }

        if (imageUrl && serverUrl) {
          imageUrl = imageLocalizer.replaceLocalhostUrl(imageUrl, serverUrl);
          article.imageUrl = imageUrl;
        }

        articles.push(article);
      }

      return articles;
    } catch (error) {
      logger.error('Error parsing proxy server XML:', error);
      return [];
    }
  }

  /**
   * 从 Feed Item 创建文章
   */
  private async createArticleFromFeedItem(item: any, source: RSSSource): Promise<Article | null> {
    try {
      const itemLink = item.links?.[0]?.url || item.id || '';
      if (!item.title || !itemLink) return null;

      const rawContent = item.content || item.description || '';
      const wordCount = countWords(rawContent);
      
      let publishedAt = new Date();
      if (item.published) {
        publishedAt = parsePublishedDate(item.published);
      }

      const article: Article = {
        id: 0,
        title: cleanTextContent(item.title),
        url: itemLink,
        content: rawContent,
        summary: generateSummary(rawContent),
        author: item.authors?.[0]?.name ? cleanTextContent(item.authors[0].name) : '',
        publishedAt: publishedAt,
        sourceId: source.id!,
        sourceName: source.name,
        category: 'General',
        wordCount: wordCount,
        readingTime: Math.ceil(wordCount / 200),
        difficulty: 'intermediate',
        isRead: false,
        isFavorite: false,
        readProgress: 0,
        tags: [],
      };

      // 提取图片
      let imageUrl = null;
      try {
        imageUrl = extractBestImageUrlFromItem(item, { sourceUrl: source.url });
      } catch (error) {
        // 忽略
      }

      if (imageUrl) {
        article.imageUrl = imageUrl;
      }

      return article;
    } catch (error) {
      logger.error('Error creating article from feed item:', error);
      return null;
    }
  }

  /**
   * 保存文章到数据库
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
