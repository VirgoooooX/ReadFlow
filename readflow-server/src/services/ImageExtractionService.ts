import fetch from 'node-fetch';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/Logger';

export interface ImageCandidate {
  url: string;
  source: 'content_img';
  width?: number;
  height?: number;
  type?: string;
  position?: number; // 在内容中的位置
}

export interface ImageValidationResult {
  isValid: boolean;
  width?: number;
  height?: number;
  size?: number;
  error?: string;
}

export class ImageExtractionService {
  private static instance: ImageExtractionService;
  private readonly MIN_WIDTH = 300;
  private readonly MIN_HEIGHT = 200;
  private readonly TIMEOUT_MS = 2000;
  private readonly ALLOWED_FORMATS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  private readonly EXCLUDED_KEYWORDS = [
    'icon', 'logo', 'button', 'ad', 'banner', 'avatar', 'thumb', 'favicon',
    'sprite', 'badge', 'emoji', 'arrow', 'bullet', 'dot', 'pixel',
    'spacer', 'divider', 'border', 'corner', 'shadow', 'gradient',
    'twitter', 'facebook', 'social', 'share', 'topic', 'tag', 'category'
  ];
  private readonly MIN_FILE_SIZE = 5000; // 5KB 最小文件大小
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB 最大文件大小
  
  // 🔥 防盗链域名列表 - 这些域名跳过 HEAD 验证（因为会被拒绝）
  private readonly ANTI_HOTLINK_DOMAINS = [
    'cdnfile.sspai.com', 'cdn.sspai.com', 'sspai.com',
    's3.ifanr.com', 'images.ifanr.cn', 'ifanr.com',
    'cnbetacdn.com', 'static.cnbetacdn.com',
    'twimg.com', 'pbs.twimg.com',
    'miro.medium.com',
  ]

  constructor() {}

  public static getInstance(): ImageExtractionService {
    if (!ImageExtractionService.instance) {
      ImageExtractionService.instance = new ImageExtractionService();
    }
    return ImageExtractionService.instance;
  }

  /**
   * 非阻塞延迟函数
   * @param ms 延迟毫秒数
   */
  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 从RSS内容中提取最佳图片
   */
  public async extractBestImage(rssItemContent: string): Promise<string | undefined> {
    return this.extractImageFromContent(rssItemContent);
  }

  /**
   * 从RSS文章内容中提取图片 - 重构版本
   */
  public async extractImageFromContent(content: string, articleUrl?: string, existingImageUrl?: string): Promise<string | undefined> {
    try {
      // 0. 如果已有图片，跳过提取过程
      if (existingImageUrl) {
        return existingImageUrl;
      }
      
      // 检查内容是否有效
      if (!content || content.length === 0) {
        return undefined;
      }
      
      // 直接从文章内容中的img标签提取图片
      const contentImage = await this.extractFromContentImages(content);
      if (contentImage) {
        return contentImage;
      }
      
      return undefined;
    } catch (error) {
      logger.warn('Image extraction failed:', error);
      return undefined;
    }
  }

  private async extractFromContentImages(content: string): Promise<string | null> {
    try {
      if (!content || content.length === 0) {
        return null;
      }

      const decodedContent = this.decodeHtml(content);
      
      // 使用正则表达式匹配第一个图片
      const imgRegex = /<img[^>]+src=["']([^"]+)["'][^>]*>/i;
      const match = imgRegex.exec(decodedContent);

      if (match && match[1]) {
        const imageUrl = match[1];

        // 1. 基础同步检查
        if (this.looksLikeImageUrl(imageUrl) && this.isValidImageUrl(imageUrl)) {
          // 2. 异步文件大小检查
          const validationResult = await this.validateImage(imageUrl);

          if (validationResult.isValid) {
            return imageUrl; // 验证通过，返回URL
          } else {
            return null; // 验证失败，返回null
          }
        } else {
          return null; // 基础检查失败，返回null
        }
      }

      return null;
    } catch (error) {
      logger.warn('从内容img标签提取图片时出错:', error);
      return null;
    }
  }

  /**
   * HTML解码函数 - 增强版本
   */
  private decodeHtml(html: string): string {
    if (!html || typeof html !== 'string') {
      return '';
    }
    
    const entities: { [key: string]: string } = {
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
      '&amp;': '&',
      '&#39;': "'",
      '&#34;': '"',
      '&#x27;': "'",
      '&#x22;': '"'
    };
    
    // 处理命名实体
    let decoded = html.replace(/&(lt|gt|quot|apos|amp);/g, (match, entity) => {
      const result = entities[`&${entity};`] || match;
      return result;
    });
    
    // 处理数字实体
    decoded = decoded.replace(/&#(\d+);/g, (match, code) => {
      try {
        const char = String.fromCharCode(parseInt(code));
        return char;
      } catch (error) {
        return match;
      }
    });
    
