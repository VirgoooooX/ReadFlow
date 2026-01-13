import fetch, { RequestInit, Response, Headers } from 'node-fetch';

// =================== 类型定义 ===================

export interface FetchWithRetryOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
  timeout?: number;
}

// =================== 日志工具 ===================

const getLogTime = () => {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
};

export const logger = {
  error: (message: string, ...args: any[]) => {
    console.error(`[${getLogTime()}] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[${getLogTime()}] ${message}`, ...args);
  },
  info: (message: string, ...args: any[]) => {
    console.log(`[${getLogTime()}] ${message}`, ...args);
  }
};

// =================== 网络请求 ===================

/**
 * 带重试和超时的 fetch 实现
 */
export async function fetchWithRetry(
  url: string, 
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    retries = 3,
    retryDelay = 1000,
    timeout = 10000,
    ...fetchOptions
  } = options;

  // 注入默认 Headers (模拟浏览器行为)
  const headers = new Headers(fetchOptions.headers);
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7');
  }

  const finalOptions: RequestInit = {
    ...fetchOptions,
    headers
  };

  for (let i = 0; i <= retries; i++) {
    try {
      // 创建超时 Promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeout);
      });

      // 创建 fetch Promise
      const fetchPromise = fetch(url, finalOptions);

      // 使用 Promise.race 实现超时控制
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      return response;
    } catch (error) {
      if (i === retries) {
        throw error;
      }
      
      // 指数退避等待后重试
      await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, i)));
    }
  }
  
  throw new Error('Unexpected error in fetchWithRetry');
}

// =================== 文本处理 ===================

/**
 * 清理文本内容（用于标题、作者等短文本）
 */
export function cleanTextContent(text: string): string {
  try {
    let cleaned = text;
    
    // 移除 HTML 标签
    cleaned = cleaned.replace(/<[^>]*>/g, '');
    
    // 清理 HTML 实体
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
 * 正则表达式清理 HTML（备用方案）
 */
export function cleanHtmlWithRegex(html: string): string {
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
 * 保留 HTML 结构的内容清理函数
 */
export function preserveHtmlContent(
  html: string, 
  contentType: 'text' | 'image_text' = 'image_text'
): string {
  try {
    let cleaned = html;
    
    // 移除危险标签
    cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    cleaned = cleaned.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
    cleaned = cleaned.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
    cleaned = cleaned.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
    // cleaned = cleaned.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, ''); // 放宽限制：允许 iframe
    
    // 移除所有属性中的事件处理器
    cleaned = cleaned.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
    
    // 修复双等号问题
    cleaned = cleaned.replace(/(\w+)==(["'])/g, '$1=$2');
    
    // 根据内容类型处理标签
    if (contentType === 'text') {
      cleaned = cleaned.replace(/<img[^>]*>/gi, '');
      cleaned = cleaned.replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '');
      // cleaned = cleaned.replace(/<video[^>]*>[\s\S]*?<\/video>/gi, ''); // 放宽限制：允许 video
      // cleaned = cleaned.replace(/<audio[^>]*>[\s\S]*?<\/audio>/gi, ''); // 放宽限制：允许 audio
    }
    
    return cleaned.trim();
  } catch (error) {
    logger.error('HTML内容保留失败:', error);
    return cleanHtmlWithRegex(html);
  }
}

/**
 * 修复 HTML 中的相对路径图片链接
 * @param htmlContent RSS 中的 description 内容
 * @param articleLink RSS 中的 link (文章原始链接)
 * @returns 修复后的 HTML 内容
 */
export function fixRelativeImageUrls(htmlContent: string, articleLink: string): string {
  if (!htmlContent || !articleLink) return htmlContent;

  try {
    // 1. 从文章链接中提取 Base URL (例如: http://military.people.com.cn)
    const urlObj = new URL(articleLink);
    const origin = urlObj.origin; // 结果如: "http://military.people.com.cn"
    const protocol = urlObj.protocol;

    // 2. 修复 src="/..." 形式的相对路径
    let fixed = htmlContent.replace(/src="\/([^"]+)"/g, (match, path) => {
      const fixedUrl = `src="${origin}/${path}"`;
      // logger.info(`[fixRelativeImageUrls] 修复: ${match} -> ${fixedUrl}`);
      return fixedUrl;
    });

    // 3. 修复 src='/...' 形式的相对路径（单引号）
    fixed = fixed.replace(/src='\/([^']+)'/g, (match, path) => {
      const fixedUrl = `src='${origin}/${path}'`;
      // logger.info(`[fixRelativeImageUrls] 修复: ${match} -> ${fixedUrl}`);
      return fixedUrl;
    });

    fixed = fixed.replace(/src="\/\/([^"]+)"/g, (match, path) => {
      return `src="${protocol}//${path}"`;
    });

    fixed = fixed.replace(/src='\/\/([^']+)'/g, (match, path) => {
      return `src='${protocol}//${path}'`;
    });

    // 4. 修复 data-src="/..." 等懒加载属性
    fixed = fixed.replace(/(data-[\w-]+)="\/([^"]+)"/g, (match, attr, path) => {
      const fixedUrl = `${attr}="${origin}/${path}"`;
      // logger.info(`[fixRelativeImageUrls] 修复懒加载: ${match} -> ${fixedUrl}`);
      return fixedUrl;
    });

    return fixed;
  } catch (e) {
    logger.warn('[fixRelativeImageUrls] URL解析失败:', e);
    return htmlContent;
  }
}

