import { DatabaseService } from '../database/DatabaseService';
import { RSSSource, Article, AppError } from '../types';
import { imageExtractionService } from './ImageExtractionService';
import { rsshubService } from './RSShubService';
// @ts-ignore - 第三方库没有类型定义
import { parse as parseRSS } from 'react-native-rss-parser';
import { parseEnhancedRSS, extractBestImageUrlFromItem } from './EnhancedRSSParser';
// 移除图片预缓存，改为打开文章时按需加载
// import { imageCacheService } from './ImageCacheService';
// React Native环境下的HTML清理方案

// 添加cloudscraper-like功能的简单实现
interface FetchWithRetryOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
  timeout?: number;
}

/**
 * 带重试和超时的fetch实现
 */
async function fetchWithRetry(url: string, options: FetchWithRetryOptions = {}): Promise<Response> {
  const {
    retries = 3,
    retryDelay = 1000,
    timeout = 10000,
    ...fetchOptions
  } = options;

  for (let i = 0; i <= retries; i++) {
    try {
      // 创建超时Promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeout);
      });

      // 创建fetch Promise
      const fetchPromise = fetch(url, fetchOptions);

      // 使用Promise.race实现超时控制
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      return response;
    } catch (error) {
      if (i === retries) {
        throw error;
      }
      
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, i)));
    }
  }
  
  throw new Error('Unexpected error in fetchWithRetry');
}

