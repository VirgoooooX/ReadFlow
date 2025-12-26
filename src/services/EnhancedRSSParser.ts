import { parse as parseRSS } from 'react-native-rss-parser';
import { logger } from './rss/RSSUtils';

// =================== 类型定义 ===================

/**
 * 媒体内容信息（来自 media:content）
 */
export interface MediaContentInfo {
  url: string;
  width?: string;
  height?: string;
  medium?: string;
  type?: string;
  // 新增：媒体元数据
  description?: string;  // media:description
  credit?: string;       // media:credit (如 "Reuters")
  title?: string;        // media:title
}

/**
 * 图片及其说明信息
 */
export interface ImageWithCaption {
  url: string;
  caption?: string;      // 图片说明（来自 figcaption、alt 或 media:description）
  credit?: string;       // 版权来源（来自 media:credit）
  alt?: string;          // 原始 alt 属性
  source: 'media:content' | 'enclosure' | 'content_html' | 'media:thumbnail';
}

/**
 * 扩展的 RSS 条目
 */
export interface EnhancedRSSItem {
  id?: string;
  title?: string;
  description?: string;
  content?: string;
  links?: Array<{ url: string }>;
  published?: string;
  authors?: Array<{ name?: string }>;
  enclosures?: Array<{ url: string; mimeType?: string }>;
  mediaContent?: MediaContentInfo[];
  // 新增：媒体缩略图
  mediaThumbnail?: {
    url: string;
    width?: string;
    height?: string;
  };
}

export interface EnhancedRSSFeed {
  title?: string;
  description?: string;
  links?: Array<{ url: string }>;
  items: EnhancedRSSItem[];
}

/**
 * 解析RSS Feed并提取media:content信息
 * @param xmlText RSS XML内容
 * @returns 增强的RSS Feed对象
 */