/**
 * 生成文章摘要
 */
export function generateSummary(content: string, maxLength: number = 200): string {
  const cleanContent = content.replace(/\s+/g, ' ').trim();
  if (cleanContent.length <= maxLength) {
    return cleanContent;
  }
  
  const truncated = cleanContent.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  return lastSpace > 0 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
}

/**
 * 统计字数
 */
export function countWords(text: string): number {
  // 先移除所有 HTML 标签
  const textContent = text.replace(/<[^>]*>/g, '');
  
  // 清理空白字符
  const cleanText = textContent.replace(/\s+/g, ' ').trim();
  if (!cleanText) return 0;
  
  // 中文字符按字计算，英文按词计算
  const chineseChars = cleanText.match(/[\u4e00-\u9fff]/g) || [];
  const englishWords = cleanText.replace(/[\u4e00-\u9fff]/g, '').match(/\b\w+\b/g) || [];
  
  return chineseChars.length + englishWords.length;
}

// =================== 日期处理 ===================

/**
 * 解析发布日期
 */
export function parsePublishedDate(dateString: string): Date {
  if (!dateString) return new Date();
  
  // 尝试直接解析
  let parsedDate = new Date(dateString);
  if (!isNaN(parsedDate.getTime())) {
    return parsedDate;
  }
  
  // 尝试 ISO 格式
  const isoMatch = dateString.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  if (isoMatch) {
    parsedDate = new Date(isoMatch[1] + 'Z');
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  }
  
  // 尝试 RFC 2822 格式
  const rfcMatch = dateString.match(/(\w{3}, \d{1,2} \w{3} \d{4} \d{2}:\d{2}:\d{2})/);
  if (rfcMatch) {
    parsedDate = new Date(rfcMatch[1]);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  }
  
  // 尝试简化的 RFC 格式
  const simpleRfcMatch = dateString.match(/(\w{3} \w{3} \d{1,2} \d{4} \d{2}:\d{2}:\d{2})/);
  if (simpleRfcMatch) {
    parsedDate = new Date(simpleRfcMatch[1]);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  }
  
  // 尝试 YYYY-MM-DD 格式
  const dateOnlyMatch = dateString.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnlyMatch) {
    parsedDate = new Date(dateOnlyMatch[1]);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  }
  
  // 尝试 Unix 时间戳
  const timestamp = parseInt(dateString);
  if (!isNaN(timestamp) && timestamp > 0) {
    const date = timestamp < 10000000000 ? new Date(timestamp * 1000) : new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
  }
  
  return new Date();
}

