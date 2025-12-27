import { AppError } from '../types';
import { logger } from './rss/RSSUtils';

/**
 * RSSHUB服务 - 处理rsshub://协议的URL转换
 */
export class RSShubService {
  private static instance: RSShubService;
  private static readonly DEFAULT_RSSHUB_INSTANCE = 'https://rsshub.app';
  
  // 常用的RSSHUB实例列表
  private static readonly RSSHUB_INSTANCES = [
    'https://rsshub.app',
    'https://rsshub.rssforever.com',
    'https://rss.198909.xyz:37891', 
    'https://rsshub.speedcloud.one',
    'https://rsshub.pseudoyu.com'
  ];

  private constructor() {}

  public static getInstance(): RSShubService {
    if (!RSShubService.instance) {
      RSShubService.instance = new RSShubService();
    }
    return RSShubService.instance;
  }

  /**
   * 检查URL是否为RSSHUB协议
   */
  public isRSSHubUrl(url: string): boolean {
    return url.toLowerCase().startsWith('rsshub://');
  }

  /**
   * 将rsshub://协议URL转换为实际的HTTP URL
   * @param rsshubUrl rsshub://格式的URL
   * @param instanceUrl 可选的RSSHUB实例URL
   * @returns 转换后的HTTP URL
   */
  public convertRSSHubUrl(rsshubUrl: string, instanceUrl?: string): string {
    if (!this.isRSSHubUrl(rsshubUrl)) {
      throw new AppError({
        code: 'INVALID_RSSHUB_URL',
        message: 'URL must start with rsshub://',
        timestamp: new Date(),
      });
    }

    // 移除rsshub://前缀 (忽略大小写)
    const path = rsshubUrl.substring('rsshub://'.length);
    
    // 使用指定的实例或默认实例
    const baseUrl = instanceUrl || RSShubService.DEFAULT_RSSHUB_INSTANCE;
    
    // 确保路径以/开头
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    
    return `${baseUrl}${normalizedPath}`;
  }

  /**
   * 验证RSSHUB路径格式
   */
  public validateRSSHubPath(rsshubUrl: string): boolean {
    if (!this.isRSSHubUrl(rsshubUrl)) {
      return false;
    }

    const path = rsshubUrl.substring('rsshub://'.length);
    
    // 基本格式验证：应该包含至少一个路径段
    if (!path || path.length === 0 || path === '/') {
      return false;
    }

    // 检查是否包含有效字符（允许路径、查询参数、点、百分号、减号、加号等）
    const validPathRegex = /^[a-zA-Z0-9\/._\%\?\&\=\+-]+$/;
    return validPathRegex.test(path);
  }

  /**
   * 获取可用的RSSHUB实例列表
   */
  public getAvailableInstances(): string[] {
    return [...RSShubService.RSSHUB_INSTANCES];
  }

  /**
   * 测试RSSHUB实例是否可用
   */
  public async testInstance(instanceUrl: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${instanceUrl}/`, {
        method: 'HEAD',
        // @ts-ignore - AbortSignal 可能在某些环境不支持
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      logger.warn(`RSSHUB instance ${instanceUrl} is not available:`, error);
      return false;
    }
  }

  /**
   * 自动选择最佳的RSSHUB实例
   */
  public async selectBestInstance(): Promise<string> {
    for (const instance of RSShubService.RSSHUB_INSTANCES) {
      const isAvailable = await this.testInstance(instance);
      if (isAvailable) {
        return instance;
      }
    }
    
    // 如果所有实例都不可用，返回默认实例
    logger.warn('No RSSHUB instances are available, using default');
    return RSShubService.DEFAULT_RSSHUB_INSTANCE;
  }

  /**
   * 解析RSSHUB URL并提供友好的描述
   */
  public parseRSSHubUrl(rsshubUrl: string): {
    platform: string;
    route: string;
    description: string;
  } {
    if (!this.isRSSHubUrl(rsshubUrl)) {
      throw new AppError({
        code: 'INVALID_RSSHUB_URL',
        message: 'URL must start with rsshub://',
        timestamp: new Date(),
      });
    }

    const path = rsshubUrl.substring('rsshub://'.length);
    const segments = path.split('/');
    const platform = segments[0] || 'unknown';
    const route = segments.slice(1).join('/') || '';

    // 根据平台提供友好的描述
    const descriptions: Record<string, string> = {
      'techcrunch': 'TechCrunch 科技新闻',
      'github': 'GitHub 仓库动态',
      'twitter': 'Twitter 用户动态',
      'weibo': '微博用户动态',
      'bilibili': 'B站UP主动态',
      'zhihu': '知乎专栏/用户动态',
      'juejin': '掘金用户文章',
      'v2ex': 'V2EX 论坫',
      'sspai': '少数派文章',
      'coolapk': '酷安应用市场',
      'cnbeta': 'cnBeta 科技资讯',
    };

    const description = descriptions[platform] || `${platform} RSS源`;

    return {
      platform,
      route,
      description,
    };
  }
}

export const rsshubService = RSShubService.getInstance();