import AsyncStorage from '@react-native-async-storage/async-storage';
import AvatarStorageService from './AvatarStorageService';
import { logger } from './rss/RSSUtils';

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

export class AuthService {
  private static instance: AuthService;
  private currentUser: User | null = null;
  private authToken: string | null = null;
  private registeredUsers: Map<string, { user: User; password: string }> = new Map();
  private static readonly REGISTERED_USERS_KEY = 'registered_users';
  private initialized = false;

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
        this.registeredUsers.set('user@techflow.com', {
          user: {
            id: '1',
            username: 'TechFlow用户',
            email: 'user@techflow.com',
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

      const token = await AsyncStorage.getItem('auth_token');
      const userStr = await AsyncStorage.getItem('current_user');

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
              await AsyncStorage.setItem('current_user', JSON.stringify(this.currentUser));
            }
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
      // TODO: 替换为实际的API调用
      const response = await this.mockLogin(credentials);

      if (response.success && response.user && response.token) {
        this.currentUser = response.user;
        this.authToken = response.token;

        // 保存到本地存储
        await AsyncStorage.setItem('auth_token', response.token);
        await AsyncStorage.setItem('current_user', JSON.stringify(response.user));

        // 更新最后登录时间
        this.currentUser.lastLoginAt = new Date().toISOString();
        await AsyncStorage.setItem('current_user', JSON.stringify(this.currentUser));
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
      // TODO: 替换为实际的API调用
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

      await AsyncStorage.multiRemove(['auth_token', 'current_user']);
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
        await AsyncStorage.setItem('current_user', JSON.stringify(this.currentUser));
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
      // TODO: 替换为实际的API调用
      return await this.mockValidateToken(token);
    } catch (error) {
      logger.error('验证token失败:', error);
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