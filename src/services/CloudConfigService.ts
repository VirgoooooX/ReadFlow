import AsyncStorage from '@react-native-async-storage/async-storage';
import { SettingsService } from './SettingsService';

export type CloudMode = 'local' | 'cloud';

export interface CloudAuthState {
  user?: {
    id: string;
    username: string;
    email: string;
    createdAt?: string;
  };
  accessToken?: string;
  refreshToken?: string;
  lastValidatedAt?: number;
}

export interface CloudConfig {
  mode: CloudMode;
  serverUrl: string;
  serverAccessKey?: string;
  auth: CloudAuthState;
}

const STORAGE_KEY = 'cloud_config';

export class CloudConfigService {
  private static instance: CloudConfigService;

  public static getInstance(): CloudConfigService {
    if (!CloudConfigService.instance) {
      CloudConfigService.instance = new CloudConfigService();
    }
    return CloudConfigService.instance;
  }

  public async getConfig(): Promise<CloudConfig> {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<CloudConfig>;
        return this.normalize(parsed);
      } catch {
      }
    }

    const migrated = await this.migrateFromLegacy();
    await this.saveConfig(migrated);
    return migrated;
  }

  public async saveConfig(config: CloudConfig): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.normalize(config)));
  }

  public async updateConfig(updates: Partial<CloudConfig>): Promise<CloudConfig> {
    const current = await this.getConfig();
    const next: CloudConfig = this.normalize({
      ...current,
      ...updates,
      auth: { ...current.auth, ...(updates.auth || {}) },
    });
    await this.saveConfig(next);
    return next;
  }

  public async clearAuth(): Promise<CloudConfig> {
    const current = await this.getConfig();
    const next: CloudConfig = this.normalize({
      ...current,
      auth: {},
    });
    await this.saveConfig(next);
    return next;
  }

  public async clearServer(): Promise<CloudConfig> {
    const current = await this.getConfig();
    const next: CloudConfig = this.normalize({
      ...current,
      mode: 'local',
      serverUrl: '',
      serverAccessKey: undefined,
      auth: {},
    });
    await this.saveConfig(next);
    return next;
  }

  public async setMode(mode: CloudMode): Promise<CloudConfig> {
    return await this.updateConfig({ mode });
  }

  public async setServer(serverUrl: string, serverAccessKey?: string): Promise<CloudConfig> {
    return await this.updateConfig({ serverUrl: serverUrl || '', serverAccessKey: serverAccessKey || undefined });
  }

  public async setAuth(auth: CloudAuthState): Promise<CloudConfig> {
    return await this.updateConfig({ auth });
  }

  public isCloudEnabled(config: CloudConfig): boolean {
    return config.mode === 'cloud' && !!config.serverUrl;
  }

  private normalize(input: Partial<CloudConfig>): CloudConfig {
    return {
      mode: input.mode === 'cloud' ? 'cloud' : 'local',
      serverUrl: typeof input.serverUrl === 'string' ? input.serverUrl : '',
      serverAccessKey: typeof input.serverAccessKey === 'string' && input.serverAccessKey ? input.serverAccessKey : undefined,
      auth: {
        ...(input.auth && typeof input.auth === 'object' ? input.auth : {}),
      },
    };
  }

  private async migrateFromLegacy(): Promise<CloudConfig> {
    const settingsService = SettingsService.getInstance();
    let mode: CloudMode = 'cloud';
    let serverUrl = 'http://localhost:30000/';
    let serverAccessKey: string | undefined = undefined;
    let auth: CloudAuthState = {};

    try {
      const appSettings = await settingsService.getAppSettings();
      if (appSettings?.sync?.mode === 'cloud') {
        mode = 'cloud';
      }
      if (typeof appSettings?.sync?.serverUrl === 'string' && appSettings.sync.serverUrl) {
        serverUrl = appSettings.sync.serverUrl;
      }
    } catch {
    }

    try {
      const token = await AsyncStorage.getItem('auth_token');
      const userStr = await AsyncStorage.getItem('current_user');
      if (token) {
        auth.accessToken = token;
      }
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user && user.id && user.username && user.email) {
          auth.user = {
            id: String(user.id),
            username: String(user.username),
            email: String(user.email),
            createdAt: user.createdAt ? String(user.createdAt) : undefined,
          };
        }
      }
    } catch {
    }

    return this.normalize({ mode, serverUrl, serverAccessKey, auth });
  }
}

export const cloudConfigService = CloudConfigService.getInstance();

