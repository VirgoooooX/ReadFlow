import AsyncStorage from '@react-native-async-storage/async-storage';
import AvatarStorageService from './AvatarStorageService';
import { logger } from './rss/RSSUtils';
import { SettingsService } from './SettingsService';
import { cloudConfigService } from './CloudConfigService';

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
          // 验证token是否仍然有效
          const isValid = await this.validateToken(token);
          if (isValid) {
            // 加载用户头像
            const avatarPath = await AvatarStorageService.getAvatarPath(this.currentUser.id);
            if (avatarPath && avatarPath !== this.currentUser.avatar) {
              this.currentUser.avatar = avatarPath;
              await cloudConfigService.updateConfig({ auth: { user: this.currentUser } });
            }

            await cloudConfigService.updateConfig({ auth: { lastValidatedAt: Date.now() } });
          } else {
            await this.logout();
          }
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
      if (cloudConfig.serverUrl) {
        try {
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
          }
          return response;
        } catch (e) {
          // Network error or other crash
          throw e;
        }
      }

      // Local mode fallback (legacy mock)
      const response = await this.mockLogin(credentials);

      if (response.success && response.user && response.token) {
        this.currentUser = response.user;
        this.authToken = response.token;

        // 更新最后登录时间
        this.currentUser.lastLoginAt = new Date().toISOString();
      }

      return response;
    } catch (error) {
      logger.error('登录失败:', error);
      return {
        success: false,
        message: '登录过程中出现错误，请重试'
      };
    }
  }

  /**
   * 用户注册
   */
  public async register(data: RegisterData): Promise<AuthResponse> {
    try {
      const cloudConfig = await cloudConfigService.getConfig();
      if (cloudConfig.serverUrl) {
        try {
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
          }
          return response;
        } catch (e) {
          throw e;
        }
      }

      // Local mode fallback
      const response = await this.mockRegister(data);

      return response;
    } catch (error) {
      logger.error('注册失败:', error);
      return {
        success: false,
        message: '注册过程中出现错误，请重试'
      };
    }
  }

  /**
   * 用户登出
   */
  public async logout(): Promise<void> {
    try {
      // TODO: 调用API通知服务器登出

      // 清除本地数据
      this.currentUser = null;
      this.authToken = null;

      await cloudConfigService.clearAuth();
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

      // TODO: 替换为实际的API调用
      const response = await this.mockUpdateProfile(updates);

      if (response.success && response.user) {
        this.currentUser = response.user;
        await cloudConfigService.updateConfig({ auth: { user: this.currentUser } });
      }

      return response;
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

      // TODO: 替换为实际的API调用
      const response = await this.mockChangePassword(oldPassword, newPassword);

      return response;
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
  private async validateToken(token: string): Promise<boolean> {
    try {
      const cloudConfig = await cloudConfigService.getConfig();
      if (cloudConfig.serverUrl) {
        return await this.performCloudValidate(token);
      }
      return await this.mockValidateToken(token);
    } catch (error) {
      logger.error('验证token失败:', error);
      return false;
    }
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
    const remoteLLMSettings =
      remoteSettings && typeof remoteSettings === 'object' && remoteSettings.llmSettings && typeof remoteSettings.llmSettings === 'object'
        ? remoteSettings.llmSettings
        : null;

    if (remoteReadingSettings) {
      try {
        await this.getSettingsService().saveReadingSettingsNoCloudSync(remoteReadingSettings);
      } catch {
      }
    }
    if (remoteLLMSettings) {
      try {
        await this.getSettingsService().saveLLMSettingsNoCloudSync(remoteLLMSettings);
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
    const llmSettings = await this.getSettingsService().getLLMSettingsStore();
    await this.pushCloudSettingsFromLocal(token, userId, { appSettings: merged, readingSettings, llmSettings });
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

  private async performCloudValidate(token: string): Promise<boolean> {
    try {
      const url = await this.getApiUrl('/api/auth/validate');
      const headers = await this.getHeaders();
      const res = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ token })
      });
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.valid;
    } catch (e) {
      return false;
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

  // ========== 模拟API方法 ==========
  // 在实际项目中，这些方法应该替换为真实的API调用

  private async mockLogin(credentials: LoginCredentials): Promise<AuthResponse> {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 从注册用户中查找
    const registeredUser = this.registeredUsers.get(credentials.email);

    if (registeredUser && registeredUser.password === credentials.password) {
      // 更新最后登录时间
      const updatedUser = {
        ...registeredUser.user,
        lastLoginAt: new Date().toISOString(),
      };

      // 更新存储的用户信息
      this.registeredUsers.set(credentials.email, {
        ...registeredUser,
        user: updatedUser
      });
      await this.saveRegisteredUsers();

      return {
        success: true,
        user: updatedUser,
        token: 'mock_jwt_token_' + Date.now(),
        message: '登录成功'
      };
    } else {
      return {
        success: false,
        message: '邮箱或密码错误'
      };
    }
  }

  private async mockRegister(data: RegisterData): Promise<AuthResponse> {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 检查邮箱是否已被注册
    if (this.registeredUsers.has(data.email)) {
      return {
        success: false,
        message: '该邮箱已被注册'
      };
    }

    // 创建新用户
    const newUser: User = {
      id: Date.now().toString(), // 简单的ID生成
      username: data.username,
      email: data.email,
      avatar: undefined,
      bio: '',
      phone: '',
      location: '',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    // 保存到模拟数据库
    this.registeredUsers.set(data.email, {
      user: newUser,
      password: data.password
    });
    await this.saveRegisteredUsers();

    return {
      success: true,
      message: '注册成功，请登录'
    };
  }

  private async mockUpdateProfile(updates: Partial<User>): Promise<AuthResponse> {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 1500));

    if (!this.currentUser) {
      return {
        success: false,
        message: '用户未登录'
      };
    }

    const updatedUser: User = {
      ...this.currentUser,
      ...updates,
      id: this.currentUser.id, // 确保ID不被修改
    };

    // 更新registeredUsers中的用户信息
    const userRecord = this.registeredUsers.get(this.currentUser.email);
    if (userRecord) {
      this.registeredUsers.set(this.currentUser.email, {
        ...userRecord,
        user: updatedUser
      });
      await this.saveRegisteredUsers();
    }

    return {
      success: true,
      user: updatedUser,
      message: '更新成功'
    };
  }

  private async mockChangePassword(oldPassword: string, newPassword: string): Promise<AuthResponse> {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 模拟旧密码验证
    if (oldPassword !== '123456') {
      return {
        success: false,
        message: '原密码错误'
      };
    }

    return {
      success: true,
      message: '密码修改成功'
    };
  }

  private async mockValidateToken(token: string): Promise<boolean> {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 500));

    // 简单的token格式验证
    return token.startsWith('mock_jwt_token_');
  }
}

export default AuthService.getInstance();
