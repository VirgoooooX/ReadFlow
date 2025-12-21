import { parse as parseRSS } from 'react-native-rss-parser';
import { DOMParser } from '@xmldom/xmldom';

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

// Media RSS命名空间
const MEDIA_NAMESPACE = 'http://search.yahoo.com/mrss/';

/**
 * 解析RSS Feed并提取media:content信息
 * @param xmlText RSS XML内容
 * @returns 增强的RSS Feed对象
 */
export async function parseEnhancedRSS(xmlText: string): Promise<EnhancedRSSFeed> {
  // 首先使用原始解析器解析
  const rss = await parseRSS(xmlText);
  
  // 解析XML文档以提取media:content信息
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  
  // 获取所有item节点
  const itemNodes = doc.getElementsByTagName('item');
  
  // 为每个 item 提取 media 信息
  rss.items.forEach((item, index) => {
    if (index < itemNodes.length) {
      const itemNode = itemNodes[index];
      
      // 提取 media:content
      const mediaContents = extractMediaContent(itemNode);
      if (mediaContents.length > 0) {
        (item as EnhancedRSSItem).mediaContent = mediaContents;
      }
      
      // 提取 media:thumbnail
      const thumbnail = extractMediaThumbnail(itemNode);
      if (thumbnail && thumbnail.url) {
        (item as EnhancedRSSItem).mediaThumbnail = thumbnail;
      }
    }
  });
  
  return rss as EnhancedRSSFeed;
}

/**
 * 获取节点的文本内容
 */
function getNodeText(node: any): string {
  if (!node) return '';
  return node.textContent?.trim() || '';
}

/**
 * 从 item 节点提取 media:content 信息（增强版）
 * 同时提取 media:description、media:credit、media:title
 */
function extractMediaContent(itemNode: any): MediaContentInfo[] {
  try {
    const mediaContents: MediaContentInfo[] = [];
    
    // 1. 提取 item 级别的 media 元数据（可能适用于所有 media:content）
    const itemMediaDesc = getNodeText(itemNode.getElementsByTagName('media:description')[0]);
    const itemMediaCredit = getNodeText(itemNode.getElementsByTagName('media:credit')[0]);
    const itemMediaTitle = getNodeText(itemNode.getElementsByTagName('media:title')[0]);
    
    // 2. 获取所有 media:content 节点
    const mediaNodes = itemNode.getElementsByTagName('media:content');
    
    for (let i = 0; i < mediaNodes.length; i++) {
      const mediaNode = mediaNodes[i];
      
      // 提取 media:content 内部的元数据（优先级更高）
      const innerDesc = getNodeText(mediaNode.getElementsByTagName('media:description')[0]);
      const innerCredit = getNodeText(mediaNode.getElementsByTagName('media:credit')[0]);
      const innerTitle = getNodeText(mediaNode.getElementsByTagName('media:title')[0]);
      
      const mediaContent: MediaContentInfo = {
        url: mediaNode.getAttribute('url') || '',
        width: mediaNode.getAttribute('width') || undefined,
        height: mediaNode.getAttribute('height') || undefined,
        medium: mediaNode.getAttribute('medium') || undefined,
        type: mediaNode.getAttribute('type') || undefined,
        // 优先使用内部的，否则使用 item 级别的
        description: innerDesc || itemMediaDesc || undefined,
        credit: innerCredit || itemMediaCredit || undefined,
        title: innerTitle || itemMediaTitle || undefined,
      };
      
      // 只保留有 url 的 media:content
      if (mediaContent.url) {
        // 移除 undefined 的属性
        Object.keys(mediaContent).forEach(key => {
          if ((mediaContent as any)[key] === null || (mediaContent as any)[key] === undefined) {
            delete (mediaContent as any)[key];
          }
        });
        
        mediaContents.push(mediaContent);
      }
    }
    
    return mediaContents;
  } catch (error) {
    console.warn('提取media:content信息时出错:', error);
    return [];
  }
}

/**
 * 从 item 节点提取 media:thumbnail 信息
 */
function extractMediaThumbnail(itemNode: any): EnhancedRSSItem['mediaThumbnail'] {
  try {
    const thumbnailNodes = itemNode.getElementsByTagName('media:thumbnail');
    if (thumbnailNodes.length > 0) {
      const node = thumbnailNodes[0];
      return {
        url: node.getAttribute('url') || '',
        width: node.getAttribute('width') || undefined,
        height: node.getAttribute('height') || undefined,
      };
    }
    return undefined;
  } catch (error) {
    return undefined;
  }
}

/**
 * 【已清理】之前针对 BBC 源的特殊处理（跳过第一张图片）已移除
 * 现在使用更系统的占位图过滤机制 (isPlaceholderImage)，
 * 能自动识别和过滤掉 BBC 的灰色占位图，无需针对特定源进行特殊处理。
 * 
 * shouldSkipFirstImage() 函数也已删除，在调用处改为传递 skipFirst=false
 */

/**
 * 从增强的RSS item中提取最佳图片URL（保持向后兼容）
 * @param item 增强的RSS item
 * @param options.sourceUrl RSS源URL，用于判断是否需要特殊处理
 * @returns 最佳图片URL或undefined
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
 * @param item 增强的RSS item
 * @param options.sourceUrl RSS源URL，用于判断是否需要特殊处理
 * @returns 图片URL及说明信息，或undefined
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
      console.log(`✅ 从media:content提取到图片: ${imageMedia.url}${skipFirst ? ' (跳过了第一张)' : ''}`);
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
    console.log(`✅ 从media:thumbnail提取到图片: ${item.mediaThumbnail.url}`);
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
      console.log(`✅ 从enclosure提取到图片: ${imageEnclosure.url}${skipFirst ? ' (跳过了第一张)' : ''}`);
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
 * 占位图通常包含以下特征：
 * - URL 中包含 "placeholder"、"loading"、"grey-placeholder" 等关键字
 * - alt 属性为 "loading" 或 "image unavailable"
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
      console.log(`⚠️ 检测到占位图URL: ${url} (匹配关键字: ${pattern})`);
      return true;
    }
  }
  
  // 检查 alt 属性特征
  if (altLower === 'loading' || altLower === 'image unavailable') {
    console.log(`⚠️ 检测到占位图alt: ${alt}`);
    return true;
  }
  
  return false;
}

/**
 * 从 HTML 内容中提取图片及其说明
 * 支持提取 alt 属性和 figcaption
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
        console.log(`⏭️ 跳过占位图: ${url}`);
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
      console.log(`✅ 从figure结构提取到图片: ${figureMatches[index].url}`);
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
        console.log(`⏭️ 跳过占位图: ${url}`);
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
        console.log(`⏭️ 跳过占位图: ${url}`);
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
      console.log(`✅ 从img标签提取到图片: ${imgMatches[index].url}${imgMatches[index].alt ? ' (有alt)' : ''}`);
      return imgMatches[index];
    }
    
    return undefined;
  } catch (error) {
    console.warn('从HTML内容提取图片时出错:', error);
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
 * @param url 原始URL
 * @returns 处理后的URL
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
    console.warn('处理图片URL时出错:', error);
    return url; // 返回原始URL
  }
}