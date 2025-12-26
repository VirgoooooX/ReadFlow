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
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import cacheEventEmitter from '../CacheEventEmitter';

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
      // 🔥 清理 URL：去除空格和末尾多余斜杠
      let actualUrl = url.trim();
      // 对于普通 URL，移除末尾斜杠（保留根路径的斜杠，如 http://example.com/）
      if (actualUrl.match(/\/[^/]+\/$/) && !actualUrl.endsWith('://')) {
        actualUrl = actualUrl.replace(/\/$/, '');
        logger.info(`[validateRSSFeed] 已移除末尾斜杠: ${url} -> ${actualUrl}`);
      }
      
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
      
      // 🔥 增强的 RSS/Atom 格式检测
      const trimmedXml = xmlText.trim();
      
      // 检测 Cloudflare 人机验证拦截
      if (trimmedXml.includes('Just a moment') && trimmedXml.includes('_cf_chl_opt')) {
        throw new Error('该网站启用了 Cloudflare 防护，无法直接访问\n\n建议：\n• 尝试通过 RSSHub 订阅\n• 使用第三方 RSS 服务');
      }
      
      // 检测 HTML 错误页面（通常表示 URL 错误或者 403/404）
      if (trimmedXml.startsWith('<!DOCTYPE html') || trimmedXml.startsWith('<html')) {
        throw new Error('该地址返回的是网页而非 RSS\n\n建议：\n• 检查 URL 是否正确\n• 确认该网站提供 RSS 订阅');
      }
      
      // 检测是否是有效的 XML/RSS/Atom
      const isValidFormat = 
        trimmedXml.includes('<?xml') || 
        trimmedXml.includes('<rss') || 
        trimmedXml.includes('<feed') ||
        trimmedXml.includes('<channel') ||  // 某些源直接以 channel 开头
        trimmedXml.includes('xmlns="http://www.w3.org/2005/Atom"'); // Atom 命名空间
      
      if (!trimmedXml || !isValidFormat) {
        // 提供更详细的错误信息
        const preview = trimmedXml.substring(0, 200);
        logger.error(`无效的 RSS 响应内容预览: ${preview}`);
        throw new Error('响应不是有效的 RSS/Atom 格式\n\n建议：\n• 检查 URL 是否正确\n• 尝试在浏览器中打开确认');
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
      
      // logger.info(`[parseRSSFeedAndSave] ${source.name}: 保存 ${savedArticles.length} 篇新文章`);
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
      
      // 根据设置截断文章列表
      const maxArticles = source.maxArticles || 20; // 默认 20 篇
      const itemsCount = maxArticles > 0 ? Math.min(rss.items.length, maxArticles) : rss.items.length;
      
      if (maxArticles > 0 && rss.items.length > maxArticles) {
        logger.info(`[RSS] 限制文章数量: ${rss.items.length} -> ${maxArticles}`);
      }
      
      // 快速解析基本信息，找分界点
      const basicItems: { url: string; title: string; publishedAt: Date; index: number }[] = [];
      
      for (let i = 0; i < itemsCount; i++) {
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
            // logger.info(`检测到 ${i} 篇新文章`);
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
        // ⚡️ 避免主线程阻塞：每解析一篇重型文章就让出控制权
        await new Promise(resolve => setTimeout(resolve, 0));

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
                // logger.info(`[图片说明] ${imageCaption || ''}${imageCredit ? ` (来源: ${imageCredit})` : ''}`);
              }
            }
          } catch (error) {
            // 忽略
          }
          
          if (!imageUrl && item.enclosures && item.enclosures.length > 0) {
            const imageEnclosure = item.enclosures.find(enc => 
              enc.mimeType?.startsWith('image/')
            );
            if (imageEnclosure) {
              imageUrl = imageEnclosure.url;
            }
          }
          
          // 🔥 优先从全文内容中提取图片（content 可能是从原文链接抓取的全文）
          // 如果 RSS 只有短摘要，fixedRawContent 里没有图片，但 content 里有
          if (!imageUrl && content) {
            try {
              imageUrl = await imageExtractionService.extractImageFromContent(content, itemLink);
              if (imageUrl) {
                // logger.info(`[图片提取] 从全文内容中提取到图片: ${imageUrl}`);
              }
            } catch (error) {
              // 忽略
            }
          }
          
          // 备选：从原始 RSS 内容中提取
          if (!imageUrl && fixedRawContent && fixedRawContent !== content) {
            try {
              imageUrl = await imageExtractionService.extractImageFromContent(fixedRawContent, itemLink);
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

      // 🔥 应用过滤规则 (核心功能)
      const filteredArticles = await this.applyFilterRules(articles, sourceId);
      logger.info(`过滤后剩余 ${filteredArticles.length} 篇文章 (被过滤: ${articles.length - filteredArticles.length} 篇)`);
      
      return filteredArticles;
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
   * 从原始 URL 获取完整内容（使用 Mozilla Readability）
   */
  private async fetchFullContent(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: {
          // 🔥 伪装成手机浏览器，通常能拿到更简洁的页面
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      });

      if (!response.ok) {
        logger.error(`[fetchFullContent] HTTP ${response.status} for ${url}`);
        return null;
      }

      const html = await response.text();
      
      // 🔥 使用 linkedom 创建虚拟 DOM（解决正则无法处理嵌套 div 的问题）
      const { document } = parseHTML(html);
      
      // 🔥 关键优化：处理懒加载图片（在 Readability 解析前）
      const imgs = document.querySelectorAll('img');
      // 将 NodeList 转换为数组以便遍历
      const imgArray = Array.from(imgs);
      
      for (let i = 0; i < imgArray.length; i++) {
        // 每处理 10 张图片让出一次主线程
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        const img = imgArray[i] as any;
        // 常见的懒加载属性
        const realSrc = img.getAttribute('data-src') || 
                       img.getAttribute('data-original') || 
                       img.getAttribute('data-url') ||
                       img.getAttribute('data-actualsrc');
        
        if (realSrc) {
          img.setAttribute('src', realSrc);
          // logger.info(`[fetchFullContent] 修复懒加载图片: ${realSrc}`);
        }
        
        // 🔥 关键优化：修复相对路径
        const src = img.getAttribute('src');
        if (src && src.startsWith('/')) {
          try {
            const baseUrl = new URL(url).origin;
            const fullUrl = `${baseUrl}${src}`;
            img.setAttribute('src', fullUrl);
            logger.info(`[fetchFullContent] 修复相对路径: ${src} -> ${fullUrl}`);
          } catch (error) {
            logger.warn(`[fetchFullContent] 无法解析 URL: ${url}`);
          }
        }
      }
      
      // 让出主线程给 UI 渲染
      await new Promise(resolve => setTimeout(resolve, 0));

      // 🔥 使用 Readability 智能提取正文
      const reader = new Readability(document);
      const article = reader.parse();
      
      if (article && article.content) {
        return article.content; // 返回清洗过、保留了格式的纯净 HTML
      }
      
      return null;

    } catch (error) {
      logger.error('[fetchFullContent] 获取全文失败:', error);
      return null;
    }
  }

  /**
   * 🔥 应用过滤规则 - 白名单优先，黑名单次之
   */
  private async applyFilterRules(
    articles: Omit<Article, 'id'>[],
    sourceId: number
  ): Promise<Omit<Article, 'id'>[]> {
    try {
      // 1. 获取该源生效的所有规则 (全局 + 绑定的)
      const rules = await this.databaseService.getEffectiveRules(sourceId);
      
      if (rules.length === 0) {
        return articles; // 没有规则，直接返回
      }
      
      // 2. 分类规则
      const whitelist = rules.filter((r: any) => r.mode === 'include');
      const blacklist = rules.filter((r: any) => r.mode === 'exclude');
      
      logger.info(`[过滤规则] 白名单: ${whitelist.length} 条, 黑名单: ${blacklist.length} 条`);
      
      // 3. 应用过滤
      const filteredArticles: Omit<Article, 'id'>[] = [];
      
      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        
        // 每处理 5 篇文章让出一次主线程
        if (i % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        const title = (article.title || '').toLowerCase();
        const summary = (article.summary || '').toLowerCase();
        const content = (article.content || '').toLowerCase();
        const contentToCheck = `${title} ${summary} ${content}`;
        
        // 辅助函数：检查是否命中规则
        const checkMatch = (rule: any): boolean => {
          if (rule.is_regex === 1) {
            try {
              const regex = new RegExp(rule.keyword, 'i');
              return regex.test(contentToCheck);
            } catch (e) {
              logger.warn(`[过滤规则] 无效的正则: ${rule.keyword}`);
              return false;
            }
          } else {
            // 普通文本匹配
            return contentToCheck.includes(rule.keyword.toLowerCase());
          }
        };
        
        let keep = true;

        // 🔥 白名单检查：如果存在白名单，文章**必须**命中至少一条
        if (whitelist.length > 0) {
          const hitsWhitelist = whitelist.some(rule => checkMatch(rule));
          if (!hitsWhitelist) {
            keep = false; // 未命中白名单，直接丢弃
          }
        }
        
        // 🔥 黑名单检查：如果命中任何一条黑名单，直接丢弃
        if (keep && blacklist.length > 0) {
          const hitsBlacklist = blacklist.some(rule => checkMatch(rule));
          if (hitsBlacklist) {
            keep = false; // 命中黑名单，丢弃
          }
        }
        
        if (keep) {
          filteredArticles.push(article);
        }
      }
      
      return filteredArticles;
    } catch (error) {
      logger.error('[过滤规则] 应用失败:', error);
      return articles; // 失败时返回原列表，不影响正常使用
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
      
      // 🔥 发射事件通知 RSS 源统计已更新，触发 UI 刷新
      cacheEventEmitter.updateRSSStats();
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
      // 使用 Set 存储正在执行的 Promise，避免 Promise.race 的逻辑缺陷
      const executing = new Set<Promise<void>>();

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

        // 包装 promise 以便在完成后从集合中移除自己
        const wrappedPromise = promise.then(() => {
          executing.delete(wrappedPromise);
        });

        executing.add(wrappedPromise);

        if (executing.size >= maxConcurrent) {
          // 等待任意一个任务完成
          await Promise.race(executing);
        }
      }

      // 等待剩余所有任务完成
      await Promise.all(executing);
    };

    await executeWithConcurrency(sources);

    return { success, failed, totalArticles, errors };
  }
}

export const localRSSService = LocalRSSService.getInstance();
