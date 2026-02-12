import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
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
  private static readonly FULLTEXT_MIN_INTERVAL_MS = 1000;
  private static readonly FULLTEXT_JITTER_RATIO = 0.2;
  private static readonly FULLTEXT_TIMEOUT_MS = 20000;
  private static readonly FULLTEXT_COOLDOWN_429_MIN_MS = 30_000;
  private static readonly FULLTEXT_COOLDOWN_429_MAX_MS = 120_000;
  private static readonly FULLTEXT_COOLDOWN_403_MIN_MS = 5 * 60_000;
  private static readonly FULLTEXT_COOLDOWN_403_MAX_MS = 30 * 60_000;
  private static readonly FULLTEXT_TIMEOUT_BACKOFF_BASE_MS = 2000;
  private static readonly FULLTEXT_TIMEOUT_BACKOFF_MAX_MS = 60_000;
  private static readonly FULLTEXT_DOMAIN_STATE_MAX = 5000;
  private static readonly FULLTEXT_DOMAIN_STATE_TTL_MS = 6 * 60 * 60_000;
  private static readonly FULLTEXT_DOMAIN_STATE_PRUNE_INTERVAL_MS = 5 * 60_000;
  private static fulltextDomainLastPruneAt = 0;
  private static readonly VIDEO_URL_CACHE_TTL_MS = 10 * 60_000;

  private static readonly fulltextDomainStates = new Map<string, {
    tail: Promise<void>;
    nextAllowedAt: number;
    cooldownUntil: number;
    timeoutStrikes: number;
    lastSeenAt: number;
  }>();

  private readonly videoUrlCache = new Map<string, { url: string; at: number }>();

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

        try {
          const urlObj = new URL(itemLink);
          if (this.isXchuxingVideoUrl(urlObj)) {
            const videoUrl = await this.resolveVideoUrl(itemLink);
            if (videoUrl) {
              article.videoUrl = videoUrl;
            }
          }
        } catch {}
        
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
      try {
        const urlObj = new URL(url);
        if (this.isXchuxingVideoUrl(urlObj)) {
          return preserveHtmlContent(rawContent, contentType);
        }
      } catch {}

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

  public async resolveVideoUrl(pageUrl: string): Promise<string | null> {
    try {
      const now = Date.now();
      const cached = this.videoUrlCache.get(pageUrl);
      if (cached && now - cached.at <= RSSParserService.VIDEO_URL_CACHE_TTL_MS) {
        return cached.url;
      }

      const urlObj = new URL(pageUrl);
      const hostname = urlObj.hostname;

      const response = await this.withFulltextDomainLimit(hostname, async () => {
        return fetchWithRetry(pageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'identity',
            'Referer': urlObj.origin,
          },
          timeout: RSSParserService.FULLTEXT_TIMEOUT_MS,
          retries: 0,
        });
      });

      if (!response || !response.ok) return null;
      const html = await response.text();
      const { document } = parseHTML(html);

      if (this.isXchuxingVideoUrl(urlObj)) {
        const videoEl = (document as any).querySelector?.('#video');
        const direct = videoEl?.getAttribute?.('data-src') || videoEl?.getAttribute?.('src');
        const picked = typeof direct === 'string' ? direct.trim() : '';
        if (picked && (picked.includes('.m3u8') || picked.includes('.mp4'))) {
          this.videoUrlCache.set(pageUrl, { url: picked, at: now });
          return picked;
        }
      }

      const m3u8 = html.match(/https?:[^\"'\s>]+\.m3u8[^\"'\s>]*/i)?.[0];
      if (m3u8) {
        this.videoUrlCache.set(pageUrl, { url: m3u8, at: now });
        return m3u8;
      }

      const mp4 = html.match(/https?:[^\"'\s>]+\.mp4[^\"'\s>]*/i)?.[0];
      if (mp4) {
        this.videoUrlCache.set(pageUrl, { url: mp4, at: now });
        return mp4;
      }

      return null;
    } catch {
      return null;
    }
  }

  private async fetchFullContent(url: string): Promise<string | null> {
    try {
      const urlObj = new URL(url);
      const origin = urlObj.origin;
      const hostname = urlObj.hostname;

      const response = await this.withFulltextDomainLimit(hostname, async () => {
        return fetchWithRetry(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'identity',
            'Referer': origin,
          },
          timeout: RSSParserService.FULLTEXT_TIMEOUT_MS,
          retries: 0,
        });
      });

      if (!response || !response.ok) return null;

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

      if (this.isXchuxingVideoUrl(urlObj)) {
        const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
        if (metaDesc && metaDesc.trim()) {
          const escaped = this.escapeHtml(metaDesc.trim());
          return `<article><p>${escaped}</p></article>`;
        }
        return null;
      }

      if (this.isXchuxingArticleUrl(urlObj)) {
        const extracted = this.extractXchuxingArticleContent(document as unknown as Document);
        if (extracted) return extracted;
      }

      const reader = new Readability(document as unknown as Document);
      const article = reader.parse();

      const content = article?.content || null;
      if (content && this.looksLikeOnlyPolicyLinks(content)) {
        if (this.isXchuxingArticleUrl(urlObj)) {
          const extracted = this.extractXchuxingArticleContent(document as unknown as Document);
          if (extracted) return extracted;
        }
        return null;
      }

      return content;
    } catch (error) {
      logger.error('Fetch full content failed:', error);
      return null;
    }
  }

  private async withFulltextDomainLimit<T>(
    hostname: string,
    fn: () => Promise<T>
  ): Promise<T | null> {
    const state = this.getOrCreateFulltextDomainState(hostname);
    const previous = state.tail.catch(() => {});

    let release: (() => void) | undefined;
    const current = new Promise<void>(resolve => {
      release = resolve;
    });
    state.tail = previous.then(() => current);

    await previous;
    try {
      const now = Date.now();
      if (now < state.cooldownUntil) {
        return null;
      }

      const waitMs = Math.max(0, state.nextAllowedAt - now);
      if (waitMs > 0) {
        await RSSParserService.sleep(waitMs);
      }

      const jitter = 1 + (Math.random() * 2 - 1) * RSSParserService.FULLTEXT_JITTER_RATIO;
      const intervalMs = Math.max(0, Math.round(RSSParserService.FULLTEXT_MIN_INTERVAL_MS * jitter));
      state.nextAllowedAt = Date.now() + intervalMs;

      const result = await fn();
      state.timeoutStrikes = 0;

      const status = (result as any)?.status;
      if (status === 429) {
        state.cooldownUntil = Date.now() + RSSParserService.randomInt(
          RSSParserService.FULLTEXT_COOLDOWN_429_MIN_MS,
          RSSParserService.FULLTEXT_COOLDOWN_429_MAX_MS
        );
      } else if (status === 403 || status === 401) {
        state.cooldownUntil = Date.now() + RSSParserService.randomInt(
          RSSParserService.FULLTEXT_COOLDOWN_403_MIN_MS,
          RSSParserService.FULLTEXT_COOLDOWN_403_MAX_MS
        );
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isTimeout = message.toLowerCase().includes('timeout');

      if (isTimeout) {
        state.timeoutStrikes = Math.min(state.timeoutStrikes + 1, 10);
        const backoff = Math.min(
          RSSParserService.FULLTEXT_TIMEOUT_BACKOFF_MAX_MS,
          RSSParserService.FULLTEXT_TIMEOUT_BACKOFF_BASE_MS * Math.pow(2, state.timeoutStrikes - 1)
        );
        state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + backoff);
      }

      return null;
    } finally {
      if (release) release();
    }
  }

  private getOrCreateFulltextDomainState(hostname: string) {
    const key = hostname || 'unknown';
    const now = Date.now();
    this.pruneFulltextDomainStatesIfNeeded(now);
    const existing = RSSParserService.fulltextDomainStates.get(key);
    if (existing) {
      existing.lastSeenAt = now;
      RSSParserService.fulltextDomainStates.delete(key);
      RSSParserService.fulltextDomainStates.set(key, existing);
      return existing;
    }

    const created = {
      tail: Promise.resolve(),
      nextAllowedAt: 0,
      cooldownUntil: 0,
      timeoutStrikes: 0,
      lastSeenAt: now,
    };
    RSSParserService.fulltextDomainStates.set(key, created);
    return created;
  }

  private pruneFulltextDomainStatesIfNeeded(now: number) {
    if (now - RSSParserService.fulltextDomainLastPruneAt < RSSParserService.FULLTEXT_DOMAIN_STATE_PRUNE_INTERVAL_MS) {
      return;
    }
    RSSParserService.fulltextDomainLastPruneAt = now;

    const expireBefore = now - RSSParserService.FULLTEXT_DOMAIN_STATE_TTL_MS;
    for (const [k, v] of RSSParserService.fulltextDomainStates.entries()) {
      if (v.lastSeenAt < expireBefore) {
        RSSParserService.fulltextDomainStates.delete(k);
      }
    }

    while (RSSParserService.fulltextDomainStates.size > RSSParserService.FULLTEXT_DOMAIN_STATE_MAX) {
      const firstKey = RSSParserService.fulltextDomainStates.keys().next().value as string | undefined;
      if (!firstKey) break;
      RSSParserService.fulltextDomainStates.delete(firstKey);
    }
  }

  private static async sleep(ms: number): Promise<void> {
    if (!ms || ms <= 0) return;
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private static randomInt(min: number, max: number): number {
    const minInt = Math.ceil(min);
    const maxInt = Math.floor(max);
    if (maxInt <= minInt) return minInt;
    return Math.floor(Math.random() * (maxInt - minInt + 1)) + minInt;
  }

  private isXchuxingArticleUrl(urlObj: URL): boolean {
    return urlObj.hostname === 'www.xchuxing.com' && urlObj.pathname.startsWith('/article/');
  }

  private isXchuxingVideoUrl(urlObj: URL): boolean {
    return urlObj.hostname === 'www.xchuxing.com' && urlObj.pathname.startsWith('/video/');
  }

  private extractXchuxingArticleContent(document: Document): string | null {
    const titleEl = document.querySelector('.acticle-bigtitle');
    if (!titleEl) return null;

    const titleText = (titleEl.textContent || '').replace(/\s+/g, ' ').trim();

    const cateEl = document.querySelector('.cate-tags');
    let node: Element | null = cateEl ? cateEl.nextElementSibling : titleEl.nextElementSibling;

    let contentEl: Element | null = null;
    while (node) {
      if (node.tagName.toLowerCase() === 'div') {
        const textLen = (node.textContent || '').replace(/\s+/g, '').trim().length;
        const hasStructured = !!node.querySelector('p,figure,img');
        if (hasStructured && textLen >= 80) {
          contentEl = node;
          break;
        }
      }
      node = node.nextElementSibling;
    }

    if (!contentEl) return null;

    const bodyHtml = (contentEl as HTMLElement).innerHTML?.trim() || '';
    if (bodyHtml.length < 80) return null;

    const escapedTitle = titleText ? this.escapeHtml(titleText) : '';
    const titleHtml = escapedTitle ? `<h1>${escapedTitle}</h1>` : '';
    return `<article>${titleHtml}${bodyHtml}</article>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private looksLikeOnlyPolicyLinks(html: string): boolean {
    const text = cleanTextContent(html);
    if (text.length >= 200) return false;
    return (
      (text.includes('用户协议') || text.includes('用户条款')) &&
      (text.includes('隐私政策') || text.includes('隐私'))
    );
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
