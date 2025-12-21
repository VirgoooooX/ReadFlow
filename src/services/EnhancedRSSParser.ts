import { parse as parseRSS } from 'react-native-rss-parser';
import { DOMParser } from '@xmldom/xmldom';

// 扩展RSS解析器以支持media:content标签
export interface EnhancedRSSItem {
  id?: string;
  title?: string;
  description?: string;
  content?: string;
  links?: Array<{ url: string }>;
  published?: string;
  authors?: Array<{ name?: string }>;
  enclosures?: Array<{ url: string; mimeType?: string }>;
  mediaContent?: Array<{
    url: string;
    width?: string;
    height?: string;
    medium?: string;
    type?: string;
  }>;
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
  
  // 为每个item提取media:content信息
  rss.items.forEach((item, index) => {
    if (index < itemNodes.length) {
      const itemNode = itemNodes[index];
      const mediaContents = extractMediaContent(itemNode);
      if (mediaContents.length > 0) {
        (item as EnhancedRSSItem).mediaContent = mediaContents;
      }
    }
  });
  
  return rss as EnhancedRSSFeed;
}

/**
 * 从item节点提取media:content信息
 * @param itemNode RSS item节点
 * @returns media:content数组
 */
function extractMediaContent(itemNode: any): EnhancedRSSItem['mediaContent'] {
  try {
    const mediaContents: EnhancedRSSItem['mediaContent'] = [];
    
    // 获取所有media:content节点
    const mediaNodes = itemNode.getElementsByTagName('media:content');
    
    for (let i = 0; i < mediaNodes.length; i++) {
      const mediaNode = mediaNodes[i];
      
      const mediaContent: any = {
        url: mediaNode.getAttribute('url'),
        width: mediaNode.getAttribute('width'),
        height: mediaNode.getAttribute('height'),
        medium: mediaNode.getAttribute('medium'),
        type: mediaNode.getAttribute('type'),
      };
      
      // 只保留有url的media:content
      if (mediaContent.url) {
        // 移除undefined的属性
        Object.keys(mediaContent).forEach(key => {
          if (mediaContent[key] === null || mediaContent[key] === undefined) {
            delete mediaContent[key];
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
 * 需要跳过第一张图片的 RSS 源列表
 * 这些源的第一张图片通常是 Logo 或广告
 */
const SOURCES_SKIP_FIRST_IMAGE = [
  'plink.anyfeeder.com/bbc',
  'feeds.bbci.co.uk',
];

/**
 * 检查源 URL 是否需要跳过第一张图片
 */
function shouldSkipFirstImage(sourceUrl?: string): boolean {
  if (!sourceUrl) return false;
  return SOURCES_SKIP_FIRST_IMAGE.some(pattern => sourceUrl.includes(pattern));
}

/**
 * 从增强的RSS item中提取最佳图片URL
 * @param item 增强的RSS item
 * @param options.sourceUrl RSS源URL，用于判断是否需要特殊处理
 * @returns 最佳图片URL或undefined
 */
export function extractBestImageUrlFromItem(
  item: EnhancedRSSItem,
  options?: { sourceUrl?: string }
): string | undefined {
  const skipFirst = shouldSkipFirstImage(options?.sourceUrl);
  
  // 1. 首先检查media:content中的图片
  if (item.mediaContent && item.mediaContent.length > 0) {
    // 如果需要跳过第一张，从第二张开始
    const startIndex = skipFirst ? 1 : 0;
    const mediaList = item.mediaContent.slice(startIndex);
    
    // 优先选择medium="image"的media:content
    const imageMedia = mediaList.find(media => media.medium === 'image');
    if (imageMedia && imageMedia.url) {
      console.log(`✅ 从media:content提取到图片: ${imageMedia.url}${skipFirst ? ' (跳过了第一张)' : ''}`);
      return processImageUrl(imageMedia.url);
    }
    
    // 如果没有指定medium="image"，则选择第一个有url的media:content
    const firstMediaWithUrl = mediaList.find(media => media.url);
    if (firstMediaWithUrl && firstMediaWithUrl.url) {
      console.log(`✅ 从media:content提取到图片: ${firstMediaWithUrl.url}${skipFirst ? ' (跳过了第一张)' : ''}`);
      return processImageUrl(firstMediaWithUrl.url);
    }
  }
  
  // 2. 检查enclosures中的图片
  if (item.enclosures && item.enclosures.length > 0) {
    const startIndex = skipFirst ? 1 : 0;
    const enclosureList = item.enclosures.slice(startIndex);
    
    const imageEnclosure = enclosureList.find(enc => 
      enc.mimeType && enc.mimeType.startsWith('image/')
    );
    if (imageEnclosure && imageEnclosure.url) {
      console.log(`✅ 从enclosure提取到图片: ${imageEnclosure.url}${skipFirst ? ' (跳过了第一张)' : ''}`);
      return imageEnclosure.url;
    }
  }
  
  // 3. 从内容中提取图片
  const content = item.content || item.description || '';
  if (content && content.length > 0) {
    // 提取所有图片
    const imgRegex = /<img[^>]+src\s*=\s*["']?([^"'>\s]+)["']?/gi;
    const matches: string[] = [];
    let match;
    
    while ((match = imgRegex.exec(content)) !== null) {
      let imageUrl = match[1].replace(/["']+$/, '');
      if (imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('/'))) {
        matches.push(imageUrl);
      }
    }
    
    if (matches.length > 0) {
      // 如果需要跳过第一张且有多张图片
      const imageIndex = (skipFirst && matches.length > 1) ? 1 : 0;
      const selectedImage = matches[imageIndex];
      console.log(`✅ 从内容HTML提取到图片: ${selectedImage}${skipFirst && matches.length > 1 ? ' (跳过了第一张)' : ''}`);
      return selectedImage;
    }
  }
  
  return undefined;
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