    // 处理十六进制实体
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      try {
        const char = String.fromCharCode(parseInt(hex, 16));
        return char;
      } catch (error) {
        return match;
      }
    });
    
    return decoded;
  }

  /**
   * 检查URL是否看起来像图片 - 增强版
   */
  private looksLikeImageUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }
    
    const urlLower = url.toLowerCase();
    
    // 检查是否包含图片扩展名
    const hasImageExtension = this.ALLOWED_FORMATS.some(format => {
      const result = urlLower.includes(format);
      return result;
    });
    
    // 检查是否是已知的图片CDN域名
    const imageHostnames = [
      's.yimg.com',           // Yahoo/Engadget CDN
      'techcrunch.com',       // TechCrunch
      'engadget.com',         // Engadget
      'cloudfront.net',       // AWS CloudFront
      'amazonaws.com',        // AWS S3
      'gstatic.com',          // Google Static
      'googleapis.com',       // Google APIs
      'o.aolcdn.com',         // AOL CDN (Engadget使用)
      // 🔥 防盗链 CDN 也认为是有效图片域名
      'cdnfile.sspai.com', 'cdn.sspai.com',
      's3.ifanr.com', 'images.ifanr.cn',
      'cnbetacdn.com', 'static.cnbetacdn.com',
      'twimg.com', 'pbs.twimg.com',
      'miro.medium.com',
    ];
    
    const isImageHost = imageHostnames.some(hostname => {
      const result = urlLower.includes(hostname);
      return result;
    });
    
    // 如果包含图片扩展名 or 来自图片CDN，则认为是图片
    const result = hasImageExtension || isImageHost;
    return result;
  }

  /**
   * 验证图片URL有效性
   */
  private isValidImageUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * 检查是否为允许的图片格式 - 优化版
   */
  private isAllowedImageFormat(url: string): boolean {
    const urlLower = url.toLowerCase();
    
    // 检查图片扩展名
    const hasImageExtension = this.ALLOWED_FORMATS.some(format => 
      urlLower.includes(format) || urlLower.endsWith(format)
    );
    
    // 如果没有扩展名，检查是否来自知名图片CDN
    if (!hasImageExtension) {
      const imageHosts = ['s.yimg.com', 'techcrunch.com', 'engadget.com'];
      return imageHosts.some(host => urlLower.includes(host));
    }
    
    return hasImageExtension;
  }

  /**
   * 检查是否是防盗链域名
   */
  private isAntiHotlinkDomain(url: string): boolean {
    const urlLower = url.toLowerCase();
    return this.ANTI_HOTLINK_DOMAINS.some(domain => urlLower.includes(domain));
  }

  /**
   * 异步验证图片质量
   */
  private async validateImage(url: string): Promise<ImageValidationResult> {
    try {
      // 🔥 对于防盗链域名，跳过 HEAD 验证（会被拒绝），直接返回成功
      if (this.isAntiHotlinkDomain(url)) {
        return { isValid: true };
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
      
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal as any, // Cast to any because node-fetch types might differ
        headers: {
          'User-Agent': 'ReadFlow Mobile App/1.0'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return {
          isValid: false,
          error: `HTTP ${response.status}`
        };
      }
      
      // 检查内容类型
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.startsWith('image/')) {
        return {
          isValid: false,
          error: 'Invalid content type'
        };
      }
      
      // 检查文件大小
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const size = parseInt(contentLength);
        
        // 对于gif文件，要求更大的文件大小（通常小gif是图标）
        const isGif = contentType.includes('gif');
        const minSize = isGif ? 20000 : this.MIN_FILE_SIZE; // gif至少20KB
        
        if (size < minSize) {
          return {
            isValid: false,
            error: `Image too small (${size} bytes, likely icon/logo)`
          };
        }
        if (size > this.MAX_FILE_SIZE) {
          return {
            isValid: false,
            error: 'Image too large'
          };
        }
      }
      
      return {
        isValid: true,
        size: contentLength ? parseInt(contentLength) : undefined
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      };
    }
  }
}

export const imageExtractionService = ImageExtractionService.getInstance();