// =================== 通用工具 ===================

/**
 * 简单哈希函数
 */
export function simpleHash(str: string): number {
  let hash = 0;
  if (str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * 解码 HTML 实体
 */
export function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
  };
  
  return text.replace(/&[^;]+;/g, (match) => {
    return entities[match] || match;
  });
}

/**
 * 转义正则表达式特殊字符
 */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 判断是否需要使用 CORS 代理
 */
export function shouldUseCorsProxy(url: string): boolean {
  const cloudflareProtectedDomains = [
    'feedly.com',
    'medium.com',
    'github.com',
  ];
  
  try {
    const urlObj = new URL(url);
    return cloudflareProtectedDomains.some(domain => 
      urlObj.hostname.includes(domain)
    );
  } catch (error) {
    return false;
  }
}

// =================== 防盗链图片处理 ===================

// 被墙域名列表 - 强制走代理
const BLOCKED_DOMAINS = [
  'bbc.co.uk', 'bbc.com', 'bbci.co.uk',
  'nytimes.com', 'nyt.com',
  'wsj.com', 'wsj.net',
  'bloomberg.com',
  'reuters.com',
  'dw.com',
  'voanews.com',
  'rfa.org',
  'epochtimes.com',
  'ntdtv.com',
  'boxun.com',
  'creaders.net',
  'wenxuecity.com',
  '6park.com'
];

// 防盗链图片域名列表，需要通过代理加载
const ANTI_HOTLINK_DOMAINS = [
  'cdnfile.sspai.com', 'cdn.sspai.com', 'sspai.com',
  's3.ifanr.com', 'images.ifanr.cn', 'ifanr.com',
  'cnbetacdn.com', 'static.cnbetacdn.com',
  'twimg.com', 'pbs.twimg.com',
  'miro.medium.com',
  'qpic.cn', 'qlogo.cn',
  'zhimg.com',
  'sinaimg.cn',
  'doubanio.com',
  'jianshu.io',
  'toutiaoimg.com',
  '36krcdn.com',
  'xchuxing.com',
  's3.xchuxing.com',
];

/**
 * 检查图片 URL 是否需要代理
 */
export function needsProxy(url: string, baseUrl?: string, imageCompression: boolean = true): boolean {
  if (!url || url.startsWith('data:')) return false;
  
  // 如果是本服务器的 URL，不需要代理
  if (baseUrl && url.startsWith(baseUrl)) return false;
  if (url.startsWith('/api/image')) return false;

  const urlLower = url.toLowerCase();

  // 如果提供了 baseUrl (服务端模式)
  // - 开启压缩：全部图片走代理（便于统一压缩与防盗链）
  // - 关闭压缩：仅对防盗链域名走代理（纯代理，不做转码/压缩）
  if (baseUrl) {
    const isHttp = urlLower.startsWith('http://') || urlLower.startsWith('https://');
    if (!isHttp) return false;
    if (urlLower.startsWith('http://')) return true;
    if (imageCompression) return true;
    return ANTI_HOTLINK_DOMAINS.some(domain => urlLower.includes(domain)) ||
           BLOCKED_DOMAINS.some(domain => urlLower.includes(domain));
  }

  // 客户端模式/旧模式：仅代理白名单域名
  return ANTI_HOTLINK_DOMAINS.some(domain => urlLower.includes(domain)) ||
         BLOCKED_DOMAINS.some(domain => urlLower.includes(domain));
}

/**
 * 获取代理 URL
 */
