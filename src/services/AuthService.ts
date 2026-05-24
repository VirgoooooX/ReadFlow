import AsyncStorage from '@react-native-async-storage/async-storage';
import AvatarStorageService from './AvatarStorageService';
import { logger } from './rss/RSSUtils';
import { SettingsService } from './SettingsService';
import { cloudConfigService } from './CloudConfigService';
import cacheEventEmitter from './CacheEventEmitter';
import { databaseService } from '../database/DatabaseService';

export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  bio?: string;
  phone?: string;
  location?: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
}

export interface LogoutOptions {
  clearLocalData?: boolean;
}

export type TokenValidationResult = 'valid' | 'invalid' | 'unknown';

export function parseTokenValidationResult(responseOk: boolean, data: any): TokenValidationResult {
  if (!responseOk) return 'unknown';
  if (data?.valid === true) return 'valid';
  if (data?.valid === false) return 'invalid';
  return 'unknown';
}

export function shouldLogoutForTokenValidation(result: TokenValidationResult): boolean {
  return result === 'invalid';
}

interface CloudProfileResponse {
  ok: boolean;
  user?: {
    id: string;
    username: string;
    email?: string;
    registeredAt?: string;
    lastActive?: string | Date;
  };
  settings?: any;
  feeds?: any[];
  error?: string;
}

export class AuthService {
  private static instance: AuthService;
  private currentUser: User | null = null;
  private authToken: string | null = null;
  private registeredUsers: Map<string, { user: User; password: string }> = new Map();
  private static readonly REGISTERED_USERS_KEY = 'registered_users';
  private initialized = false;
  private settingsService?: SettingsService;
  private backgroundValidationInFlight: Promise<void> | null = null;

  private getSettingsService(): SettingsService {
    if (!this.settingsService) {
      this.settingsService = SettingsService.getInstance();
    }
    return this.settingsService;
  }

