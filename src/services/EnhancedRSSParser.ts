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
 * 从增强的RSS item中提取最佳图片URL
 * @param item 增强的RSS item
 * @returns 最佳图片URL或undefined
 */
export function extractBestImageUrlFromItem(item: EnhancedRSSItem): string | undefined {
  // 1. 首先检查media:content中的图片
  if (item.mediaContent && item.mediaContent.length > 0) {
    // 优先选择medium="image"的media:content
    const imageMedia = item.mediaContent.find(media => media.medium === 'image');
    if (imageMedia && imageMedia.url) {
      console.log(`✅ 从media:content提取到图片: ${imageMedia.url}`);
      return processImageUrl(imageMedia.url);
    }
    
    // 如果没有指定medium="image"，则选择第一个有url的media:content
    const firstMediaWithUrl = item.mediaContent.find(media => media.url);
    if (firstMediaWithUrl && firstMediaWithUrl.url) {
      console.log(`✅ 从media:content提取到图片: ${firstMediaWithUrl.url}`);
      return processImageUrl(firstMediaWithUrl.url);
    }
  }
  
  // 2. 检查enclosures中的图片
  if (item.enclosures && item.enclosures.length > 0) {
    const imageEnclosure = item.enclosures.find(enc => 
      enc.mimeType && enc.mimeType.startsWith('image/')
    );
    if (imageEnclosure && imageEnclosure.url) {
      console.log(`✅ 从enclosure提取到图片: ${imageEnclosure.url}`);
      return imageEnclosure.url;
    }
  }
  
  // 3. 从内容中提取图片（保持原有逻辑）
  const content = item.content || item.description || '';
  if (content) {
    // 这里可以复用现有的图片提取逻辑
    // 暂时返回undefined，让调用者使用原有的图片提取服务
    return undefined;
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