export async function parseEnhancedRSS(xmlText: string): Promise<EnhancedRSSFeed> {
  // 首先使用原始解析器解析
  const rss = await parseRSS(xmlText);
  
  // 优化：使用正则表达式提取 media 信息，移除 xmldom 依赖
  // 这种方式比 DOMParser 快很多，且内存占用更低，彻底解决了双重解析导致的性能问题
  
  // 1. 提取所有 item 块
  // 使用非贪婪匹配提取 <item>...</item> 内容
  const itemRegex = /<item(?:\s+[^>]*)?>([\s\S]*?)<\/item>/gi;
  const itemsRaw: string[] = [];
  let match;
  let matchCount = 0;
  while ((match = itemRegex.exec(xmlText)) !== null) {
    itemsRaw.push(match[1]);
    matchCount++;
    // 每匹配 10 个项目让出一次主线程
    if (matchCount % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  // 2. 遍历 item 并提取扩展信息
  for (let index = 0; index < rss.items.length; index++) {
    const item = rss.items[index];
    
    // 每处理 5 个项目让出一次主线程
    if (index % 5 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // 只有当 raw items 数量匹配时才尝试匹配
    if (index < itemsRaw.length) {
      const itemXml = itemsRaw[index];
      
      // 提取 media:content
      const mediaContents = extractMediaContentFromXml(itemXml);
      if (mediaContents.length > 0) {
        (item as EnhancedRSSItem).mediaContent = mediaContents;
      }
      
      // 提取 media:thumbnail
      const thumbnail = extractMediaThumbnailFromXml(itemXml);
      if (thumbnail && thumbnail.url) {
        (item as EnhancedRSSItem).mediaThumbnail = thumbnail;
      }
    }
  }
  
  return rss as EnhancedRSSFeed;
}

/**
 * 简单的属性提取帮助函数
 */
function getAttribute(tag: string, attr: string): string | undefined {
  const regex = new RegExp(`${attr}=["']([^"']*)["']`, 'i');
  const match = tag.match(regex);
  return match ? match[1] : undefined;
}

/**
 * 简单的标签内容提取帮助函数
 */
function getTagContent(xml: string, tagName: string): string | undefined {
  // 匹配 <tagName ...>content</tagName>
  const regex = new RegExp(`<${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
}

/**
 * 从 item XML 字符串提取 media:content 信息
 */
function extractMediaContentFromXml(itemXml: string): MediaContentInfo[] {
  try {
    const mediaContents: MediaContentInfo[] = [];
    
    // 1. 提取 item 级别的 media 元数据
    const itemMediaDesc = getTagContent(itemXml, 'media:description');
    const itemMediaCredit = getTagContent(itemXml, 'media:credit');
    const itemMediaTitle = getTagContent(itemXml, 'media:title');
    
    // 2. 匹配所有 media:content 标签
    // 两种形式：<media:content ... /> 或 <media:content ...>...</media:content>
    const mediaContentRegex = /<media:content([^>]*?)(?:\/>|>(.*?)<\/media:content>)/gi;
    
    let match;
    while ((match = mediaContentRegex.exec(itemXml)) !== null) {
      const attrsStr = match[1];
      const innerContent = match[2] || '';
      
      const url = getAttribute(attrsStr, 'url');
      if (!url) continue;
      
      // 提取内部元数据
      const innerDesc = getTagContent(innerContent, 'media:description');
      const innerCredit = getTagContent(innerContent, 'media:credit');
      const innerTitle = getTagContent(innerContent, 'media:title');
      
      const mediaContent: MediaContentInfo = {
        url: url,
        width: getAttribute(attrsStr, 'width'),
        height: getAttribute(attrsStr, 'height'),
        medium: getAttribute(attrsStr, 'medium'),
        type: getAttribute(attrsStr, 'type'),
        // 优先使用内部的，否则使用 item 级别的
        description: innerDesc || itemMediaDesc,
        credit: innerCredit || itemMediaCredit,
        title: innerTitle || itemMediaTitle,
      };
      
      // 清理 undefined 属性
      Object.keys(mediaContent).forEach(key => {
        if ((mediaContent as any)[key] === undefined) {
          delete (mediaContent as any)[key];
        }
      });
      
      mediaContents.push(mediaContent);
    }
    
    return mediaContents;
  } catch (error) {
    logger.warn('提取media:content信息时出错:', error);
    return [];
  }
}

/**
 * 从 item XML 字符串提取 media:thumbnail 信息
 */
function extractMediaThumbnailFromXml(itemXml: string): EnhancedRSSItem['mediaThumbnail'] {
  try {
    const thumbnailRegex = /<media:thumbnail([^>]*?)\/?>/i;
    const match = itemXml.match(thumbnailRegex);
    
    if (match) {
      const attrsStr = match[1];
      const url = getAttribute(attrsStr, 'url');
      
      if (url) {
        return {
          url: url,
          width: getAttribute(attrsStr, 'width'),
          height: getAttribute(attrsStr, 'height'),
        };
      }
    }
    return undefined;
  } catch (error) {
    return undefined;
  }
}

/**
 * 从增强的RSS item中提取最佳图片URL（保持向后兼容）
 */
export function extractBestImageUrlFromItem(
  item: EnhancedRSSItem,
  options?: { sourceUrl?: string }
): string | undefined {
  const result = extractBestImageWithCaption(item, options);
  return result?.url;
}

/**
 * 从增强的RSS item中提取最佳图片及其说明信息
 */
export function extractBestImageWithCaption(
  item: EnhancedRSSItem,
  options?: { sourceUrl?: string }
): ImageWithCaption | undefined {
  // 【优化】删除了针对特定源的 skipFirst 逻辑
  // 现在占位图会通过 isPlaceholderImage() 自动过滤掉，无需跳过第一张图片
  const skipFirst = false;
  
  // 1. 首先检查 media:content 中的图片
  if (item.mediaContent && item.mediaContent.length > 0) {
    const startIndex = skipFirst ? 1 : 0;
    const mediaList = item.mediaContent.slice(startIndex);
    
    // 优先选择 medium="image" 的 media:content
    const imageMedia = mediaList.find(media => media.medium === 'image') || mediaList.find(media => media.url);
    
    if (imageMedia && imageMedia.url) {
      // logger.info(`✅ 从media:content提取到图片: ${imageMedia.url}`);
      return {
        url: processImageUrl(imageMedia.url) || imageMedia.url,
        caption: imageMedia.description,
        credit: imageMedia.credit,
        source: 'media:content',
      };
    }
  }
  
  // 2. 检查 media:thumbnail
  if (item.mediaThumbnail && item.mediaThumbnail.url) {
    // logger.info(`✅ 从media:thumbnail提取到图片: ${item.mediaThumbnail.url}`);
    // thumbnail 通常没有独立的说明，尝试从 mediaContent 获取
    const mediaDesc = item.mediaContent?.[0]?.description;
    const mediaCredit = item.mediaContent?.[0]?.credit;
    return {
      url: item.mediaThumbnail.url,
      caption: mediaDesc,
      credit: mediaCredit,
      source: 'media:thumbnail',
    };
  }
  
  // 3. 检查 enclosures 中的图片
  if (item.enclosures && item.enclosures.length > 0) {
    const startIndex = skipFirst ? 1 : 0;
    const enclosureList = item.enclosures.slice(startIndex);
    
    const imageEnclosure = enclosureList.find(enc => 
      enc.mimeType && enc.mimeType.startsWith('image/')
    );
    if (imageEnclosure && imageEnclosure.url) {
      // logger.info(`✅ 从enclosure提取到图片: ${imageEnclosure.url}`);
      return {
        url: imageEnclosure.url,
        source: 'enclosure',
      };
    }
  }
  
  // 4. 从内容中提取图片（同时提取 alt 和 figcaption）
  const content = item.content || item.description || '';
  if (content && content.length > 0) {
    const imageInfo = extractImageFromHtmlContent(content, skipFirst);
    if (imageInfo) {
      return imageInfo;
    }
  }
  
  return undefined;
}

/**
 * 判断URL是否是占位图
 */
function isPlaceholderImage(url: string, alt?: string): boolean {
  if (!url) return false;
  
  const urlLower = url.toLowerCase();
  const altLower = alt?.toLowerCase() || '';
  
  // 检查 URL 特征
  const placeholderPatterns = [
    'placeholder',
    'loading',
    'grey-placeholder',
    'gray-placeholder',
    'dummy',
    'blank',
    'default.png',
    'default.jpg',
    'spacer',
  ];
  
  for (const pattern of placeholderPatterns) {
    if (urlLower.includes(pattern)) {
      // logger.warn(`⚠️ 检测到占位图URL: ${url} (匹配关键字: ${pattern})`);
      return true;
    }
  }
  
  // 检查 alt 属性特征
  if (altLower === 'loading' || altLower === 'image unavailable') {
    // logger.warn(`⚠️ 检测到占位图alt: ${alt}`);
    return true;
  }
  
  return false;
}

/**
 * 从 HTML 内容中提取图片及其说明
 */
function extractImageFromHtmlContent(content: string, skipFirst: boolean = false): ImageWithCaption | undefined {
  try {
    // 先解码 HTML 实体
    const decoded = decodeHtmlEntities(content);
    
    // 匹配 <figure><img ...><figcaption>...</figcaption></figure> 结构
    const figureRegex = /<figure[^>]*>[\s\S]*?<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*(?:alt\s*=\s*["']([^"']*)["'])?[^>]*>[\s\S]*?<figcaption[^>]*>([\s\S]*?)<\/figcaption>[\s\S]*?<\/figure>/gi;
    const figureMatches: ImageWithCaption[] = [];
    let figureMatch;
    
    while ((figureMatch = figureRegex.exec(decoded)) !== null) {
      const url = figureMatch[1];
      const alt = figureMatch[2] || '';
      const figcaption = cleanHtmlTags(figureMatch[3] || '');
      
      // 【关键】过滤占位图
      if (isPlaceholderImage(url, alt)) {
        continue;
      }
      
      if (url && (url.startsWith('http') || url.startsWith('/'))) {
        figureMatches.push({
          url,
          alt: alt || undefined,
          caption: figcaption || alt || undefined,
          source: 'content_html',
        });
      }
    }
    
    // 如果找到 figure 结构，优先使用
    if (figureMatches.length > 0) {
      const index = (skipFirst && figureMatches.length > 1) ? 1 : 0;
      return figureMatches[index];
    }
    
    // 回退：提取普通 img 标签（同时提取 alt）
    const imgRegex = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*(?:alt\s*=\s*["']([^"']*)["'])?[^>]*>/gi;
    // 也匹配 alt 在 src 前面的情况
    const imgRegex2 = /<img[^>]*alt\s*=\s*["']([^"']*)["'][^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
    
    const imgMatches: ImageWithCaption[] = [];
    let imgMatch;
    
    while ((imgMatch = imgRegex.exec(decoded)) !== null) {
      const url = imgMatch[1];
      const alt = imgMatch[2] || '';
      
      // 【关键】过滤占位图
      if (isPlaceholderImage(url, alt)) {
        continue;
      }
      
      if (url && (url.startsWith('http') || url.startsWith('/'))) {
        imgMatches.push({
          url,
          alt: alt || undefined,
          caption: alt || undefined, // 用 alt 作为备选说明
          source: 'content_html',
        });
      }
    }
    
    // 检查 alt 在前的情况
    while ((imgMatch = imgRegex2.exec(decoded)) !== null) {
      const alt = imgMatch[1] || '';
      const url = imgMatch[2];
      
      // 【关键】过滤占位图
      if (isPlaceholderImage(url, alt)) {
        continue;
      }
      
      // 避免重复
      if (url && (url.startsWith('http') || url.startsWith('/')) && !imgMatches.some(m => m.url === url)) {
        imgMatches.push({
          url,
          alt: alt || undefined,
          caption: alt || undefined,
          source: 'content_html',
        });
      }
    }
    
    if (imgMatches.length > 0) {
      const index = (skipFirst && imgMatches.length > 1) ? 1 : 0;
      return imgMatches[index];
    }
    
    return undefined;
  } catch (error) {
    logger.warn('从HTML内容提取图片时出错:', error);
    return undefined;
  }
}

/**
 * 解码 HTML 实体
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&amp;': '&',
    '&#39;': "'",
    '&#34;': '"',
    '&#x27;': "'",
    '&#x22;': '"',
  };
  
  return text.replace(/&(lt|gt|quot|apos|amp|#39|#34|#x27|#x22);/g, (match) => {
    return entities[match] || match;
  });
}

/**
 * 清理 HTML 标签，只保留文本
 */
function cleanHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

/**
 * 处理图片URL，特别是Engadget格式的URL
 */
function processImageUrl(url: string): string | undefined {
  try {
    // 特别处理Engadget格式的URL
    if (url.includes('o.aolcdn.com/images/dims') && url.includes('image_uri=')) {
      const urlObj = new URL(url);
      const imageUri = urlObj.searchParams.get('image_uri');
      
      if (imageUri) {
        // 解码image_uri
        return decodeURIComponent(imageUri);
      }
    }
    
    return url;
  } catch (error) {
    // logger.warn('处理图片URL时出错:', error);
    return url; // 返回原始URL
  }
}
