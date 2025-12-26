/**
 * RSS 公共工具函数
 */

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

  for (let i = 0; i <= retries; i++) {
    try {
      // 创建超时 Promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeout);
      });

      // 创建 fetch Promise
      const fetchPromise = fetch(url, fetchOptions);

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
    cleaned = cleaned.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
    
    // 移除所有属性中的事件处理器
    cleaned = cleaned.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
    
    // 修复双等号问题
    cleaned = cleaned.replace(/(\w+)==(["'])/g, '$1=$2');
    
    // 根据内容类型处理标签
    if (contentType === 'text') {
      cleaned = cleaned.replace(/<img[^>]*>/gi, '');
      cleaned = cleaned.replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '');
      cleaned = cleaned.replace(/<video[^>]*>[\s\S]*?<\/video>/gi, '');
      cleaned = cleaned.replace(/<audio[^>]*>[\s\S]*?<\/audio>/gi, '');
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
  const cleanText = text.replace(/\s+/g, ' ').trim();
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