// 简单的logger实现
const logger = {
  error: (message: string, error?: any) => {
    console.error(message, error);
  },
  warn: (message: string, error?: any) => {
    console.warn(message, error);
  },
  info: (message: string) => {
    console.log(message);
  }
};

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

  /**
   * 添加RSS源
   */
  public async addRSSSource(
    url: string, 
    title?: string, 
    contentType: 'text' | 'image_text' = 'image_text',
    category: string = '技术'
  ): Promise<RSSSource> {
    try {
      // 验证RSS源
      const feedInfo = await this.validateRSSFeed(url);
      
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

      // 立即获取最新文章
      await this.fetchArticlesFromSource(newSource);

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
   * 获取所有RSS源
   */
  public async getAllRSSSources(): Promise<RSSSource[]> {
    try {
      logger.info('Fetching RSS sources from database');
      // 使用简化查询，避免复杂的LEFT JOIN在数据库初始化阶段出错
      const results = await this.databaseService.executeQuery(`
        SELECT * FROM rss_sources ORDER BY sort_order ASC, id ASC
      `);
      
      logger.info(`Found ${results.length} RSS sources`);
      return results.map(this.mapRSSSourceRow);
    } catch (error) {
      logger.error('Error getting RSS sources:', error);
      // 数据库初始化时返回空数组，而不是抛出错误
      return [];
    }
  }

  /**
   * 根据ID获取RSS源
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
   * 获取活跃的RSS源
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
   * 更新RSS源排序
   */
  public async updateSourcesOrder(sourceOrder: { id: number; sortOrder: number }[]): Promise<void> {
    try {
      for (const item of sourceOrder) {
        await this.databaseService.executeStatement(
          'UPDATE rss_sources SET sort_order = ? WHERE id = ?',
          [item.sortOrder, item.id]
        );
      }
      logger.info('RSS sources order updated successfully');
    } catch (error) {
      logger.error('Error updating RSS sources order:', error);
      throw error;
    }
  }

  /**
   * 更新RSS源
   */
  public async updateRSSSource(id: number, updates: Partial<RSSSource>): Promise<void> {
    try {
      logger.info(`Updating RSS source ${id}`);
      
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
        logger.info('No updates to apply');
        return;
      }
      
      values.push(id);
      
      const sql = `UPDATE rss_sources SET ${setClause.join(', ')} WHERE id = ?`;
      await this.databaseService.executeStatement(sql, values);
      logger.info(`RSS source ${id} updated successfully`);
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
   * 删除RSS源
   */
  public async deleteRSSSource(id: number): Promise<void> {
    try {
      // 先删除相关文章
      await this.databaseService.executeStatement(
        'DELETE FROM articles WHERE rss_source_id = ?',
        [id]
      );
      
      // 删除RSS源
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

  /**
   * 从RSS源获取文章
   */
  public async fetchArticlesFromSource(source: RSSSource): Promise<Article[]> {
    return this.fetchArticlesFromSourceWithRetry(source, 3);
  }

  /**
   * 带重试机制的RSS文章获取
   */
  private async fetchArticlesFromSourceWithRetry(source: RSSSource, maxRetries: number = 3): Promise<Article[]> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`正在获取RSS (尝试 ${attempt}/${maxRetries}): ${source.name}`);
        return await this.fetchArticlesFromSourceInternal(source);
      } catch (error) {
        lastError = error as Error;
        logger.warn(`RSS获取失败 (尝试 ${attempt}/${maxRetries}): ${source.name}`, error);
        
        if (attempt < maxRetries) {
          // 指数退避：第一次重试等待2秒，第二次等待4秒
          const delay = Math.pow(2, attempt) * 1000;
          logger.info(`等待 ${delay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new AppError({
      code: 'RSS_FETCH_ERROR',
      message: `RSS获取失败，已重试 ${maxRetries} 次: ${lastError?.message}`,
      details: lastError,
      timestamp: new Date(),
    });
  }

  /**
   * 内部RSS文章获取方法
   */
  private async fetchArticlesFromSourceInternal(source: RSSSource): Promise<Article[]> {
    try {
      logger.info(`Fetching articles from: ${source.url}`);
      
      let actualUrl = source.url;
      
      // 处理RSSHUB协议
      if (rsshubService.isRSSHubUrl(source.url)) {
        const bestInstance = await rsshubService.selectBestInstance();
        actualUrl = rsshubService.convertRSSHubUrl(source.url, bestInstance);
        logger.info(`Converted RSSHUB URL: ${source.url} -> ${actualUrl}`);
      }
      
      // 检查是否需要使用代理（针对Cloudflare保护的站点）
      const shouldUseProxy = this.shouldUseProxy(actualUrl);
      
      const fetchOptions: RequestInit = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Referer': actualUrl
        },
      };
      
      // 如果需要使用代理，则通过代理服务访问
      let finalUrl = actualUrl;
      if (shouldUseProxy) {
        // 使用CORS代理服务
        finalUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(actualUrl)}`;
        // 移除可能冲突的请求头
        if (fetchOptions.headers && typeof fetchOptions.headers === 'object' && !Array.isArray(fetchOptions.headers)) {
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
      
      // 检查响应内容是否为有效的XML
      if (!xmlText.trim() || !xmlText.includes('<')) {
        throw new Error('响应内容不是有效的XML格式');
      }
      
      // 解析RSS，内部已实现增量解析（只解析新文章）
      const newArticles = await this.parseRSSFeed(xmlText, source);
      
      if (!newArticles || newArticles.length === 0) {
        logger.info(`RSS源 ${source.name} 没有新文章`);
        await this.updateSourceStats(source.id!.toString());
        return [];
      }
      
      // 保存新文章到数据库
      const savedArticles = [];
      
      for (const article of newArticles) {
        // 再次检查文章是否已存在（防止并发刷新时重复插入）
        const existing = await this.databaseService.executeQuery(
          'SELECT id FROM articles WHERE url = ?',
          [article.url]
        );
        
        if (existing.length === 0) {
          const saved = await this.saveArticle(article);
          if (saved) {
            savedArticles.push(saved);
            // 图片不再预缓存，改为打开文章时按需加载，节省流量
          }
        }
      }
      
      // 更新RSS源的最后更新时间
      await this.updateSourceStats(source.id!.toString());
      
      logger.info(`成功保存 ${savedArticles.length} 篇新文章`);
      return savedArticles;
    } catch (error) {
      logger.error(`Error fetching articles from ${source.url}:`, error);
      throw error;
    }
  }

  /**
   * 后台刷新所有RSS源，先展示已获取的内容
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
    
    logger.info(`开始后台刷新 ${sources.length} 个活跃的RSS源`);
    
    if (sources.length === 0) {
      logger.info('没有活跃的RSS源，退出刷新');
      return { success: 0, failed: 0, totalArticles: 0, errors: [] };
    }

    let success = 0;
    let failed = 0;
    let totalArticles = 0;
    const errors: Array<{ source: string; error: string }> = [];
    let completed = 0;

    // 创建并发控制的Promise池
    const executeWithConcurrency = async (sources: RSSSource[]) => {
      const executing: Promise<void>[] = [];
      
      for (const source of sources) {
        const promise = this.fetchArticlesFromSource(source)
          .then((articles) => {
            success++;
            totalArticles += articles.length;
            completed++;
            
            // 立即回调已获取的文章
            if (onArticlesReady && articles.length > 0) {
              onArticlesReady(articles, source.name);
            }
            
            if (onProgress) {
              onProgress(completed, sources.length, source.name);
            }
            
            logger.info(`成功刷新RSS源: ${source.name}，获取 ${articles.length} 篇文章`);
          })
          .catch((error) => {
            failed++;
            completed++;
            const errorMsg = error.message || '未知错误';
            errors.push({ source: source.name, error: errorMsg });
            
            if (onError) {
              onError(error, source.name);
            }
            
            if (onProgress) {
              onProgress(completed, sources.length, source.name);
            }
            
            logger.error(`刷新RSS源失败: ${source.name}`, error);
          });

        executing.push(promise);

        // 控制并发数量
        if (executing.length >= maxConcurrent) {
          await Promise.race(executing);
          // 移除已完成的Promise
          for (let i = executing.length - 1; i >= 0; i--) {
            if (await Promise.race([executing[i].then(() => true), Promise.resolve(false)])) {
              executing.splice(i, 1);
            }
          }
        }
      }

      // 等待所有剩余的Promise完成
      await Promise.all(executing);
    };

    await executeWithConcurrency(sources);

    const result = { success, failed, totalArticles, errors };
    logger.info(`RSS刷新完成: 成功 ${success}，失败 ${failed}，总文章数 ${totalArticles}`);
    
    return result;
  }

  /**
   * 刷新所有活跃RSS源
   */
  public async refreshAllSources(
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
    const sources = await this.getActiveRSSSources();
    
    logger.info(`开始刷新 ${sources.length} 个活跃的RSS源`);
    
    if (sources.length === 0) {
      logger.info('没有活跃的RSS源，退出刷新');
      return { success: 0, failed: 0, totalArticles: 0, errors: [] };
    }

    let success = 0;
    let failed = 0;
    let totalArticles = 0;
    const errors: Array<{ source: string; error: string }> = [];
    let completed = 0;

    // 创建并发控制的Promise池
    const executeWithConcurrency = async (sources: RSSSource[]) => {
      const executing: Promise<void>[] = [];
      
      for (const source of sources) {
        const promise = this.fetchArticlesFromSource(source)
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
        
        // 控制并发数量
        if (executing.length >= maxConcurrent) {
          await Promise.race(executing);
          // 移除已完成的Promise
          for (let i = executing.length - 1; i >= 0; i--) {
            if (await Promise.race([executing[i].then(() => true), Promise.resolve(false)])) {
              executing.splice(i, 1);
              break;
            }
          }
        }
      }
      
      // 等待所有剩余的Promise完成
      await Promise.all(executing);
    };

    await executeWithConcurrency(sources);
    
    return { success, failed, totalArticles, errors };
  }

  /**
   * 验证RSS源
   */
  public async validateRSSFeed(url: string): Promise<{
    title?: string;
    description?: string;
    language?: string;
  }> {
    try {
      let actualUrl = url;
      let rsshubInfo = null;
      
      // 处理RSSHUB协议
      if (rsshubService.isRSSHubUrl(url)) {
        if (!rsshubService.validateRSSHubPath(url)) {
          throw new Error('Invalid RSSHUB URL format: rsshub状技需要至少包含一个路径，如 rsshub://cnbeta/news');
        }
        
        // 获取最佳RSSHUB实例并转换URL
        const bestInstance = await rsshubService.selectBestInstance();
        actualUrl = rsshubService.convertRSSHubUrl(url, bestInstance);
        rsshubInfo = rsshubService.parseRSSHubUrl(url);
      }
      
      const response = await fetch(actualUrl, {
        headers: {
          'User-Agent': 'TechFlow Mobile App/1.0',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const xmlText = await response.text();
      
      // 检查是否是有效的RSS XML
      if (!xmlText.trim() || !xmlText.includes('<?xml') && !xmlText.includes('<rss') && !xmlText.includes('<feed')) {
        throw new Error('响应不是有效的RSS/Atom格式，也许轮改新罗不RSS转换');
      }
      
      // 简单的XML解析来提取基本信息
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
      throw new Error(`与RSS源不兼容: ${errorMsg}`);
    }
  }

  /**
   * 解析RSS Feed
   */
  private async parseRSSFeed(xmlText: string, source: RSSSource): Promise<Omit<Article, 'id'>[]> {
    // 增加诊断和防御代码
    if (!source || !source.id || !source.name) {
      console.error(
        'RSSService: parseRSSFeed received an invalid or incomplete source object. Aborting parse for this source. Source object:',
        JSON.stringify(source, null, 2)
      );
      return []; // 返回空数组以防止后续代码崩溃
    }

    const sourceId = typeof source.id === 'string' ? parseInt(source.id, 10) : source.id;
    const sourceName = source.name || 'Unknown Source';
    const shouldExtractImages = source.contentType === 'image_text';
    
    try {
      logger.info(`开始解析RSS Feed，源: ${sourceName}`);
      
      // 使用增强的RSS解析器解析RSS，支持media:content标签
      const rss = await parseEnhancedRSS(xmlText);
      
      // ============ 第一步：快速解析基本信息，用于找分界点 ============
      const basicItems: { url: string; title: string; publishedAt: Date; index: number }[] = [];
      
      for (let i = 0; i < rss.items.length; i++) {
        const item = rss.items[i];
        const itemLink = item.links?.[0]?.url || item.id || '';
        
        if (!item.title || !itemLink) {
          continue;
        }
        
        let publishedAt = new Date();
        if (item.published) {
          publishedAt = this.parsePublishedDate(item.published);
        }
        
        basicItems.push({
          url: itemLink,
          title: this.cleanTextContent(item.title),
          publishedAt,
          index: i
        });
      }
      
      // ============ 第二步：找分界点，识别新旧文章 ============
      const latestArticles = await this.databaseService.executeQuery(
        'SELECT url, title, published_at FROM articles WHERE rss_source_id = ? ORDER BY published_at DESC LIMIT 20',
        [sourceId]
      );
      
      let newArticlesEndIndex = basicItems.length; // 默认所有都是新文章
      
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
            logger.info(`✅ 检测到 ${i} 篇新文章，${basicItems.length - i} 篇是旧内容，跳过解析旧部分`);
            break;
          }
        }
      }
      
      // 如果没有新文章，直接返回
      if (newArticlesEndIndex === 0) {
        logger.info(`RSS源 ${sourceName} 没有新文章，跳过完整解析`);
        return [];
      }
      
      // 只取新文章的索引
      const newItemIndices = basicItems.slice(0, newArticlesEndIndex).map(item => item.index);
      logger.info(`仅对 ${newItemIndices.length} 篇新文章执行完整解析`);
      
      // ============ 第三步：只对新文章执行完整解析 ============
      const articles: Omit<Article, 'id'>[] = [];
      let skippedInvalid = 0;
      
      for (const idx of newItemIndices) {
        const item = rss.items[idx];
        const itemLink = item.links?.[0]?.url || item.id || '';
        
        if (!item.title || !itemLink) {
          skippedInvalid++;
          continue;
        }
        
        // 提取内容，优先使用content，其次使用description
        const rawContent = item.content || item.description || '';
        
        // 提取和清理内容
        const content = await this.extractContent(rawContent, itemLink, source.contentType || 'image_text');
        const wordCount = this.countWords(content);
        
        // 解析发布时间
        let publishedAt = new Date();
        if (item.published) {
          publishedAt = this.parsePublishedDate(item.published);
        }
        
        const article: Omit<Article, 'id'> = {
          title: this.cleanTextContent(item.title),
          url: itemLink,
          content: content,
          summary: this.generateSummary(content),
          author: item.authors && item.authors.length > 0 ? this.cleanTextContent(item.authors[0].name || '') : '',
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
        
        // 根据RSS源类型决定是否提取图片
        if (shouldExtractImages) {
          let imageUrl = null;
          
          // 1. 首先尝试从media:content中获取图片
          try {
            imageUrl = extractBestImageUrlFromItem(item);
          } catch (error) {
            // 忽略
          }
          
          // 2. 检查enclosure
          if (!imageUrl && item.enclosures && item.enclosures.length > 0) {
            const imageEnclosure = item.enclosures.find(enc => 
              enc.mimeType && enc.mimeType.startsWith('image/')
            );
            if (imageEnclosure) {
              imageUrl = imageEnclosure.url;
            }
          }
          
          // 3. 从内容中提取图片
          if (!imageUrl && rawContent) {
            try {
              imageUrl = await imageExtractionService.extractImageFromContent(rawContent);
            } catch (error) {
              // 忽略
            }
          }
          
          if (imageUrl) {
            article.imageUrl = imageUrl;
          }
        }
        
        articles.push(article);
      }
      
      logger.info(`RSS解析完成，源: ${sourceName}，解析 ${articles.length} 篇新文章，跳过 ${skippedInvalid} 个无效项目`);
      return articles;
    } catch (error) {
      logger.error(`RSS解析失败，源: ${sourceName}:`, error);
      throw error;
    }
  }

  /**
   * 提取文章内容
   */
  private async extractContent(rawContent: string, url: string, contentType: 'text' | 'image_text' = 'image_text'): Promise<string> {
    try {
      // 如果内容太短，尝试从原始URL获取完整内容
      if (rawContent.length < 200 && url) {
        const fullContent = await this.fetchFullContent(url);
        if (fullContent) {
          rawContent = fullContent;
        }
      }

      // 根据内容类型清理HTML内容
      // 修改：保留HTML结构，仅移除危险标签
      const cleanContent = this.preserveHtmlContent(rawContent, contentType);
      return cleanContent;
    } catch (error) {
      logger.error('内容提取失败:', error);
      return rawContent;
    }
  }

  /**
   * 从原始URL获取完整内容
   */
  private async fetchFullContent(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        }
      });

      if (!response.ok) {
        logger.warn(`无法获取完整内容 (${response.status}): ${url}`);
        return null;
      }

      const html = await response.text();
      
      // 使用正则表达式提取主要内容
      const contentSelectors = [
        /<article[^>]*>([\s\S]*?)<\/article>/i,
        /<div[^>]*class="[^"]*post-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
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
      logger.warn(`获取完整内容失败: ${url}`, error);
      return null;
    }
  }

  /**
   * 保留HTML结构的内容清理函数
   */
  private preserveHtmlContent(html: string, contentType: 'text' | 'image_text' = 'image_text'): string {
    try {
      // 使用正则表达式清理HTML内容，但保留结构
      let cleaned = html;
      
      // 移除危险标签
      cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      cleaned = cleaned.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
      cleaned = cleaned.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
      cleaned = cleaned.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
      cleaned = cleaned.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
      
      // 移除所有属性中的事件处理器
      cleaned = cleaned.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
      
      // 修复双等号问题（referrerpolicy=="no-referrer" -> referrerpolicy="no-referrer"）
      cleaned = cleaned.replace(/(\w+)==(["'])/g, '$1=$2');
      
      // 修复列表中的图片结构问题
      cleaned = this.fixListImages(cleaned);
      
      // 根据内容类型处理标签
      if (contentType === 'text') {
        // 纯文本模式：移除图片和其他媒体标签，保留文本格式标签
        cleaned = cleaned.replace(/<img[^>]*>/gi, '');
        cleaned = cleaned.replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '');
        cleaned = cleaned.replace(/<video[^>]*>[\s\S]*?<\/video>/gi, '');
        cleaned = cleaned.replace(/<audio[^>]*>[\s\S]*?<\/audio>/gi, '');
      }
      // image_text 模式：保留图片和视频标签，用于多媒体内容渲染
      
      // 保留基本的HTML结构标签
      // 不再将HTML标签转换为纯文本，而是保留结构
      return cleaned.trim();
    } catch (error) {
      logger.error('HTML内容保留失败:', error);
      return this.cleanHtmlWithRegex(html);
    }
  }

  /**
   * 清理文本内容（用于标题、作者等短文本）
   */
  private cleanTextContent(text: string): string {
    try {
      // 移除所有HTML标签，只保留纯文本
      let cleaned = text;
      
      // 移除HTML标签
      cleaned = cleaned.replace(/<[^>]*>/g, '');
      
      // 清理HTML实体
      cleaned = cleaned.replace(/&nbsp;/g, ' ');
      cleaned = cleaned.replace(/&amp;/g, '&');
      cleaned = cleaned.replace(/&lt;/g, '<');
      cleaned = cleaned.replace(/&gt;/g, '>');
      cleaned = cleaned.replace(/&quot;/g, '"');
      cleaned = cleaned.replace(/&#39;/g, "'");
      cleaned = cleaned.replace(/&hellip;/g, '...');
      
      // 标准化空白字符
      cleaned = cleaned.replace(/\s+/g, ' ');
      
      return cleaned.trim();
    } catch (error) {
      logger.error('文本清理失败:', error);
      return text.replace(/<[^>]*>/g, '').trim();
    }
  }

  /**
   * 修复列表中的图片结构问题
   */
  private fixListImages(html: string): string {
    if (!html) return html;
    let fixedHtml = html;

    // ---原有逻辑（针对不合规结构）---
    // 1. 处理紧跟在 </li> 后面的 <img>
    fixedHtml = fixedHtml.replace(
      /(<\/li>\s*)(<img[^>]+>)(?=\s*<li)/gi, 
      '$1<li style="list-style: none; margin: 8px 0;">$2</li>'
    );
    // 2. 处理被 <p> 包裹但夹在列表项中间的 <img>
    fixedHtml = fixedHtml.replace(
      /(<\/li>\s*)<p>([\s\S]*?<img[^>]+>[\s\S]*?)<\/p>(?=\s*<li)/gi,
      '$1<li style="list-style: none; margin: 8px 0;">$2</li>'
    );

    // ---新增逻辑（针对 RSS 结构）---
    // 3. 移除 li 内部的 p 标签，减少嵌套
    // 你的 RSS 是 <li><p>...<img/></p></li>
    // 我们把它变成 <li>...<img/></li>，这样渲染器更容易处理
    fixedHtml = fixedHtml.replace(
      /(<li[^>]*)>\s*<p[^>]*>([\s\S]*?)<\/p>\s*(<\/li>)/gi,
      '$1>$2$3'
    );

    return fixedHtml;
  }

  /**
   * 正则表达式清理HTML（备用方案）
   */
  private cleanHtmlWithRegex(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
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
        id: Number(result.insertId),
        ...article,
      };
    } catch (error) {
      logger.error('Error saving article:', error);
      return null;
    }
  }

  /**
   * 更新RSS源统计信息
   */
  private async updateSourceStats(sourceId: string): Promise<void> {
    try {
      // 获取该RSS源的文章数量
      const articleCountResult = await this.databaseService.executeQuery(
        'SELECT COUNT(*) as count FROM articles WHERE rss_source_id = ?',
        [sourceId]
      );
      const articleCount = articleCountResult[0]?.count || 0;
      
      // 获取该RSS源的未读文章数量
      const unreadCountResult = await this.databaseService.executeQuery(
        'SELECT COUNT(*) as count FROM articles WHERE rss_source_id = ? AND is_read = 0',
        [sourceId]
      );
      const unreadCount = unreadCountResult[0]?.count || 0;
      
      // 更新RSS源的统计信息
      await this.databaseService.executeStatement(
        'UPDATE rss_sources SET last_updated = ?, article_count = ?, unread_count = ? WHERE id = ?',
        [new Date().toISOString(), articleCount, unreadCount, sourceId]
      );
    } catch (error) {
      logger.error('Error updating source stats:', error);
    }
  }

  /**
   * 生成文章摘要
   */
  private generateSummary(content: string, maxLength: number = 200): string {
    const cleanContent = content.replace(/\s+/g, ' ').trim();
    if (cleanContent.length <= maxLength) {
      return cleanContent;
    }
    
    const truncated = cleanContent.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    return lastSpace > 0 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
  }

  /**
   * 解析发布日期
   */
  private parsePublishedDate(dateString: string): Date {
    if (!dateString) return new Date();
    
    // 尝试直接解析
    let parsedDate = new Date(dateString);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
    
    // 尝试ISO格式 (YYYY-MM-DDTHH:mm:ss)
    const isoMatch = dateString.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
    if (isoMatch) {
      parsedDate = new Date(isoMatch[1] + 'Z');
      if (!isNaN(parsedDate.getTime())) return parsedDate;
    }
    
    // 尝试RFC 2822格式 (Wed, 05 Sep 2025 23:19:00 GMT)
    const rfcMatch = dateString.match(/(\w{3}, \d{1,2} \w{3} \d{4} \d{2}:\d{2}:\d{2})/);
    if (rfcMatch) {
      parsedDate = new Date(rfcMatch[1]);
      if (!isNaN(parsedDate.getTime())) return parsedDate;
    }
    
    // 尝试简化的RFC格式 (Wed Sep 05 2025 23:19:00)
    const simpleRfcMatch = dateString.match(/(\w{3} \w{3} \d{1,2} \d{4} \d{2}:\d{2}:\d{2})/);
    if (simpleRfcMatch) {
      parsedDate = new Date(simpleRfcMatch[1]);
      if (!isNaN(parsedDate.getTime())) return parsedDate;
    }
    
    // 尝试YYYY-MM-DD格式
    const dateOnlyMatch = dateString.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateOnlyMatch) {
      parsedDate = new Date(dateOnlyMatch[1]);
      if (!isNaN(parsedDate.getTime())) return parsedDate;
    }
    
    // 尝试Unix时间戳
    const timestamp = parseInt(dateString);
    if (!isNaN(timestamp) && timestamp > 0) {
      // 检查是否为秒级时间戳（小于JavaScript毫秒时间戳）
      const date = timestamp < 10000000000 ? new Date(timestamp * 1000) : new Date(timestamp);
      if (!isNaN(date.getTime())) return date;
    }
    
    // 如果所有格式都失败，返回当前时间
    return new Date();
  }

  /**
   * 统计字数
   */
  private countWords(text: string): number {
    const cleanText = text.replace(/\s+/g, ' ').trim();
    if (!cleanText) return 0;
    
    // 中文字符按字计算，英文按词计算
    const chineseChars = cleanText.match(/[\u4e00-\u9fff]/g) || [];
    const englishWords = cleanText.replace(/[\u4e00-\u9fff]/g, '').match(/\b\w+\b/g) || [];
    
    return chineseChars.length + englishWords.length;
  }

  /**
   * 数据库行映射为RSSSource对象
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

  /**
   * 数据库行映射为RSSSource对象（包含计算的统计数据）
   */
  private mapRSSSourceRowWithStats(row: any): RSSSource {
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
      article_count: row.calculated_article_count || 0,
      unread_count: row.calculated_unread_count || 0,
      last_updated: row.last_updated,
    };
  }

  /**
   * 生成闽值(hash)来检查RSS内容是否更新
   */
  private simpleHash(str: string): number {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
  
  /**
   * 判断是否需要使用代理访関RSS源
   * @param url RSS源URL
   * @returns 是否需要使用代理
   */
  private shouldUseProxy(url: string): boolean {
    // 常见被Cloudflare保护的域名列表
    const cloudflareProtectedDomains = [
      'feedly.com',
      'medium.com',
      'github.com',
      // 可以根据实际情况添加更多域名
    ];
    
    try {
      const urlObj = new URL(url);
      return cloudflareProtectedDomains.some(domain => 
        urlObj.hostname.includes(domain)
      );
    } catch (error) {
      // 如果URL解析失败，不使用代理
      return false;
    }
  }
}

export const rssService = RSSService.getInstance();