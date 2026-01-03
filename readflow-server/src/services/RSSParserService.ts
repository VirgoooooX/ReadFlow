import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import fetch from 'node-fetch';
import { Article, RSSSource, FilterRule } from '../types';
import { parseEnhancedRSS, extractBestImageWithCaption } from './EnhancedRSSParser';
import { imageExtractionService } from './ImageExtractionService';
import { rsshubService } from './RSShubService';
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
  proxyImages,
  needsProxy,
  getProxyUrl,
} from '../utils/RSSUtils';
import { AppError } from '../utils/AppError';

export class RSSParserService {
  private static instance: RSSParserService;

  private constructor() {}

  public static getInstance(): RSSParserService {
    if (!RSSParserService.instance) {
      RSSParserService.instance = new RSSParserService();
    }
    return RSSParserService.instance;
  }

  /**
   * 验证 RSS 源
   */
  public async validateRSSFeed(url: string): Promise<{
    title?: string;
    description?: string;
    language?: string;
    url?: string;
  }> {
    try {
      let actualUrl = url.trim();
      if (actualUrl.match(/\/[^/]+\/$/) && !actualUrl.endsWith('://')) {
        actualUrl = actualUrl.replace(/\/$/, '');
      }
      
      let rsshubInfo = null;
      
      if (rsshubService.isRSSHubUrl(url)) {
        if (!rsshubService.validateRSSHubPath(url)) {
          throw new Error('Invalid RSSHUB URL format');
        }
        const bestInstance = await rsshubService.selectBestInstance();
        actualUrl = rsshubService.convertRSSHubUrl(url, bestInstance);
        rsshubInfo = rsshubService.parseRSSHubUrl(url);
      }
      
      const useCorsProxy = shouldUseCorsProxy(actualUrl);
      
      // Node.js 不需要 CORS 代理，但如果源屏蔽了非浏览器 UA，fetchWithRetry 会处理
      // 这里保留逻辑以防万一
      
      let finalUrl = actualUrl;
      // Server-side usually doesn't need allorigins unless IP is blocked
      
      const response = await fetchWithRetry(finalUrl, {
        timeout: 20000
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const xmlText = await response.text();
      const trimmedXml = xmlText.trim();
      
      if (trimmedXml.includes('Just a moment') && trimmedXml.includes('_cf_chl_opt')) {
        throw new Error('Cloudflare protection detected');
      }
      
      if (trimmedXml.startsWith('<!DOCTYPE html') || trimmedXml.startsWith('<html')) {
        throw new Error('Response is HTML, not RSS');
      }
      
      const isValidFormat = 
        trimmedXml.includes('<?xml') || 
        trimmedXml.includes('<rss') || 
        trimmedXml.includes('<feed') ||
        trimmedXml.includes('<channel') ||
        trimmedXml.includes('xmlns="http://www.w3.org/2005/Atom"');
      
      if (!trimmedXml || !isValidFormat) {
        throw new Error('Invalid RSS/Atom format');
      }
      
      const titleMatch = xmlText.match(/<title[^>]*>([^<]+)<\/title>/i);
      const descMatch = xmlText.match(/<description[^>]*>([^<]+)<\/description>/i);
      const langMatch = xmlText.match(/<language[^>]*>([^<]+)<\/language>/i);
      
      return {
        title: rsshubInfo?.description || (titleMatch ? titleMatch[1].trim() : undefined),
        description: descMatch ? descMatch[1].trim() : rsshubInfo?.description,
        language: langMatch ? langMatch[1].trim() : undefined,
        url: actualUrl,
      };
    } catch (error) {
      logger.error(`RSS validation failed [${url}]:`, error);
      throw error;
    }
  }

  /**
   * 获取并解析文章
   */
  public async fetchAndParseArticles(
    source: RSSSource,
    filterRules: FilterRule[] = [],
    baseUrl?: string,
    imageCompression: boolean = true,
    imageQuality: number = 80,
    applyImageProxy: boolean = true,
    fetchTimeoutMs?: number
  ): Promise<Article[]> {
    try {
      logger.info(`Fetching articles from: ${source.url}`);
      
      let actualUrl = source.url;
      if (rsshubService.isRSSHubUrl(source.url)) {
        const bestInstance = await rsshubService.selectBestInstance();
        actualUrl = rsshubService.convertRSSHubUrl(source.url, bestInstance);
      }
      
      const response = await fetchWithRetry(actualUrl, {
        timeout: typeof fetchTimeoutMs === 'number' && Number.isFinite(fetchTimeoutMs) ? fetchTimeoutMs : 15000
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const xmlText = await response.text();
      
      // 解析 RSS
      const articles = await this.parseRSSFeed(xmlText, source, baseUrl, imageCompression, imageQuality, applyImageProxy);
      
      // 应用过滤规则
      const filteredArticles = this.applyFilterRules(articles, filterRules);
      
      return filteredArticles as Article[];
    } catch (error) {
      logger.error(`Error fetching articles from ${source.url}:`, error);
      throw error;
    }
  }

  private async parseRSSFeed(
    xmlText: string, 
    source: RSSSource, 
    baseUrl?: string,
    imageCompression: boolean = true,
    imageQuality: number = 80,
    applyImageProxy: boolean = true
  ): Promise<Omit<Article, 'id'>[]> {
    const sourceName = source.name || 'Unknown Source';
    const shouldExtractImages = source.contentType === 'image_text';
    
    try {
      const rss = await parseEnhancedRSS(xmlText);
      
      const maxArticles = source.maxArticles || 20;
      const itemsCount = maxArticles > 0 ? Math.min(rss.items.length, maxArticles) : rss.items.length;
      
      const articles: Omit<Article, 'id'>[] = [];
      
      for (let i = 0; i < itemsCount; i++) {
        const item = rss.items[i];
        const itemLink = item.links?.[0]?.url || item.id || '';
        
        if (!item.title || !itemLink) continue;
        
        let rawContent = item.content || item.description || '';
        const fixedRawContent = fixRelativeImageUrls(rawContent, itemLink);
        
        if (item.content) {
          item.content = fixedRawContent;
        } else if (item.description) {
          item.description = fixedRawContent;
        }
        
        let content = await this.extractContent(fixedRawContent, itemLink, source.contentType || 'image_text');
        
        if (applyImageProxy) {
          content = proxyImages(content, baseUrl, imageCompression, imageQuality);
        }

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
          publishedAt: publishedAt.toISOString(),
          sourceId: source.id,
          sourceName: sourceName,
          category: source.category || 'General',
          wordCount: wordCount,
          readingTime: Math.ceil(wordCount / 200),
          difficulty: 'intermediate',
          isRead: false,
          isFavorite: false,
          readProgress: 0,
          tags: [],
        };
        
        if (shouldExtractImages) {
          let imageUrl = null;
          let imageCaption: string | undefined;
          let imageCredit: string | undefined;
          
          try {
            const imageInfo = extractBestImageWithCaption(item, { sourceUrl: source.url });
            if (imageInfo) {
              imageUrl = imageInfo.url;
              imageCaption = imageInfo.caption || imageInfo.alt;
              imageCredit = imageInfo.credit;
            }
          } catch (error) {}
          
          if (!imageUrl && content) {
            try {
              imageUrl = await imageExtractionService.extractImageFromContent(content, itemLink);
            } catch (error) {}
          }
          
          if (imageUrl) {
            if (applyImageProxy) {
              if (needsProxy(imageUrl, baseUrl, imageCompression)) {
                imageUrl = getProxyUrl(imageUrl, baseUrl, imageCompression, imageQuality);
              }
            }

            article.imageUrl = imageUrl;
            article.imageCaption = imageCaption;
            article.imageCredit = imageCredit;
          }
        }
        
        articles.push(article);
      }
      
      return articles;
    } catch (error) {
      logger.error(`RSS Parsing failed for ${sourceName}:`, error);
      throw error;
    }
  }

  private async extractContent(
    rawContent: string, 
    url: string, 
    contentType: 'text' | 'image_text' = 'image_text'
  ): Promise<string> {
    try {
      const shouldFetch = rawContent.length < 500 || 
                         rawContent.includes('阅读全文') || 
                         rawContent.includes('Read more') ||
                         rawContent.includes('查看全文');

      if (shouldFetch && url) {
        const fullContent = await this.fetchFullContent(url);
        if (fullContent) {
          rawContent = fullContent;
          rawContent = fixRelativeImageUrls(rawContent, url);
        }
      }

      return preserveHtmlContent(rawContent, contentType);
    } catch (error) {
      logger.error('Content extraction failed:', error);
      return rawContent;
    }
  }

  private async fetchFullContent(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      });

      if (!response.ok) return null;

      const html = await response.text();
      const { document } = parseHTML(html);
      
      // Fix lazy loading images
      const imgs = document.querySelectorAll('img');
      Array.from(imgs).forEach((img: any) => {
        const realSrc = img.getAttribute('data-src') || 
                       img.getAttribute('data-original') || 
                       img.getAttribute('data-url');
        if (realSrc) img.setAttribute('src', realSrc);
        
        const src = img.getAttribute('src');
        if (src && src.startsWith('/')) {
          try {
            const baseUrl = new URL(url).origin;
            img.setAttribute('src', `${baseUrl}${src}`);
          } catch (e) {}
        }
      });

      const reader = new Readability(document as unknown as Document);
      const article = reader.parse();
      
      return article?.content || null;
    } catch (error) {
      logger.error('Fetch full content failed:', error);
      return null;
    }
  }

  private applyFilterRules(
    articles: Omit<Article, 'id'>[],
    rules: FilterRule[]
  ): Omit<Article, 'id'>[] {
    if (!rules || rules.length === 0) return articles;

    const whitelist = rules.filter(r => r.mode === 'include');
    const blacklist = rules.filter(r => r.mode === 'exclude');

    if (whitelist.length === 0 && blacklist.length === 0) return articles;

    return articles.filter(article => {
      const contentToCheck = `${article.title || ''} ${article.summary || ''} ${article.content || ''}`.toLowerCase();
      
      const checkMatch = (rule: FilterRule): boolean => {
        if (rule.isRegex) {
          try {
            return new RegExp(rule.keyword, 'i').test(contentToCheck);
          } catch { return false; }
        }
        return contentToCheck.includes(rule.keyword.toLowerCase());
      };

      if (whitelist.length > 0) {
        const hitsWhitelist = whitelist.some(rule => checkMatch(rule));
        if (!hitsWhitelist) return false;
      }

      if (blacklist.length > 0) {
        const hitsBlacklist = blacklist.some(rule => checkMatch(rule));
        if (hitsBlacklist) return false;
      }

      return true;
    });
  }
}

export const rssParserService = RSSParserService.getInstance();
