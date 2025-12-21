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

export const logger = {
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
