/**
 * 图片本地化服务
 * 负责将代理服务器的图片下载到本地，并替换文章中的图片链接
 */

import * as FileSystem from 'expo-file-system';
import { Article } from '../../types';
import { DatabaseService } from '../../database/DatabaseService';
import { simpleHash, logger } from './RSSUtils';

export class ImageLocalizer {
  private static instance: ImageLocalizer;
  private databaseService: DatabaseService;
  private imageDirCreated = false;

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
  }

  public static getInstance(): ImageLocalizer {
    if (!ImageLocalizer.instance) {
      ImageLocalizer.instance = new ImageLocalizer();
    }
    return ImageLocalizer.instance;
  }

  // =================== URL 替换方法 ===================

  /**
   * 替换 URL 中的 localhost/127.0.0.1 为真实服务器地址
   */
  public replaceLocalhostUrl(url: string, serverUrl: string): string {
    if (!url || !serverUrl) return url;
    
    return url
      .replace(/http:\/\/localhost:(\d+)\//g, `${serverUrl}/`)
      .replace(/http:\/\/127\.0\.0\.1:(\d+)\//g, `${serverUrl}/`);
  }

  /**
   * 替换内容中所有 localhost 图片 URL
   */
  public replaceLocalhostInContent(content: string, serverUrl: string): string {
    if (!content || !serverUrl) return content;
    
    const hasLocalhost = /http:\/\/(localhost|127\.0\.0\.1):(\d+)\//g.test(content);
    if (!hasLocalhost) return content;
    
    return content
      .replace(/http:\/\/localhost:(\d+)\//g, `${serverUrl}/`)
      .replace(/http:\/\/127\.0\.0\.1:(\d+)\//g, `${serverUrl}/`);
  }

  /**
   * 判断 URL 是否来自代理服务器
   */
  public isProxyServerUrl(url: string, serverUrl: string): boolean {
    if (!url || !serverUrl) return false;
    return url.startsWith(serverUrl);
  }

  // =================== 文件名生成 ===================

  /**
   * 生成图片本地文件名（使用 URL hash 避免冲突）
   */
  private generateImageFilename(imageUrl: string): string {
    const urlPath = imageUrl.split('?')[0];
    const ext = urlPath.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)?.[0] || '.webp';
    const hash = simpleHash(imageUrl).toString(36);
    return `img_${hash}${ext}`;
  }

  // =================== 目录管理 ===================

  /**
   * 确保图片缓存目录存在
   */
  private async ensureImageDir(): Promise<void> {
    if (this.imageDirCreated) return;
    
    try {
      await FileSystem.makeDirectoryAsync(
        `${FileSystem.documentDirectory}images/`,
        { intermediates: true }
      );
      this.imageDirCreated = true;
    } catch (error) {
      // 目录可能已存在
      this.imageDirCreated = true;
    }
  }

  // =================== 图片下载 ===================

  /**
   * 下载图片到本地（带缓存检查）
   */
  public async downloadImageToLocal(imageUrl: string): Promise<string | null> {
    try {
      await this.ensureImageDir();
      
      const filename = this.generateImageFilename(imageUrl);
      const localUri = `${FileSystem.documentDirectory}images/${filename}`;

      // 检查文件是否已存在
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo.exists) {
        return localUri;
      }

      // 下载文件
      const downloadResult = await FileSystem.downloadAsync(imageUrl, localUri);

      if (downloadResult.status === 200) {
        return localUri;
      }
      
      return null;
    } catch (error) {
      logger.error(`Error downloading image: ${imageUrl}`, error);
      return null;
    }
  }

  // =================== 图片提取 ===================

  /**
   * 提取内容中所有需要本地化的图片 URL
   */
  public extractProxyImageUrls(content: string, serverUrl: string): string[] {
    const imgRegex = /<img[^>]+src="([^"]+)"/gi;
    const urls: string[] = [];
    let match;

    while ((match = imgRegex.exec(content)) !== null) {
      const url = match[1];
      if (this.isProxyServerUrl(url, serverUrl)) {
        urls.push(url);
      }
    }

    return [...new Set(urls)]; // 去重
  }

  // =================== 批量处理 ===================

  /**
   * 后台下载图片并替换链接（优化版）
   * - 并行下载提高效率
   * - 文件存在检查避免重复下载
   * - 统一处理封面图片和内容图片
   */
  public async downloadAndReplaceImages(
    articles: Article[],
    serverUrl: string
  ): Promise<void> {
    // 异步处理，不阻塞主流程
    (async () => {
      const startTime = Date.now();
      let totalImages = 0;
      let downloadedImages = 0;

      for (const article of articles) {
        try {
          // 收集所有需要下载的图片 URL
          const imageUrlMap = new Map<string, string>();
          
          // 1. 收集封面图片
          if (article.imageUrl && this.isProxyServerUrl(article.imageUrl, serverUrl)) {
            imageUrlMap.set(article.imageUrl, '');
          }
          
          // 2. 收集内容中的图片
          const contentImageUrls = this.extractProxyImageUrls(article.content, serverUrl);
          for (const url of contentImageUrls) {
            imageUrlMap.set(url, '');
          }

          if (imageUrlMap.size === 0) continue;
          
          totalImages += imageUrlMap.size;

          // 3. 并行下载所有图片
          const downloadPromises = Array.from(imageUrlMap.keys()).map(async (url) => {
            const localPath = await this.downloadImageToLocal(url);
            if (localPath) {
              imageUrlMap.set(url, localPath);
              downloadedImages++;
            }
          });

          await Promise.all(downloadPromises);

          // 4. 更新数据库
          let needUpdateCover = false;
          let newCoverUrl = article.imageUrl;
          let newContent = article.content;

          // 替换封面图片
          if (article.imageUrl && imageUrlMap.has(article.imageUrl)) {
            const localPath = imageUrlMap.get(article.imageUrl);
            if (localPath) {
              newCoverUrl = localPath;
              needUpdateCover = true;
            }
          }

          // 替换内容中的图片
          for (const [originalUrl, localPath] of imageUrlMap) {
            if (localPath && newContent.includes(originalUrl)) {
              newContent = newContent.split(originalUrl).join(localPath);
            }
          }

          const contentChanged = newContent !== article.content;

          // 只在有变化时更新数据库
          if (needUpdateCover && contentChanged) {
            await this.databaseService.executeStatement(
              'UPDATE articles SET image_url = ?, content = ? WHERE id = ?',
              [newCoverUrl, newContent, article.id]
            );
          } else if (needUpdateCover) {
            await this.databaseService.executeStatement(
              'UPDATE articles SET image_url = ? WHERE id = ?',
              [newCoverUrl, article.id]
            );
          } else if (contentChanged) {
            await this.databaseService.executeStatement(
              'UPDATE articles SET content = ? WHERE id = ?',
              [newContent, article.id]
            );
          }
        } catch (error) {
          logger.error(`Failed to download images for article ${article.id}`, error);
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`[Image Download] 完成: ${downloadedImages}/${totalImages} 张图片, 耗时 ${duration}ms`);
    })();
  }

  /**
   * 清理图片缓存
   */
  public async clearImageCache(): Promise<void> {
    try {
      const imageDir = `${FileSystem.documentDirectory}images/`;
      const dirInfo = await FileSystem.getInfoAsync(imageDir);
      
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(imageDir, { idempotent: true });
        this.imageDirCreated = false;
        logger.info('[ImageLocalizer] 图片缓存已清理');
      }
    } catch (error) {
      logger.error('[ImageLocalizer] 清理图片缓存失败:', error);
    }
  }
}

export const imageLocalizer = ImageLocalizer.getInstance();
