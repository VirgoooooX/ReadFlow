import * as FileSystem from 'expo-file-system';
import { DatabaseService } from '../database/DatabaseService';

/**
 * 图片缓存服务 - 将网络图片下载到本地
 */
class ImageCacheService {
  private static instance: ImageCacheService;
  private databaseService: DatabaseService;
  private cacheDir: string;
  private downloadQueue: Map<string, Promise<string | null>> = new Map();

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
    this.cacheDir = `${FileSystem.cacheDirectory}images/`;
  }

  public static getInstance(): ImageCacheService {
    if (!ImageCacheService.instance) {
      ImageCacheService.instance = new ImageCacheService();
    }
    return ImageCacheService.instance;
  }

  /**
   * 确保缓存目录存在
   */
  private async ensureCacheDir(): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(this.cacheDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.cacheDir, { intermediates: true });
    }
  }

  /**
   * 生成缓存文件名
   */
  private generateCacheFileName(url: string): string {
    // 使用URL的hash作为文件名
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const ext = this.getFileExtension(url);
    return `img_${Math.abs(hash)}${ext}`;
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(url: string): string {
    const match = url.match(/\.(jpg|jpeg|png|gif|webp)/i);
    return match ? `.${match[1].toLowerCase()}` : '.jpg';
  }

  /**
   * 下载并缓存图片
   */
  public async cacheImage(url: string): Promise<string | null> {
    if (!url) return null;

    try {
      await this.ensureCacheDir();

      const fileName = this.generateCacheFileName(url);
      const localPath = `${this.cacheDir}${fileName}`;

      // 检查本地是否已存在
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      if (fileInfo.exists) {
        return localPath;
      }

      // 避免重复下载同一图片
      if (this.downloadQueue.has(url)) {
        return this.downloadQueue.get(url)!;
      }

      // 开始下载
      const downloadPromise = this.downloadImage(url, localPath);
      this.downloadQueue.set(url, downloadPromise);

      const result = await downloadPromise;
      this.downloadQueue.delete(url);

      return result;
    } catch (error) {
      return null;
    }
  }

  /**
   * 下载图片到本地
   */
  private async downloadImage(url: string, localPath: string): Promise<string | null> {
    try {
      // 创建超时控制
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 30000); // 30秒超时
      });

      const downloadPromise = FileSystem.downloadAsync(url, localPath, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      }).then(async (result) => {
        if (result.status === 200) {
          return localPath;
        } else {
          await FileSystem.deleteAsync(localPath, { idempotent: true });
          return null;
        }
      });

      const result = await Promise.race([downloadPromise, timeoutPromise]);
      
      if (result === null) {
        await FileSystem.deleteAsync(localPath, { idempotent: true });
      }
      
      return result;
    } catch (error) {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
      return null;
    }
  }

  /**
   * 批量缓存图片（用于RSS解析后）
   */
  public async cacheArticleImages(articleId: number, imageUrl: string | null, content: string): Promise<void> {
    if (!imageUrl && !content) return;

    try {
      // 1. 缓存封面图
      let localImageUrl: string | null = null;
      if (imageUrl) {
        localImageUrl = await this.cacheImage(imageUrl);
      }

      // 2. 提取并缓存正文中的图片
      const imgRegex = /<img[^>]*>/gi;
      let match;
      let updatedContent = content;
      const replacements: { original: string; replaced: string }[] = [];

      while ((match = imgRegex.exec(content)) !== null) {
        const imgTag = match[0];
        
        // 提取所有可能的URL属性
        const srcMatch = imgTag.match(/\s+src=["']([^"']+)["']/i);
        const dataSrcMatch = imgTag.match(/\s+data-(?:src|original|crop-orig-src)=["']([^"']+)["']/i);
        
        let originalUrl = srcMatch?.[1];
        let needsUpdate = false;
        let newImgTag = imgTag;
        
        // 如果src是网络图片，缓存并替换
        if (originalUrl && (originalUrl.startsWith('http://') || originalUrl.startsWith('https://'))) {
          const localPath = await this.cacheImage(originalUrl);
          if (localPath) {
            newImgTag = newImgTag.replace(
              new RegExp(`src=["']${originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i'),
              `src="${localPath}"`
            );
            needsUpdate = true;
          }
        }
        
        // 如果有data-*属性也是网络图片，一并缓存
        const dataUrl = dataSrcMatch?.[1];
        if (dataUrl && (dataUrl.startsWith('http://') || dataUrl.startsWith('https://'))) {
          const localPath = await this.cacheImage(dataUrl);
          if (localPath) {
            const attrName = dataSrcMatch![0].match(/data-[\w-]+/)?.[0] || 'data-src';
            newImgTag = newImgTag.replace(
              new RegExp(`${attrName}=["']${dataUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i'),
              `${attrName}="${localPath}"`
            );
            needsUpdate = true;
          }
        }
        
        if (needsUpdate) {
          replacements.push({ original: imgTag, replaced: newImgTag });
        }
      }
      
      // 执行替换
      for (const { original, replaced } of replacements) {
        const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        updatedContent = updatedContent.replace(new RegExp(escapedOriginal, 'g'), replaced);
      }

      // 3. 更新数据库
      if (localImageUrl || updatedContent !== content) {
        await this.databaseService.executeStatement(
          `UPDATE articles SET 
            image_url = COALESCE(?, image_url),
            content = ?
           WHERE id = ?`,
          [localImageUrl, updatedContent, articleId]
        );
      }
    } catch (error) {
      // 静默失败，不影响主流程
    }
  }

  /**
   * 获取图片（优先本地，fallback到网络）
   */
  public async getImageUri(url: string | null): Promise<string | null> {
    if (!url) return null;

    // 如果已经是本地路径，直接返回
    if (url.startsWith('file://') || url.startsWith(this.cacheDir)) {
      const fileInfo = await FileSystem.getInfoAsync(url);
      if (fileInfo.exists) {
        return url;
      }
    }

    // 尝试从缓存获取
    const fileName = this.generateCacheFileName(url);
    const localPath = `${this.cacheDir}${fileName}`;
    
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (fileInfo.exists) {
      return localPath;
    }

    // 返回原始URL
    return url;
  }

  /**
   * 清理过期缓存
   */
  public async cleanCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.cacheDir);
      if (!dirInfo.exists) return;

      const files = await FileSystem.readDirectoryAsync(this.cacheDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = `${this.cacheDir}${file}`;
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        
        if (fileInfo.exists && fileInfo.modificationTime) {
          const age = now - fileInfo.modificationTime * 1000;
          if (age > maxAgeMs) {
            await FileSystem.deleteAsync(filePath, { idempotent: true });
          }
        }
      }
    } catch (error) {
      console.error('清理缓存失败:', error);
    }
  }

  /**
   * 获取缓存大小
   */
  public async getCacheSize(): Promise<number> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.cacheDir);
      if (!dirInfo.exists) return 0;

      const files = await FileSystem.readDirectoryAsync(this.cacheDir);
      let totalSize = 0;

      for (const file of files) {
        const fileInfo = await FileSystem.getInfoAsync(`${this.cacheDir}${file}`);
        if (fileInfo.exists && fileInfo.size) {
          totalSize += fileInfo.size;
        }
      }

      return totalSize;
    } catch (error) {
      return 0;
    }
  }
}

export const imageCacheService = ImageCacheService.getInstance();
