/**
 * 本地直连 RSS 服务
 * 负责直接从 RSS 源获取和解析文章
 */

import { DatabaseService } from '../../database/DatabaseService';
import { RSSSource, Article, AppError } from '../../types';
import { imageExtractionService } from '../ImageExtractionService';
import { rsshubService } from '../RSShubService';
import { parseEnhancedRSS, extractBestImageUrlFromItem, extractBestImageWithCaption } from '../EnhancedRSSParser';
import {
  fetchWithRetry,
  logger,
  cleanTextContent,
  preserveHtmlContent,
  generateSummary,
  countWords,
  parsePublishedDate,
  shouldUseCorsProxy,
  fixRelativeImageUrls,
} from './RSSUtils';

export class LocalRSSService {
  private static instance: LocalRSSService;
  private databaseService: DatabaseService;

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
  }

  public static getInstance(): LocalRSSService {
    if (!LocalRSSService.instance) {
      LocalRSSService.instance = new LocalRSSService();
    }
    return LocalRSSService.instance;
  }

  // =================== 公共方法 ===================

  /**
   * 验证 RSS 源
   */
  public async validateRSSFeed(url: string): Promise<{
    title?: string;
    description?: string;
    language?: string;
  }> {
    try {
      let actualUrl = url;
      let rsshubInfo = null;
      
      // 处理 RSSHUB 协议
      if (rsshubService.isRSSHubUrl(url)) {
        if (!rsshubService.validateRSSHubPath(url)) {
          throw new Error('Invalid RSSHUB URL format');
        }
        
        const bestInstance = await rsshubService.selectBestInstance();
        actualUrl = rsshubService.convertRSSHubUrl(url, bestInstance);
        rsshubInfo = rsshubService.parseRSSHubUrl(url);
      }
      
      // 检查是否需要使用 CORS 代理
      const useCorsProxy = shouldUseCorsProxy(actualUrl);
      
      // 使用完整的请求头，模拟真实浏览器
      const fetchOptions: RequestInit = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      };
      
      let finalUrl = actualUrl;
      if (useCorsProxy) {
        finalUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(actualUrl)}`;
        if (fetchOptions.headers && typeof fetchOptions.headers === 'object') {
          const headers = fetchOptions.headers as Record<string, string>;
          delete headers['User-Agent'];
        }
      }
      
      // 使用重试机制和超时控制
      const response = await fetchWithRetry(finalUrl, {
        ...fetchOptions,
        retries: 3,
        retryDelay: 1500,
        timeout: 20000  // 增加超时时间到20秒
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const xmlText = await response.text();
      
      if (!xmlText.trim() || !xmlText.includes('<?xml') && !xmlText.includes('<rss') && !xmlText.includes('<feed')) {
        throw new Error('响应不是有效的 RSS/Atom 格式');
      }
      
      const titleMatch = xmlText.match(/<title[^>]*>([^<]+)<\/title>/i);
      const descMatch = xmlText.match(/<description[^>]*>([^<]+)<\/description>/i);
      const langMatch = xmlText.match(/<language[^>]*>([^<]+)<\/language>/i);
      
      return {
        title: rsshubInfo?.description || (titleMatch ? titleMatch[1].trim() : undefined),
        description: descMatch ? descMatch[1].trim() : rsshubInfo?.description,
        language: langMatch ? langMatch[1].trim() : undefined,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`RSS 源验证失败 [${url}]:`, error);
      throw new Error(`RSS 源验证失败: ${errorMsg}`);
    }
  }

  /**
   * 带重试机制的 RSS 文章获取
   */
  public async fetchArticlesWithRetry(source: RSSSource, maxRetries: number = 3): Promise<Article[]> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`正在获取 RSS (尝试 ${attempt}/${maxRetries}): ${source.name}`);
        return await this.fetchArticlesInternal(source);
      } catch (error) {
        lastError = error as Error;
        logger.warn(`RSS 获取失败 (尝试 ${attempt}/${maxRetries}): ${source.name}`, error);
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.info(`等待 ${delay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new AppError({
      code: 'RSS_FETCH_ERROR',
      message: `RSS 获取失败，已重试 ${maxRetries} 次: ${lastError?.message}`,
      details: lastError,
      timestamp: new Date(),
    });
  }

  /**
   * 解析 RSS XML 并保存文章（供代理模式复用）
   * 这是一个公共方法，让 ProxyRSSService 可以复用本地解析逻辑
   */
  public async parseRSSFeedAndSave(xmlText: string, source: RSSSource): Promise<Article[]> {
    try {
      const newArticles = await this.parseRSSFeed(xmlText, source);
      
      if (!newArticles || newArticles.length === 0) {
        logger.info(`RSS 源 ${source.name} 没有新文章`);
        return [];
      }
      
      const savedArticles: Article[] = [];
      
      for (const article of newArticles) {
        const existing = await this.databaseService.executeQuery(
          'SELECT id FROM articles WHERE url = ?',
          [article.url]
        );
        
        if (existing.length === 0) {
          const saved = await this.saveArticle(article);
          if (saved) {
            savedArticles.push(saved);
          }
        }
      }
      
      // 更新 RSS 源统计
      if (source.id) {
        await this.updateSourceStats(source.id.toString());
      }
      
      logger.info(`[parseRSSFeedAndSave] ${source.name}: 保存 ${savedArticles.length} 篇新文章`);
      return savedArticles;
    } catch (error) {
      logger.error(`[parseRSSFeedAndSave] 解析失败 ${source.name}:`, error);
      throw error;
    }
  }

  // =================== 内部方法 ===================

  /**
   * 内部 RSS 文章获取方法
   */
  private async fetchArticlesInternal(source: RSSSource): Promise<Article[]> {
    try {
      logger.info(`Fetching articles from: ${source.url}`);
      
      let actualUrl = source.url;
      
      // 处理 RSSHUB 协议
      if (rsshubService.isRSSHubUrl(source.url)) {
        const bestInstance = await rsshubService.selectBestInstance();
        actualUrl = rsshubService.convertRSSHubUrl(source.url, bestInstance);
        logger.info(`Converted RSSHUB URL: ${source.url} -> ${actualUrl}`);
      }
      
      // 检查是否需要使用 CORS 代理
      const useCorsProxy = shouldUseCorsProxy(actualUrl);
      
      const fetchOptions: RequestInit = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Referer': actualUrl
        },
      };
      
      let finalUrl = actualUrl;
      if (useCorsProxy) {
        finalUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(actualUrl)}`;
        if (fetchOptions.headers && typeof fetchOptions.headers === 'object') {
          const headers = fetchOptions.headers as Record<string, string>;
          delete headers['User-Agent'];
        }
      }
      
      const response = await fetchWithRetry(finalUrl, {
        ...fetchOptions,
        retries: 3,
        retryDelay: 2000,
        timeout: 15000
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const xmlText = await response.text();
      
      if (!xmlText.trim() || !xmlText.includes('<')) {
        throw new Error('响应内容不是有效的 XML 格式');
      }
      
      // 解析 RSS
      const newArticles = await this.parseRSSFeed(xmlText, source);
      
      if (!newArticles || newArticles.length === 0) {
        logger.info(`RSS 源 ${source.name} 没有新文章`);
        return [];
      }
      
      // 保存新文章到数据库
      const savedArticles: Article[] = [];
      
      for (const article of newArticles) {
        const existing = await this.databaseService.executeQuery(
          'SELECT id FROM articles WHERE url = ?',
          [article.url]
        );
        
        if (existing.length === 0) {
          const saved = await this.saveArticle(article);
          if (saved) {
            savedArticles.push(saved);
          }
        }
      }
      
      // 更新 RSS 源统计
      await this.updateSourceStats(source.id!.toString());
      
      logger.info(`成功保存 ${savedArticles.length} 篇新文章`);
      return savedArticles;
    } catch (error) {
      logger.error(`Error fetching articles from ${source.url}:`, error);
      throw error;
    }
  }

  /**
   * 解析 RSS Feed
   */
  private async parseRSSFeed(xmlText: string, source: RSSSource): Promise<Omit<Article, 'id'>[]> {
    if (!source || !source.id || !source.name) {
      logger.error('parseRSSFeed received invalid source object');
      return [];
    }

    const sourceId = typeof source.id === 'string' ? parseInt(source.id, 10) : source.id;
    const sourceName = source.name || 'Unknown Source';
    const shouldExtractImages = source.contentType === 'image_text';
    
    try {
      logger.info(`开始解析 RSS Feed，源: ${sourceName}`);
      
      const rss = await parseEnhancedRSS(xmlText);
      
      // 快速解析基本信息，找分界点
      const basicItems: { url: string; title: string; publishedAt: Date; index: number }[] = [];
      
      for (let i = 0; i < rss.items.length; i++) {
        const item = rss.items[i];
        const itemLink = item.links?.[0]?.url || item.id || '';
        
        if (!item.title || !itemLink) continue;
        
        let publishedAt = new Date();
        if (item.published) {
          publishedAt = parsePublishedDate(item.published);
        }
        
        basicItems.push({
          url: itemLink,
          title: cleanTextContent(item.title),
          publishedAt,
          index: i
        });
      }
      
      // 找分界点，识别新旧文章
      const latestArticles = await this.databaseService.executeQuery(
        'SELECT url, title, published_at FROM articles WHERE rss_source_id = ? ORDER BY published_at DESC LIMIT 20',
        [sourceId]
      );
      
      let newArticlesEndIndex = basicItems.length;
      
      if (latestArticles && latestArticles.length > 0) {
        for (let i = 0; i < basicItems.length; i++) {
          const basicItem = basicItems[i];
          const existing = latestArticles.find(
            db => db.url === basicItem.url || (
              db.title === basicItem.title && 
              Math.abs(new Date(db.published_at).getTime() - basicItem.publishedAt.getTime()) < 60000
            )
          );
          
          if (existing) {
            newArticlesEndIndex = i;
            logger.info(`检测到 ${i} 篇新文章`);
            break;
          }
        }
      }
      
      if (newArticlesEndIndex === 0) {
        logger.info(`RSS 源 ${sourceName} 没有新文章`);
        return [];
      }
      
      const newItemIndices = basicItems.slice(0, newArticlesEndIndex).map(item => item.index);
      
      // 只对新文章执行完整解析
      const articles: Omit<Article, 'id'>[] = [];
      
      for (const idx of newItemIndices) {
        const item = rss.items[idx];
        const itemLink = item.links?.[0]?.url || item.id || '';
        
        if (!item.title || !itemLink) continue;
        
        // 🔥 关键：在提取内容和图片之前，先修复相对路径
        const rawContent = item.content || item.description || '';
        const fixedRawContent = fixRelativeImageUrls(rawContent, itemLink);
        
        // 🔥 修复后更新回 item 对象，确保封面图提取也用修复后的内容
        if (item.content) {
          item.content = fixedRawContent;
        } else if (item.description) {
          item.description = fixedRawContent;
        }
        
        const content = await this.extractContent(fixedRawContent, itemLink, source.contentType || 'image_text');
        const wordCount = countWords(content);
        
        let publishedAt = new Date();
        if (item.published) {
          publishedAt = parsePublishedDate(item.published);
        }
        
        const article: Omit<Article, 'id'> = {
          title: cleanTextContent(item.title),
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
          difficulty: 'intermediate',
          isRead: false,
          isFavorite: false,
          readProgress: 0,
          tags: [],
        };
        
        // 提取图片（使用增强版函数，同时提取说明信息）
        if (shouldExtractImages) {
          let imageUrl = null;
          let imageCaption: string | undefined;
          let imageCredit: string | undefined;
          
          try {
            // 使用增强版提取函数，同时获取图片说明
            const imageInfo = extractBestImageWithCaption(item, { sourceUrl: source.url });
            if (imageInfo) {
              imageUrl = imageInfo.url;
              // 保存图片说明信息
              imageCaption = imageInfo.caption || imageInfo.alt;
              imageCredit = imageInfo.credit;
              if (imageCaption || imageCredit) {
                logger.info(`[图片说明] ${imageCaption || ''}${imageCredit ? ` (来源: ${imageCredit})` : ''}`);
              }
            }
          } catch (error) {
            // 忽略
          }
          
          if (!imageUrl && item.enclosures?.length > 0) {
            const imageEnclosure = item.enclosures.find(enc => 
              enc.mimeType?.startsWith('image/')
            );
            if (imageEnclosure) {
              imageUrl = imageEnclosure.url;
            }
          }
          
          // 从已修复的 rawContent 中提取图片
          if (!imageUrl && fixedRawContent) {
            try {
              imageUrl = await imageExtractionService.extractImageFromContent(fixedRawContent);
            } catch (error) {
              // 忽略
            }
          }
          
          if (imageUrl) {
            article.imageUrl = imageUrl;
            article.imageCaption = imageCaption;
            article.imageCredit = imageCredit;
          }
        }
        
        articles.push(article);
      }
      
      logger.info(`RSS 解析完成，源: ${sourceName}，解析 ${articles.length} 篇新文章`);
      return articles;
    } catch (error) {
      logger.error(`RSS 解析失败，源: ${sourceName}:`, error);
      throw error;
    }
  }

  /**
   * 提取文章内容
   */
  private async extractContent(
    rawContent: string, 
    url: string, 
    contentType: 'text' | 'image_text' = 'image_text'
  ): Promise<string> {
    try {
      if (rawContent.length < 200 && url) {
        const fullContent = await this.fetchFullContent(url);
        if (fullContent) {
          rawContent = fullContent;
          // 如果从全文获取，也需要修复相对路径
          rawContent = fixRelativeImageUrls(rawContent, url);
        }
      }

      // 清理 HTML（相对路径已在外层修复过了）
      return preserveHtmlContent(rawContent, contentType);
    } catch (error) {
      logger.error('内容提取失败:', error);
      return rawContent;
    }
  }

  /**
   * 从原始 URL 获取完整内容
   */
  private async fetchFullContent(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      });

      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      
      const contentSelectors = [
        /<article[^>]*>([\s\S]*?)<\/article>/i,
        /<div[^>]*class="[^"]*post-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<main[^>]*>([\s\S]*?)<\/main>/i
      ];

      for (const regex of contentSelectors) {
        const match = html.match(regex);
        if (match && match[1] && match[1].length > 500) {
          return match[1];
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 保存文章到数据库
   */
  private async saveArticle(article: Omit<Article, 'id'>): Promise<Article | null> {
    try {
      const result = await this.databaseService.executeInsert(
        `INSERT INTO articles (
          title, url, content, summary, author, published_at, rss_source_id, 
          source_name, category, word_count, reading_time, difficulty, 
          is_read, is_favorite, read_progress, tags, guid, image_url,
          image_caption, image_credit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          article.imageCaption || null,
          article.imageCredit || null,
        ]
      );

      return {
        id: Number(result.insertId),
        ...article,
      };
    } catch (error) {
      logger.error('Error saving article:', error);
      return null;
    }
  }

  /**
   * 更新 RSS 源统计信息
   */
  private async updateSourceStats(sourceId: string): Promise<void> {
    try {
      const articleCountResult = await this.databaseService.executeQuery(
        'SELECT COUNT(*) as count FROM articles WHERE rss_source_id = ?',
        [sourceId]
      );
      const articleCount = articleCountResult[0]?.count || 0;
      
      const unreadCountResult = await this.databaseService.executeQuery(
        'SELECT COUNT(*) as count FROM articles WHERE rss_source_id = ? AND is_read = 0',
        [sourceId]
      );
      const unreadCount = unreadCountResult[0]?.count || 0;
      
      await this.databaseService.executeStatement(
        'UPDATE rss_sources SET last_updated = ?, article_count = ?, unread_count = ? WHERE id = ?',
        [new Date().toISOString(), articleCount, unreadCount, sourceId]
      );
    } catch (error) {
      logger.error('Error updating source stats:', error);
    }
  }

  /**
   * 批量刷新多个源（并发控制）
   */
  public async refreshSources(
    sources: RSSSource[],
    options: {
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
    const { maxConcurrent = 3, onProgress, onError } = options;
    let success = 0;
    let failed = 0;
    let totalArticles = 0;
    const errors: Array<{ source: string; error: string }> = [];
    let completed = 0;

    const executeWithConcurrency = async (sources: RSSSource[]) => {
      const executing: Promise<void>[] = [];

      for (const source of sources) {
        const promise = this.fetchArticlesWithRetry(source, 3)
          .then((articles) => {
            success++;
            totalArticles += articles.length;
            completed++;
            onProgress?.(completed, sources.length, source.name);
          })
          .catch((error) => {
            failed++;
            completed++;
            const errorMsg = error.message || 'Unknown error';
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
}

export const localRSSService = LocalRSSService.getInstance();