  private constructor() {
    // 异步初始化将在getInstance或initialize中调用
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 初始化数据，从AsyncStorage加载已注册用户
   */
  private async initializeData(): Promise<void> {
    try {
      const storedUsers = await AsyncStorage.getItem(AuthService.REGISTERED_USERS_KEY);
      if (storedUsers) {
        const usersData = JSON.parse(storedUsers);
        this.registeredUsers = new Map(Object.entries(usersData));
      } else {
        // 初始化默认测试用户
        this.registeredUsers.set('user@readflow.com', {
          user: {
            id: '1',
            username: 'ReadFlow用户',
            email: 'user@readflow.com',
            avatar: undefined,
            bio: '热爱技术，喜欢阅读科技文章',
            phone: '',
            location: '北京',
            createdAt: '2024-01-01T00:00:00Z',
            lastLoginAt: new Date().toISOString(),
          },
          password: '123456'
        });
        await this.saveRegisteredUsers();
      }
    } catch (error) {
      logger.error('初始化用户数据失败:', error);
    }
  }

  /**
   * 保存已注册用户到AsyncStorage
   */
  private async saveRegisteredUsers(): Promise<void> {
    try {
      const usersObject = Object.fromEntries(this.registeredUsers);
      await AsyncStorage.setItem(AuthService.REGISTERED_USERS_KEY, JSON.stringify(usersObject));
    } catch (error) {
      logger.error('保存用户数据失败:', error);
    }
  }


  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * 初始化认证服务，检查本地存储的登录状态
   */
  public async initialize(): Promise<void> {
    try {
      // 先初始化用户数据
      await this.initializeData();

      const cloudConfig = await cloudConfigService.getConfig();
      const token = cloudConfig.auth.accessToken;
      const userStr = cloudConfig.auth.user ? JSON.stringify(cloudConfig.auth.user) : null;

      if (token && userStr) {
        this.authToken = token;
        this.currentUser = JSON.parse(userStr);

        if (this.currentUser) {
          const avatarPath = await AvatarStorageService.getAvatarPath(this.currentUser.id);
          if (avatarPath && avatarPath !== this.currentUser.avatar) {
            this.currentUser.avatar = avatarPath;
            await cloudConfigService.updateConfig({ auth: { user: this.currentUser } });
          }

          setTimeout(() => {
            try {
              const { configSyncService } = require('./ConfigSyncService');
              void configSyncService.bootstrapConfigAfterAuth();
            } catch {
            }
          }, 0);

          void this.validateSessionInBackground();
        }
      }
    } catch (error) {
      logger.error('初始化认证服务失败:', error);
      await this.logout();
    } finally {
      this.initialized = true;
    }
  }

  /**
   * 用户登录
   */
  public async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const cloudConfig = await cloudConfigService.getConfig();
      if (!cloudConfig.serverUrl) {
        return {
          success: false,
          message: '请先配置服务端地址！'
        };
      }
      const response = await this.performCloudLogin(credentials);
      if (response.success && response.user && response.token) {
        this.currentUser = response.user;
        this.authToken = response.token;
        await cloudConfigService.updateConfig({
          auth: {
            user: response.user,
            accessToken: response.token,
            lastValidatedAt: Date.now(),
          },
        });

        try {
          const appSettings = await this.getSettingsService().getAppSettings();
          const nextUserId = String(response.user.id || '');
          if (nextUserId && appSettings?.sync?.userId !== nextUserId) {
            await this.getSettingsService().updateAppSettingNoCloudSync('sync', {
              ...appSettings.sync,
              userId: nextUserId,
            });
          }
        } catch {
        }

        setTimeout(() => {
          try {
            const { configSyncService } = require('./ConfigSyncService');
            void configSyncService.bootstrapConfigAfterAuth();
          } catch {
          }
        }, 0);
      }
      return response;
    } catch (error) {
      logger.error('登录失败:', error);
      return {
        success: false,
        message: '登录过程中出现错误，请检查网络和服务器配置'
      };
    }
  }

  /**
   * 用户注册
   */
  public async register(data: RegisterData): Promise<AuthResponse> {
    try {
      const cloudConfig = await cloudConfigService.getConfig();
      if (!cloudConfig.serverUrl) {
        return {
          success: false,
          message: '请先配置服务端地址！'
        };
      }
      const response = await this.performCloudRegister(data);
      if (response.success && response.user && response.token) {
        this.currentUser = response.user;
        this.authToken = response.token;
        await cloudConfigService.updateConfig({
          auth: {
            user: response.user,
            accessToken: response.token,
            lastValidatedAt: Date.now(),
          },
        });

        try {
          const appSettings = await this.getSettingsService().getAppSettings();
          const nextUserId = String(response.user.id || '');
          if (nextUserId && appSettings?.sync?.userId !== nextUserId) {
            await this.getSettingsService().updateAppSettingNoCloudSync('sync', {
              ...appSettings.sync,
              userId: nextUserId,
            });
          }
        } catch {
        }

        setTimeout(() => {
          try {
            const { configSyncService } = require('./ConfigSyncService');
            void configSyncService.bootstrapConfigAfterAuth();
          } catch {
          }
        }, 0);
      }
      return response;
    } catch (error) {
      logger.error('注册失败:', error);
      return {
        success: false,
        message: '注册过程中出现错误，请检查网络和服务器配置'
      };
    }
  }

  /**
   * 用户登出
   */
  public async logout(options: LogoutOptions = {}): Promise<void> {
    try {
      // 清除本地认证状态
      this.currentUser = null;
      this.authToken = null;
      await cloudConfigService.clearAuth();

      if (options.clearLocalData === true) {
        await databaseService.clearUserData();
        await this.getSettingsService().clearAllSettings();
      }

      // 发送事件通知相关组件和状态管理进行重置
      cacheEventEmitter.clearAll();
      cacheEventEmitter.emit({ type: 'authLogout' });

      try {
        const { store } = require('../store');
        if (store && typeof store.dispatch === 'function') {
          store.dispatch({ type: 'AUTH_LOGOUT' });
        }
      } catch {
      }

    } catch (error) {
      logger.error('登出失败:', error);
    }
  }

  /**
   * 更新用户信息
   */
  public async updateProfile(updates: Partial<User>): Promise<AuthResponse> {
    try {
      if (!this.currentUser) {
        return {
          success: false,
          message: '用户未登录'
        };
      }

      // TODO: 替换为实际的API调用.
      // const response = await this.performCloudUpdateProfile(updates);

      return {
        success: false,
        message: '暂不支持更新个人信息'
      };
    } catch (error) {
      logger.error('更新用户信息失败:', error);
      return {
        success: false,
        message: '更新用户信息时出现错误，请重试'
      };
    }
  }

  /**
   * 修改密码
   */
  public async changePassword(oldPassword: string, newPassword: string): Promise<AuthResponse> {
    try {
      if (!this.currentUser) {
        return {
          success: false,
          message: '用户未登录'
        };
      }

      return {
        success: false,
        message: '暂不支持修改密码'
      };
    } catch (error) {
      logger.error('修改密码失败:', error);
      return {
        success: false,
        message: '修改密码时出现错误，请重试'
      };
    }
  }

  /**
   * 验证token是否有效
   */
  private async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      const cloudConfig = await cloudConfigService.getConfig();
      if (!cloudConfig.serverUrl) return 'unknown';
      return await this.performCloudValidate(token);
    } catch (error) {
      logger.error('验证token失败:', error);
      return 'unknown';
    }
  }

  private async validateTokenWithTimeout(token: string, timeoutMs: number): Promise<TokenValidationResult> {
    const cloudConfig = await cloudConfigService.getConfig();
    if (!cloudConfig.serverUrl) return 'unknown';
    try {
      const url = await this.getApiUrl('/api/auth/validate');
      const headers = await this.getHeaders();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ token }),
          signal: controller.signal as any,
        } as any);
        const data = await res.json().catch(() => undefined);
        return parseTokenValidationResult(res.ok, data);
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return 'unknown';
    }
  }

  private async validateSessionInBackground(): Promise<void> {
    if (this.backgroundValidationInFlight) return this.backgroundValidationInFlight;

    this.backgroundValidationInFlight = (async () => {
      try {
        const cloudConfig = await cloudConfigService.getConfig();
        const token = this.authToken || cloudConfig.auth?.accessToken;
        const user = this.currentUser || cloudConfig.auth?.user;
        if (!token || !user) return;
        if (!cloudConfig.serverUrl) return;

        const lastValidatedAt = typeof cloudConfig.auth?.lastValidatedAt === 'number' ? cloudConfig.auth.lastValidatedAt : 0;
        if (lastValidatedAt && Date.now() - lastValidatedAt < 6 * 60 * 60 * 1000) return;

        const validationResult = await this.validateTokenWithTimeout(token, 1500);
        if (validationResult === 'valid') {
          await cloudConfigService.updateConfig({ auth: { lastValidatedAt: Date.now() } });
          return;
        }

        if (shouldLogoutForTokenValidation(validationResult)) {
          await this.logout();
        }
      } finally {
        this.backgroundValidationInFlight = null;
      }
    })();

    return this.backgroundValidationInFlight;
  }

  // ========== Cloud API Methods ==========
  private async getApiUrl(path: string): Promise<string> {
    const cloudConfig = await cloudConfigService.getConfig();
    const baseUrl = cloudConfig.serverUrl;
    if (!baseUrl) throw new Error('Server URL not configured');
    return `${baseUrl.replace(/\/$/, '')}${path}`;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    const cloudConfig = await cloudConfigService.getConfig();
    if (cloudConfig.serverAccessKey) {
      headers['x-server-token'] = cloudConfig.serverAccessKey;
      headers['x-server-access-key'] = cloudConfig.serverAccessKey;
    }
    return headers;
  }

  private async getAuthorizedHeaders(token: string): Promise<HeadersInit> {
    const base = await this.getHeaders();
    return {
      ...base,
      Authorization: `Bearer ${token}`,
    };
  }

  private async pushCloudSettingsFromLocal(token: string, userId: string, settings: any): Promise<void> {
    const url = await this.getApiUrl('/api/rss/clientSync');
    const headers = await this.getAuthorizedHeaders(token);
    const payload = {
      user: {
        id: userId,
        username: this.currentUser?.username,
        email: this.currentUser?.email,
        registeredAt: this.currentUser?.createdAt,
      },
      settings,
      feeds: [],
    };
    await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  }

  private async pullCloudSettingsToLocal(token: string, userId: string): Promise<void> {
    const url = await this.getApiUrl('/api/rss/profile');
    const headers = await this.getAuthorizedHeaders(token);
    const res = await fetch(url, { method: 'GET', headers });
    const data = (await res.json()) as CloudProfileResponse;
    if (!res.ok || !data?.ok) {
      return;
    }

    const remoteSettings = data.settings;
    const local = await this.getSettingsService().getAppSettings();
    const remoteAppSettings =
      remoteSettings && typeof remoteSettings === 'object' && remoteSettings.appSettings && typeof remoteSettings.appSettings === 'object'
        ? remoteSettings.appSettings
        : remoteSettings;
    const remoteReadingSettings =
      remoteSettings && typeof remoteSettings === 'object' && remoteSettings.readingSettings && typeof remoteSettings.readingSettings === 'object'
        ? remoteSettings.readingSettings
        : null;

    if (remoteReadingSettings) {
      try {
        await this.getSettingsService().saveReadingSettingsNoCloudSync(remoteReadingSettings);
      } catch {
      }
    }

    const baseMerged = remoteAppSettings && typeof remoteAppSettings === 'object' ? { ...local, ...remoteAppSettings } : local;
    const merged = {
      ...baseMerged,
      sync: {
        ...local.sync,
        ...((remoteAppSettings && typeof remoteAppSettings === 'object' && remoteAppSettings.sync) ? remoteAppSettings.sync : {}),
        userId,
      },
    };
    await this.getSettingsService().saveAppSettingsNoCloudSync(merged);
    const readingSettings = await this.getSettingsService().getReadingSettings();
    await this.pushCloudSettingsFromLocal(token, userId, { appSettings: merged, readingSettings });
  }

  private async performCloudLogin(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const url = await this.getApiUrl('/api/auth/login');
      const headers = await this.getHeaders();
      const res = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(credentials)
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, message: data.message || 'Login failed' };
      }
      return data;
    } catch (e) {
      throw e;
    }
  }

  private async performCloudRegister(data: RegisterData): Promise<AuthResponse> {
    try {
      const url = await this.getApiUrl('/api/auth/register');
      const headers = await this.getHeaders();
      const res = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(data)
      });
      const resData = await res.json();
      if (!res.ok) {
        return { success: false, message: resData.message || 'Register failed' };
      }
      return resData;
    } catch (e) {
      throw e;
    }
  }

  private async performCloudValidate(token: string): Promise<TokenValidationResult> {
    try {
      const url = await this.getApiUrl('/api/auth/validate');
      const headers = await this.getHeaders();
      const res = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ token })
      });
      const data = await res.json().catch(() => undefined);
      return parseTokenValidationResult(res.ok, data);
    } catch (e) {
      return 'unknown';
    }
  }

  /**
   * 获取当前用户
   */
  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  /**
   * 获取认证token
   */
  public getAuthToken(): string | null {
    return this.authToken;
  }

  /**
   * 检查是否已登录
   */
  public isAuthenticated(): boolean {
    return this.currentUser !== null && this.authToken !== null;
  }
}

export default AuthService.getInstance();
