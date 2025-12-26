import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './rss/RSSUtils';

export interface AvatarInfo {
  userId: string;
  uri: string;
  localPath: string;
  timestamp: number;
}

/**
 * 头像存储服务 - 简化版本，仅使用 AsyncStorage
 * 不进行实际的文件系统操作，避免触发 React Native 本地代码问题
 */
export class AvatarStorageService {
  private static instance: AvatarStorageService;
  private static readonly AVATAR_STORAGE_KEY = 'user_avatars';

  private constructor() {
    // 不做任何初始化操作
  }

  public static getInstance(): AvatarStorageService {
    if (!AvatarStorageService.instance) {
      AvatarStorageService.instance = new AvatarStorageService();
    }
    return AvatarStorageService.instance;
  }

  /**
   * 保存用户头像路径信息
   */
  public async saveAvatar(userId: string, imageUri: string): Promise<string | null> {
    try {
      const timestamp = Date.now();
      const avatarInfo: AvatarInfo = {
        userId,
        uri: imageUri,
        localPath: imageUri, // 直接使用原始 URI
        timestamp
      };

      const allAvatars = await this.getAllAvatarInfos();
      allAvatars[userId] = avatarInfo;
      await AsyncStorage.setItem(AvatarStorageService.AVATAR_STORAGE_KEY, JSON.stringify(allAvatars));
      
      return imageUri;
    } catch (error) {
      logger.error('保存头像失败:', error);
      return null;
    }
  }

  /**
   * 获取用户头像路径
   */
  public async getAvatarPath(userId: string): Promise<string | null> {
    try {
      const avatarInfo = await this.getAvatarInfo(userId);
      if (!avatarInfo) {
        return null;
      }
      return avatarInfo.uri;
    } catch (error) {
      logger.error('获取头像路径失败:', error);
      return null;
    }
  }

  /**
   * 删除用户头像
   */
  public async deleteAvatar(userId: string): Promise<boolean> {
    try {
      await this.deleteAvatarInfo(userId);
      return true;
    } catch (error) {
      logger.error('删除头像失败:', error);
      return false;
    }
  }

  /**
   * 保存头像信息到 AsyncStorage
   */
  private async saveAvatarInfo(userId: string, avatarInfo: AvatarInfo): Promise<void> {
    try {
      const allAvatars = await this.getAllAvatarInfos();
      allAvatars[userId] = avatarInfo;
      await AsyncStorage.setItem(AvatarStorageService.AVATAR_STORAGE_KEY, JSON.stringify(allAvatars));
    } catch (error) {
      logger.error('保存头像信息失败:', error);
    }
  }

  /**
   * 获取头像信息
   */
  private async getAvatarInfo(userId: string): Promise<AvatarInfo | null> {
    try {
      const allAvatars = await this.getAllAvatarInfos();
      return allAvatars[userId] || null;
    } catch (error) {
      logger.error('获取头像信息失败:', error);
      return null;
    }
  }

  /**
   * 删除头像信息
   */
  private async deleteAvatarInfo(userId: string): Promise<void> {
    try {
      const allAvatars = await this.getAllAvatarInfos();
      delete allAvatars[userId];
      await AsyncStorage.setItem(AvatarStorageService.AVATAR_STORAGE_KEY, JSON.stringify(allAvatars));
    } catch (error) {
      logger.error('删除头像信息失败:', error);
    }
  }

  /**
   * 获取所有头像信息
   */
  private async getAllAvatarInfos(): Promise<{ [userId: string]: AvatarInfo }> {
    try {
      const stored = await AsyncStorage.getItem(AvatarStorageService.AVATAR_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      logger.error('获取所有头像信息失败:', error);
      return {};
    }
  }

  /**
   * 清理所有头像数据
   */
  public async clearAllAvatars(): Promise<void> {
    try {
      await AsyncStorage.removeItem(AvatarStorageService.AVATAR_STORAGE_KEY);
    } catch (error) {
      logger.error('清理头像数据失败:', error);
    }
  }

  /**
   * 获取头像存储使用情况
   */
  public async getStorageUsage(): Promise<{ totalSize: number; fileCount: number }> {
    try {
      const allAvatars = await this.getAllAvatarInfos();
      const fileCount = Object.keys(allAvatars).length;
      return {
        totalSize: 0, // 简化版本不计算大小
        fileCount
      };
    } catch (error) {
      logger.error('获取存储使用情况失败:', error);
      return { totalSize: 0, fileCount: 0 };
    }
  }
}

export default AvatarStorageService.getInstance();
