import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface AvatarInfo {
  userId: string;
  uri: string;
  localPath: string;
  timestamp: number;
}

export class AvatarStorageService {
  private static instance: AvatarStorageService;
  private static readonly AVATAR_STORAGE_KEY = 'user_avatars';
  private static readonly AVATAR_DIR = `${FileSystem.documentDirectory}avatars/`;

  private constructor() {
    this.ensureAvatarDirectory();
  }

  public static getInstance(): AvatarStorageService {
    if (!AvatarStorageService.instance) {
      AvatarStorageService.instance = new AvatarStorageService();
    }
    return AvatarStorageService.instance;
  }

  /**
   * 确保头像目录存在
   */
  private async ensureAvatarDirectory(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(AvatarStorageService.AVATAR_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(AvatarStorageService.AVATAR_DIR, { intermediates: true });
      }
    } catch (error) {
      console.error('创建头像目录失败:', error);
    }
  }

  /**
   * 保存用户头像
   */
  public async saveAvatar(userId: string, imageUri: string): Promise<string | null> {
    try {
      await this.ensureAvatarDirectory();
      
      // 生成唯一的文件名
      const timestamp = Date.now();
      const extension = this.getFileExtension(imageUri) || 'jpg';
      const fileName = `avatar_${userId}_${timestamp}.${extension}`;
      const localPath = `${AvatarStorageService.AVATAR_DIR}${fileName}`;

      // 复制文件到应用目录
      await FileSystem.copyAsync({
        from: imageUri,
        to: localPath
      });

      // 删除旧头像文件
      await this.deleteOldAvatar(userId);

      // 保存头像信息到AsyncStorage
      const avatarInfo: AvatarInfo = {
        userId,
        uri: imageUri,
        localPath,
        timestamp
      };

      await this.saveAvatarInfo(userId, avatarInfo);
      
      return localPath;
    } catch (error) {
      console.error('保存头像失败:', error);
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

      // 检查文件是否存在
      const fileInfo = await FileSystem.getInfoAsync(avatarInfo.localPath);
      if (fileInfo.exists) {
        return avatarInfo.localPath;
      } else {
        // 文件不存在，清理记录
        await this.deleteAvatarInfo(userId);
        return null;
      }
    } catch (error) {
      console.error('获取头像路径失败:', error);
      return null;
    }
  }

  /**
   * 删除用户头像
   */
  public async deleteAvatar(userId: string): Promise<boolean> {
    try {
      const avatarInfo = await this.getAvatarInfo(userId);
      if (avatarInfo) {
        // 删除文件
        const fileInfo = await FileSystem.getInfoAsync(avatarInfo.localPath);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(avatarInfo.localPath);
        }
        
        // 删除记录
        await this.deleteAvatarInfo(userId);
      }
      return true;
    } catch (error) {
      console.error('删除头像失败:', error);
      return false;
    }
  }

  /**
   * 删除旧头像文件
   */
  private async deleteOldAvatar(userId: string): Promise<void> {
    try {
      const oldAvatarInfo = await this.getAvatarInfo(userId);
      if (oldAvatarInfo) {
        const fileInfo = await FileSystem.getInfoAsync(oldAvatarInfo.localPath);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(oldAvatarInfo.localPath);
        }
      }
    } catch (error) {
      console.error('删除旧头像失败:', error);
    }
  }

  /**
   * 保存头像信息到AsyncStorage
   */
  private async saveAvatarInfo(userId: string, avatarInfo: AvatarInfo): Promise<void> {
    try {
      const allAvatars = await this.getAllAvatarInfos();
      allAvatars[userId] = avatarInfo;
      await AsyncStorage.setItem(AvatarStorageService.AVATAR_STORAGE_KEY, JSON.stringify(allAvatars));
    } catch (error) {
      console.error('保存头像信息失败:', error);
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
      console.error('获取头像信息失败:', error);
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
      console.error('删除头像信息失败:', error);
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
      console.error('获取所有头像信息失败:', error);
      return {};
    }
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(uri: string): string | null {
    const match = uri.match(/\.([^.]+)$/);
    return match ? match[1] : null;
  }

  /**
   * 清理所有头像数据（用于测试或重置）
   */
  public async clearAllAvatars(): Promise<void> {
    try {
      // 删除所有头像文件
      const dirInfo = await FileSystem.getInfoAsync(AvatarStorageService.AVATAR_DIR);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(AvatarStorageService.AVATAR_DIR);
        await this.ensureAvatarDirectory();
      }
      
      // 清空AsyncStorage记录
      await AsyncStorage.removeItem(AvatarStorageService.AVATAR_STORAGE_KEY);
    } catch (error) {
      console.error('清理头像数据失败:', error);
    }
  }

  /**
   * 获取头像存储使用情况
   */
  public async getStorageUsage(): Promise<{ totalSize: number; fileCount: number }> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(AvatarStorageService.AVATAR_DIR);
      if (!dirInfo.exists) {
        return { totalSize: 0, fileCount: 0 };
      }

      const files = await FileSystem.readDirectoryAsync(AvatarStorageService.AVATAR_DIR);
      let totalSize = 0;
      
      for (const file of files) {
        const filePath = `${AvatarStorageService.AVATAR_DIR}${file}`;
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (fileInfo.exists && !fileInfo.isDirectory) {
          totalSize += fileInfo.size || 0;
        }
      }

      return {
        totalSize,
        fileCount: files.length
      };
    } catch (error) {
      console.error('获取存储使用情况失败:', error);
      return { totalSize: 0, fileCount: 0 };
    }
  }
}

export default AvatarStorageService.getInstance();