export function getProxyUrl(
  url: string, 
  baseUrl?: string, 
  imageCompression: boolean = true, 
  imageQuality: number = 80
): string {
  if (!url) return url;
  
  if (baseUrl) {
    if (imageCompression) {
      return `${baseUrl}/api/image?url=${encodeURIComponent(url)}&q=${imageQuality}`;
    }
    return `${baseUrl}/api/image?url=${encodeURIComponent(url)}&raw=1`;
  }

  // 使用 images.weserv.nl
  // weserv.nl 也支持 q 参数
  const quality = imageCompression ? imageQuality : 100;
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&q=${quality}&output=webp`;
}

/**
 * 替换 HTML 中需要代理的图片 URL
 */
export function proxyImages(
  html: string, 
  baseUrl?: string, 
  imageCompression: boolean = true, 
  imageQuality: number = 80
): string {
  if (!html) return html;

  // 使用 img 标签迭代方式，更稳健地处理属性
  return html.replace(/<img([\s\S]*?)>/gi, (match, attributes) => {
    let newAttributes = attributes;

    // 1.5 提取懒加载属性并提升为 src (针对 sspai 等网站)
    // 查找 data-original, data-src, data-url 等
    const lazyMatch = newAttributes.match(/\s+(data-original|data-src|data-url|data-actualsrc|data-lazy-src)=["']([^"']+)["']/i);
    if (lazyMatch && lazyMatch[2]) {
      const realUrl = lazyMatch[2].startsWith('//') ? `https:${lazyMatch[2]}` : lazyMatch[2];
      // 如果存在懒加载属性，强制替换 src
      // 先移除已有的 src (如果有)
      newAttributes = newAttributes.replace(/\s+src=["'][^"']*["']/gi, '');
      // 添加新的 src
      newAttributes = ` src="${realUrl}"` + newAttributes;
    }

    // 2. 辅助函数：替换指定属性中的 URL
      const replaceUrlInAttr = (attrName: string) => {
        // 匹配 src="...", src='...', src=...
        const regex = new RegExp(`(${attrName}=["']?)([^"'\s>]+)(["']?)`, 'gi');
        newAttributes = newAttributes.replace(regex, (m: string, prefix: string, url: string, suffix: string) => {
           const normalizedUrl = url.startsWith('//') ? `https:${url}` : url;
           if (needsProxy(normalizedUrl, baseUrl, imageCompression)) {
             return `${prefix}${getProxyUrl(normalizedUrl, baseUrl, imageCompression, imageQuality)}${suffix}`;
           }
           return m;
        });
      };

    replaceUrlInAttr('src');
    // data-src 等也替换一下，以防万一
    replaceUrlInAttr('data-src');
    replaceUrlInAttr('data-original');
    replaceUrlInAttr('data-url');
    replaceUrlInAttr('data-actualsrc');
    replaceUrlInAttr('data-lazy-src');

    const rewriteSrcsetValue = (value: string) => {
      const candidates = value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const rewritten = candidates.map(candidate => {
        const tokens = candidate.split(/\s+/).filter(Boolean);
        if (tokens.length === 0) return candidate;
        const url = tokens[0].startsWith('//') ? `https:${tokens[0]}` : tokens[0];
        const descriptor = tokens.slice(1).join(' ');
        const finalUrl = needsProxy(url, baseUrl, imageCompression)
          ? getProxyUrl(url, baseUrl, imageCompression, imageQuality)
          : url;
        return descriptor ? `${finalUrl} ${descriptor}` : finalUrl;
      });

      return rewritten.join(', ');
    };

    const replaceSrcsetAttr = (attrName: string) => {
      const regex = new RegExp(`\\s+${attrName}=(["'])([^"']*)\\1`, 'gi');
      newAttributes = newAttributes.replace(regex, (m: string, quote: string, value: string) => {
        return ` ${attrName}=${quote}${rewriteSrcsetValue(value)}${quote}`;
      });
    };

    replaceSrcsetAttr('srcset');
    replaceSrcsetAttr('data-srcset');

    return `<img${newAttributes}>`;
  });
}
