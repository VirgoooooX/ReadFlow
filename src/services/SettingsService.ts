import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReadingSettings, AppSettings, AppError, ProxyModeConfig, ProxyServer, ProxyServersConfig, RSSStartupSettings } from '../types';
import { DatabaseService } from '../database/DatabaseService';
import { logger } from './rss/RSSUtils';
import { cloudConfigService } from './CloudConfigService';
import cacheEventEmitter from './CacheEventEmitter';
import { themeStorageService } from './ThemeStorageService';

type LLMFeature = 'translation' | 'dictionary' | 'titleTranslation' | 'dailyReport';

type LLMProfile = {
  id: string;
  name: string;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  isActive: boolean;
  customModelName: string;
};

type LLMSettingsStoreV2 = {
  version: 2;
  profiles: LLMProfile[];
  bindings: Record<LLMFeature, string>;
  ui?: {
    lastEditedProfileId?: string;
  };
};

export class SettingsService {
  private static instance: SettingsService;
  private databaseService: DatabaseService;
  private cloudSettingsSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private cloudSettingsSyncSuppressDepth: number = 0;
  private static readonly STORAGE_KEYS = {
    READING_SETTINGS: 'reading_settings',
    APP_SETTINGS: 'app_settings',
    USER_PREFERENCES: 'user_preferences',
    RSS_SETTINGS: 'rss_settings',
    LLM_SETTINGS: 'llm_settings',
    THEME_SETTINGS: 'theme_settings',
    PROXY_MODE_CONFIG: 'proxy_mode_config',  // 新增：代理模式配置
    PROXY_SERVERS_CONFIG: 'proxy_servers_config',  // 多代理服务器配置
    RSS_STARTUP_SETTINGS: 'rss_startup_settings', // 新增：RSS启动刷新设置
    DAILY_REPORT_SETTINGS: 'daily_report_settings', // 日报设置
  };

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
  }

  private async withCloudSettingsSyncSuppressed<T>(fn: () => Promise<T>): Promise<T> {
    this.cloudSettingsSyncSuppressDepth += 1;
    try {
      return await fn();
    } finally {
      this.cloudSettingsSyncSuppressDepth = Math.max(0, this.cloudSettingsSyncSuppressDepth - 1);
    }
  }

  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a === null || a === undefined || b === null || b === undefined) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i += 1) {
        if (!this.deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    aKeys.sort();
    bKeys.sort();
    for (let i = 0; i < aKeys.length; i += 1) {
      if (aKeys[i] !== bKeys[i]) return false;
    }
    for (const k of aKeys) {
      if (!this.deepEqual(a[k], b[k])) return false;
    }
    return true;
  }

  private isOnlySyncRuntimeMetaChanged(prev: AppSettings, next: AppSettings): boolean {
    const prevSync = (prev as any)?.sync;
    const nextSync = (next as any)?.sync;
    const { sync: _prevSync, ...prevRest } = prev as any;
    const { sync: _nextSync, ...nextRest } = next as any;
    if (!this.deepEqual(prevRest, nextRest)) return false;
    if (!prevSync || !nextSync) return false;

    const runtimeKeys = new Set([
      'cloudCursors',
      'lastProfilePushAt',
      'lastStateSyncAt',
      'lastVocabSyncAt',
      'userId',
    ]);
    const keys = new Set<string>([...Object.keys(prevSync), ...Object.keys(nextSync)]);
    for (const k of keys) {
      if (runtimeKeys.has(k)) continue;
      if (!this.deepEqual(prevSync[k], nextSync[k])) return false;
    }
    return true;
  }

  public static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  /**
   * 获取阅读设置
   */
  public async getReadingSettings(): Promise<ReadingSettings> {
    try {
      const stored = await AsyncStorage.getItem(SettingsService.STORAGE_KEYS.READING_SETTINGS);

      if (stored) {
        return JSON.parse(stored);
      }

      // 返回默认设置
      return this.getDefaultReadingSettings();
    } catch (error) {
      logger.error('Error getting reading settings:', error);
      return this.getDefaultReadingSettings();
    }
  }

  /**
   * 保存阅读设置
   */
  public async saveReadingSettings(settings: ReadingSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(
        SettingsService.STORAGE_KEYS.READING_SETTINGS,
        JSON.stringify(settings)
      );
      this.scheduleCloudSettingsSync();
    } catch (error) {
      logger.error('Error saving reading settings:', error);
      throw new AppError({
        code: 'SETTINGS_SAVE_ERROR',
        message: 'Failed to save reading settings',
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 获取应用设置
   */
  public async getAppSettings(): Promise<AppSettings> {
    try {
      const stored = await AsyncStorage.getItem(SettingsService.STORAGE_KEYS.APP_SETTINGS);

      if (stored) {
        return JSON.parse(stored);
      }

      // 返回默认设置
      return this.getDefaultAppSettings();
    } catch (error) {
      logger.error('Error getting app settings:', error);
      return this.getDefaultAppSettings();
    }
  }

  /**
   * 保存应用设置
   */
  public async saveAppSettings(settings: AppSettings): Promise<void> {
    try {
      let shouldSchedule = this.cloudSettingsSyncSuppressDepth === 0;
      if (shouldSchedule) {
        try {
          const previous = await this.getAppSettings();
          if (this.isOnlySyncRuntimeMetaChanged(previous, settings)) {
            shouldSchedule = false;
          }
        } catch {
        }
      }

      await AsyncStorage.setItem(
        SettingsService.STORAGE_KEYS.APP_SETTINGS,
        JSON.stringify(settings)
      );
      if (shouldSchedule) {
        this.scheduleCloudSettingsSync();
      }
    } catch (error) {
      logger.error('Error saving app settings:', error);
      throw new AppError({
        code: 'SETTINGS_SAVE_ERROR',
        message: 'Failed to save app settings',
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 更新阅读设置的特定字段
   */
  public async updateReadingSetting<K extends keyof ReadingSettings>(
    key: K,
    value: ReadingSettings[K]
  ): Promise<void> {
    try {
      const currentSettings = await this.getReadingSettings();
      const updatedSettings = {
        ...currentSettings,
        [key]: value,
      };

      await this.saveReadingSettings(updatedSettings);
    } catch (error) {
      logger.error('Error updating reading setting:', error);
      throw new AppError({
        code: 'SETTINGS_UPDATE_ERROR',
        message: `Failed to update reading setting: ${String(key)}`,
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 更新应用设置的特定字段
   */
  public async updateAppSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ): Promise<void> {
    try {
      const currentSettings = await this.getAppSettings();
      const updatedSettings = {
        ...currentSettings,
        [key]: value,
      };

      await this.saveAppSettings(updatedSettings);
    } catch (error) {
      logger.error('Error updating app setting:', error);
      throw new AppError({
        code: 'SETTINGS_UPDATE_ERROR',
        message: `Failed to update app setting: ${String(key)}`,
        details: error,
        timestamp: new Date(),
      });
    }
  }

  public async updateAppSettingNoCloudSync<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ): Promise<void> {
    await this.withCloudSettingsSyncSuppressed(async () => {
      await this.updateAppSetting(key, value);
    });
  }

  public async saveAppSettingsNoCloudSync(settings: AppSettings): Promise<void> {
    await this.withCloudSettingsSyncSuppressed(async () => {
      await this.saveAppSettings(settings);
    });
  }

  public async saveReadingSettingsNoCloudSync(settings: ReadingSettings): Promise<void> {
    await this.withCloudSettingsSyncSuppressed(async () => {
      await this.saveReadingSettings(settings);
    });
  }

  private scheduleCloudSettingsSync(): void {
    if (this.cloudSettingsSyncSuppressDepth > 0) {
      return;
    }
    if (this.cloudSettingsSyncTimer) {
      clearTimeout(this.cloudSettingsSyncTimer);
    }
    this.cloudSettingsSyncTimer = setTimeout(() => {
      this.cloudSettingsSyncTimer = null;
      this.pushCloudSettingsToServer().catch(() => {
      });
    }, 1500);
  }

  private async pushCloudSettingsToServer(): Promise<void> {
    try {
      const { configSyncService } = require('./ConfigSyncService');
      await configSyncService.syncConfig('push');
    } catch (error) {
      logger.warn('Failed to auto-push settings:', error);
    }
  }

  /**
   * 重置阅读设置为默认值
   */
  public async resetReadingSettings(): Promise<void> {
    try {
      const defaultSettings = this.getDefaultReadingSettings();
      await this.saveReadingSettings(defaultSettings);
    } catch (error) {
      logger.error('Error resetting reading settings:', error);
      throw new AppError({
        code: 'SETTINGS_RESET_ERROR',
        message: 'Failed to reset reading settings',
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 重置应用设置为默认值
   */
  public async resetAppSettings(): Promise<void> {
    try {
      const defaultSettings = this.getDefaultAppSettings();
      await this.saveAppSettings(defaultSettings);
    } catch (error) {
      logger.error('Error resetting app settings:', error);
      throw new AppError({
        code: 'SETTINGS_RESET_ERROR',
        message: 'Failed to reset app settings',
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 获取RSS设置
   */
  public async getRSSSettings(): Promise<any> {
    try {
      const userPreferences = await this.databaseService.getUserPreferences();
      if (userPreferences) {
        return {
          enableTitleTranslation: userPreferences.enableTitleTranslation,
          translationProvider: userPreferences.translationProvider,
          maxConcurrentTranslations: userPreferences.maxConcurrentTranslations,
          translationTimeout: userPreferences.translationTimeout,
        };
      }
      return this.getDefaultRSSSettings();
    } catch (error) {
      logger.error('Error getting RSS settings:', error);
      return this.getDefaultRSSSettings();
    }
  }

  /**
   * 保存RSS设置
   */
  public async saveRSSSettings(settings: any): Promise<void> {
    try {
      await this.databaseService.saveUserPreferences({
        enableTitleTranslation: settings.enableTitleTranslation,
        translationProvider: settings.translationProvider,
        maxConcurrentTranslations: settings.maxConcurrentTranslations,
        translationTimeout: settings.translationTimeout,
      });
    } catch (error) {
      logger.error('Error saving RSS settings:', error);
      throw new AppError({
        code: 'SETTINGS_SAVE_ERROR',
        message: 'Failed to save RSS settings',
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 更新RSS设置
   */
  public async updateRSSSettings(settings: any): Promise<void> {
    return this.saveRSSSettings(settings);
  }

  /**
   * 获取LLM设置
   */
  public async getLLMSettings(): Promise<any> {
    try {
      const store = await this.getLLMSettingsStore();
      const profileId = store.bindings.translation;
      return store.profiles.find(p => p.id === profileId) || store.profiles[0];
    } catch (error) {
      logger.error('Error getting LLM settings:', error);
      return this.getDefaultLLMSettings();
    }
  }

  /**
   * 保存LLM设置
   */
  public async saveLLMSettings(settings: any): Promise<void> {
    try {
      const storageKey = SettingsService.STORAGE_KEYS.LLM_SETTINGS;

      const isV2Store =
        settings &&
        typeof settings === 'object' &&
        settings.version === 2 &&
        Array.isArray(settings.profiles);

      if (isV2Store) {
        const store = this.normalizeLLMSettingsStore(settings);
        await AsyncStorage.setItem(storageKey, JSON.stringify(store));
        cacheEventEmitter.settingsUpdated('llmSettings');
        this.scheduleCloudSettingsSync();
        return;
      }

      const store = await this.getLLMSettingsStore();
      const boundId = store.bindings.translation || store.profiles[0]?.id;
      const index = boundId ? store.profiles.findIndex(p => p.id === boundId) : -1;
      const existing = index >= 0 ? store.profiles[index] : store.profiles[0];

      if (!existing) {
        const nextStore = this.normalizeLLMSettingsStore(settings);
        await AsyncStorage.setItem(storageKey, JSON.stringify(nextStore));
        cacheEventEmitter.settingsUpdated('llmSettings');
        this.scheduleCloudSettingsSync();
        return;
      }

      const nextProfile: LLMProfile = {
        ...existing,
        ...(settings && typeof settings === 'object' ? settings : {}),
        id: existing.id,
        name: existing.name,
      };

      if (index >= 0) {
        store.profiles[index] = nextProfile;
      } else {
        store.profiles[0] = nextProfile;
      }

      store.ui = { ...(store.ui || {}), lastEditedProfileId: nextProfile.id };

      const normalizedStore = this.normalizeLLMSettingsStore(store);
      await AsyncStorage.setItem(storageKey, JSON.stringify(normalizedStore));
      cacheEventEmitter.settingsUpdated('llmSettings');
      this.scheduleCloudSettingsSync();
    } catch (error) {
      logger.error('Error saving LLM settings:', error);
      throw new AppError({
        code: 'SETTINGS_SAVE_ERROR',
        message: 'Failed to save LLM settings',
        details: error,
        timestamp: new Date(),
      });
    }
  }

  public async saveLLMSettingsNoCloudSync(settings: any): Promise<void> {
    await this.withCloudSettingsSyncSuppressed(async () => {
      await this.saveLLMSettings(settings);
    });
  }

  public async getLLMSettingsStore(): Promise<LLMSettingsStoreV2> {
    const storageKey = SettingsService.STORAGE_KEYS.LLM_SETTINGS;
    let raw: any = null;
    try {
      const stored = await AsyncStorage.getItem(storageKey);
      raw = stored ? JSON.parse(stored) : null;
    } catch (error) {
      logger.error('Error reading LLM settings store:', error);
    }

    const store = this.normalizeLLMSettingsStore(raw);

    const shouldWriteBack = !raw || raw?.version !== 2 || !this.deepEqual(store, raw);
    if (shouldWriteBack) {
      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(store));
        this.scheduleCloudSettingsSync();
      } catch (error) {
        logger.error('Error writing migrated LLM settings store:', error);
      }
    }

    return store;
  }

  public async getLLMSettingsFor(feature: LLMFeature): Promise<LLMProfile> {
    const store = await this.getLLMSettingsStore();
    const profileId = store.bindings[feature];
    return store.profiles.find(p => p.id === profileId) || store.profiles[0];
  }

  public async listLLMProfiles(): Promise<LLMProfile[]> {
    const store = await this.getLLMSettingsStore();
    return store.profiles;
  }

  public async upsertLLMProfile(profile: LLMProfile): Promise<void> {
    const store = await this.getLLMSettingsStore();
    const existingIndex = store.profiles.findIndex(p => p.id === profile.id);
    if (existingIndex >= 0) {
      store.profiles[existingIndex] = profile;
    } else {
      store.profiles.push(profile);
    }
    store.ui = { ...(store.ui || {}), lastEditedProfileId: profile.id };
    await this.saveLLMSettings(store);
  }

  public async deleteLLMProfile(profileId: string): Promise<void> {
    const store = await this.getLLMSettingsStore();
    if (store.profiles.length <= 1) return;

    store.profiles = store.profiles.filter(p => p.id !== profileId);
    const fallbackId = store.profiles[0]?.id;
    if (!fallbackId) return;

    const nextBindings: Record<LLMFeature, string> = { ...store.bindings };
    (Object.keys(nextBindings) as LLMFeature[]).forEach((feature) => {
      if (nextBindings[feature] === profileId) nextBindings[feature] = fallbackId;
    });
    store.bindings = nextBindings;

    if (store.ui?.lastEditedProfileId === profileId) {
      store.ui = { ...(store.ui || {}), lastEditedProfileId: fallbackId };
    }

    await this.saveLLMSettings(store);
  }

  public async setLLMBinding(feature: LLMFeature, profileId: string): Promise<void> {
    const store = await this.getLLMSettingsStore();
    const exists = store.profiles.some(p => p.id === profileId);
    const effectiveId = exists ? profileId : store.profiles[0]?.id;
    if (!effectiveId) return;

    store.bindings = { ...store.bindings, [feature]: effectiveId };
    await this.saveLLMSettings(store);
  }

  public async setLLMLastEditedProfileId(profileId: string): Promise<void> {
    const store = await this.getLLMSettingsStore();
    const exists = store.profiles.some(p => p.id === profileId);
    if (!exists) return;
    store.ui = { ...(store.ui || {}), lastEditedProfileId: profileId };
    await this.saveLLMSettings(store);
  }

  /**
   * 获取主题设置
   */
  public async getThemeSettings(): Promise<any> {
    try {
      const stored = await AsyncStorage.getItem(SettingsService.STORAGE_KEYS.THEME_SETTINGS);
      if (stored) {
        return JSON.parse(stored);
      }
      return this.getDefaultThemeSettings();
    } catch (error) {
      logger.error('Error getting theme settings:', error);
      return this.getDefaultThemeSettings();
    }
  }

  /**
   * 保存主题设置
   */
  public async saveThemeSettings(settings: any): Promise<void> {
    try {
      await AsyncStorage.setItem(
        SettingsService.STORAGE_KEYS.THEME_SETTINGS,
        JSON.stringify(settings)
      );
    } catch (error) {
      logger.error('Error saving theme settings:', error);
      throw new AppError({
        code: 'SETTINGS_SAVE_ERROR',
        message: 'Failed to save theme settings',
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 导出所有设置
   */
  public async exportSettings(): Promise<{
    readingSettings: ReadingSettings;
    appSettings: AppSettings;
    rssSettings: any;
    llmSettings: any;
    themeSettings: any;
    rssStartupSettings: any;
    proxyServersConfig: any;
    dailyReportSettings: any;
    exportedAt: string;
  }> {
    try {
      const [readingSettings, appSettings, rssSettings, llmSettings, themeSettings, rssStartupSettings, proxyServersConfig, dailyReportSettings] = await Promise.all([
        this.getReadingSettings(),
        this.getAppSettings(),
        this.getRSSSettings(),
        this.getLLMSettingsStore(),
        themeStorageService.getThemeSettings(),
        this.getRSSStartupSettings(),
        this.getProxyServersConfig(),
        this.getDailyReportSettings(),
      ]);

      return {
        readingSettings,
        appSettings,
        rssSettings,
        llmSettings,
        themeSettings,
        rssStartupSettings,
        proxyServersConfig,
        dailyReportSettings,
        exportedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error exporting settings:', error);
      throw new AppError({
        code: 'SETTINGS_EXPORT_ERROR',
        message: 'Failed to export settings',
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 获取日报设置
   */
  public async getDailyReportSettings(): Promise<{
    enabled: boolean;
    schedule: string;
    groupNames: string[];
    articleLimit: number;
  }> {
    try {
      const stored = await AsyncStorage.getItem(SettingsService.STORAGE_KEYS.DAILY_REPORT_SETTINGS);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Migration: If schedule is missing but intervalHours exists, map it best effort or default
        // Actually, easiest is just default to '0 6,18 * * *' if missing
        let schedule = typeof parsed.schedule === 'string' ? parsed.schedule : '0 6,18 * * *';

        return {
          enabled: parsed.enabled !== false,
          schedule,
          groupNames: Array.isArray(parsed.groupNames) ? parsed.groupNames : [],
          articleLimit: typeof parsed.articleLimit === 'number' ? parsed.articleLimit : 0,
        };
      }
    } catch (error) {
      logger.error('Error reading daily report settings:', error);
    }
    return { enabled: true, schedule: '0 6,18 * * *', groupNames: [], articleLimit: 0 };
  }

  /**
   * 保存日报设置
   */
  public async saveDailyReportSettings(settings: {
    enabled?: boolean;
    schedule?: string;
    groupNames?: string[];
    articleLimit?: number;
  }): Promise<void> {
    try {
      const current = await this.getDailyReportSettings();
      const updated = { ...current, ...settings };
      await AsyncStorage.setItem(
        SettingsService.STORAGE_KEYS.DAILY_REPORT_SETTINGS,
        JSON.stringify(updated)
      );
      cacheEventEmitter.settingsUpdated('dailyReportSettings');
      this.scheduleCloudSettingsSync();
    } catch (error) {
      logger.error('Error saving daily report settings:', error);
    }
  }

  /**
   * 获取默认RSS设置
   */
  private getDefaultRSSSettings(): any {
    return {
      enableTitleTranslation: false,
      translationProvider: 'llm',
    };
  }

  /**
   * 获取默认LLM设置
   */
  private getDefaultLLMSettings(): any {
    return {
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1.0,
      isActive: true,
      customModelName: '',
    };
  }

  private normalizeLLMSettingsStore(raw: any): LLMSettingsStoreV2 {
    const base = this.getDefaultLLMSettings();
    const defaultProfile: LLMProfile = {
      id: 'default',
      name: '默认',
      ...base,
    };

    const createProfileFromRaw = (value: any, index: number): LLMProfile => {
      const id = typeof value?.id === 'string' && value.id.trim() ? value.id : `profile_${Date.now()}_${index}`;
      const name = typeof value?.name === 'string' && value.name.trim() ? value.name : `档案${index + 1}`;
      return {
        id,
        name,
        provider: value?.provider ?? base.provider,
        model: value?.model ?? base.model,
        apiKey: value?.apiKey ?? base.apiKey,
        baseUrl: value?.baseUrl ?? base.baseUrl,
        temperature: typeof value?.temperature === 'number' ? value.temperature : base.temperature,
        maxTokens: typeof value?.maxTokens === 'number' ? value.maxTokens : base.maxTokens,
        topP: typeof value?.topP === 'number' ? value.topP : base.topP,
        isActive: typeof value?.isActive === 'boolean' ? value.isActive : base.isActive,
        customModelName: value?.customModelName ?? base.customModelName,
      };
    };

    const isV2 = raw && typeof raw === 'object' && raw.version === 2 && Array.isArray(raw.profiles);

    let profiles: LLMProfile[] = [];
    let bindings: Record<LLMFeature, string> = {
      translation: defaultProfile.id,
      dictionary: defaultProfile.id,
      titleTranslation: defaultProfile.id,
      dailyReport: defaultProfile.id,
    };
    let ui: LLMSettingsStoreV2['ui'] = { lastEditedProfileId: defaultProfile.id };

    if (isV2) {
      profiles = raw.profiles.map((p: any, idx: number) => createProfileFromRaw(p, idx));
      const rawBindings = raw.bindings || {};
      bindings = {
        translation: rawBindings.translation,
        dictionary: rawBindings.dictionary,
        titleTranslation: rawBindings.titleTranslation,
        dailyReport: rawBindings.dailyReport,
      } as any;
      ui = raw.ui || ui;
    } else if (raw && typeof raw === 'object' && typeof raw.provider === 'string') {
      profiles = [
        {
          id: defaultProfile.id,
          name: defaultProfile.name,
          provider: raw.provider ?? base.provider,
          model: raw.model ?? base.model,
          apiKey: raw.apiKey ?? base.apiKey,
          baseUrl: raw.baseUrl ?? base.baseUrl,
          temperature: typeof raw.temperature === 'number' ? raw.temperature : base.temperature,
          maxTokens: typeof raw.maxTokens === 'number' ? raw.maxTokens : base.maxTokens,
          topP: typeof raw.topP === 'number' ? raw.topP : base.topP,
          isActive: typeof raw.isActive === 'boolean' ? raw.isActive : base.isActive,
          customModelName: raw.customModelName ?? base.customModelName,
        },
      ];
    } else {
      profiles = [defaultProfile];
    }

    if (profiles.length === 0) profiles = [defaultProfile];

    const existingIds = new Set(profiles.map(p => p.id));
    const firstId = profiles[0].id;

    const ensureBinding = (value: any) => (typeof value === 'string' && existingIds.has(value) ? value : firstId);
    bindings = {
      translation: ensureBinding(bindings.translation),
      dictionary: ensureBinding(bindings.dictionary),
      titleTranslation: ensureBinding(bindings.titleTranslation),
      dailyReport: ensureBinding(bindings.dailyReport),
    };

    const lastEdited = typeof ui?.lastEditedProfileId === 'string' ? ui.lastEditedProfileId : firstId;
    ui = { ...(ui || {}), lastEditedProfileId: existingIds.has(lastEdited) ? lastEdited : firstId };

    return {
      version: 2,
      profiles,
      bindings,
      ui,
    };
  }

  /**
   * 获取默认主题设置
   */
  private getDefaultThemeSettings(): any {
    return {
      themeMode: 'system',
      currentPreset: 'default',
      customConfig: null,
      autoNightMode: false,
      nightModeStartTime: '22:00',
      nightModeEndTime: '06:00',
    };
  }

  /**
   * 导入设置
   */
  public async importSettings(data: {
    readingSettings?: ReadingSettings;
    appSettings?: AppSettings;
    rssSettings?: any;
    llmSettings?: any;
    themeSettings?: any;
    rssStartupSettings?: any;
    proxyServersConfig?: any;
  }): Promise<void> {
    try {
      await this.withCloudSettingsSyncSuppressed(async () => {
        if (data.readingSettings) {
          await this.saveReadingSettings(data.readingSettings);
        }

        if (data.appSettings) {
          await this.saveAppSettings(data.appSettings);
        }
      });

      if (data.rssSettings) {
        await this.saveRSSSettings(data.rssSettings);
      }

      if (data.llmSettings) {
        await this.saveLLMSettings(data.llmSettings);
      }

      if (data.themeSettings) {
        const raw = data.themeSettings;
        const mode = raw?.mode || raw?.themeMode || 'system';
        const preset = raw?.preset || raw?.currentPreset || 'default';
        const customColors = raw?.customColors || raw?.customConfig || undefined;
        await themeStorageService.setThemeSettings({ mode, preset, customColors });
      }

      if (data.rssStartupSettings) {
        await this.saveRSSStartupSettings(data.rssStartupSettings);
      }

      if (data.proxyServersConfig) {
        await this.saveProxyServersConfig(data.proxyServersConfig);
      }
      cacheEventEmitter.settingsUpdated('settingsImport');
    } catch (error) {
      logger.error('Error importing settings:', error);
      throw new AppError({
        code: 'SETTINGS_IMPORT_ERROR',
        message: 'Failed to import settings',
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 清除所有设置
   */
  public async clearAllSettings(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(SettingsService.STORAGE_KEYS.READING_SETTINGS),
        AsyncStorage.removeItem(SettingsService.STORAGE_KEYS.APP_SETTINGS),
        AsyncStorage.removeItem(SettingsService.STORAGE_KEYS.USER_PREFERENCES),
      ]);
    } catch (error) {
      logger.error('Error clearing settings:', error);
      throw new AppError({
        code: 'SETTINGS_CLEAR_ERROR',
        message: 'Failed to clear settings',
        details: error,
        timestamp: new Date(),
      });
    }
  }

  public async clearCache(): Promise<void> {
    try {
      await this.databaseService.initializeDatabase();
      await Promise.all([
        this.databaseService.executeStatement('DELETE FROM dictionary_cache').catch(() => { }),
        this.databaseService.executeStatement('DELETE FROM translation_cache').catch(() => { }),
      ]);
      cacheEventEmitter.clearAll();
    } catch (error) {
      logger.error('Error clearing cache:', error);
      throw new AppError({
        code: 'CACHE_CLEAR_ERROR',
        message: 'Failed to clear cache',
        details: error,
        timestamp: new Date(),
      });
    }
  }

  public async clearReadingHistory(): Promise<void> {
    try {
      await this.databaseService.initializeDatabase();
      await this.databaseService.executeStatement(
        'UPDATE articles SET is_read = 0, read_progress = 0, read_at = NULL'
      );
      cacheEventEmitter.clearArticles();
      cacheEventEmitter.updateRSSStats();
    } catch (error) {
      logger.error('Error clearing reading history:', error);
      throw new AppError({
        code: 'READING_HISTORY_CLEAR_ERROR',
        message: 'Failed to clear reading history',
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 获取用户偏好设置
   */
  public async getUserPreference<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const stored = await AsyncStorage.getItem(SettingsService.STORAGE_KEYS.USER_PREFERENCES);

      if (stored) {
        const preferences = JSON.parse(stored);
        return preferences[key] !== undefined ? preferences[key] : defaultValue;
      }

      return defaultValue;
    } catch (error) {
      logger.error('Error getting user preference:', error);
      return defaultValue;
    }
  }

  /**
   * 设置用户偏好
   */
  public async setUserPreference<T>(key: string, value: T): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(SettingsService.STORAGE_KEYS.USER_PREFERENCES);
      const preferences = stored ? JSON.parse(stored) : {};

      preferences[key] = value;

      await AsyncStorage.setItem(
        SettingsService.STORAGE_KEYS.USER_PREFERENCES,
        JSON.stringify(preferences)
      );
    } catch (error) {
      logger.error('Error setting user preference:', error);
      throw new AppError({
        code: 'SETTINGS_UPDATE_ERROR',
        message: `Failed to set user preference: ${key}`,
        details: error,
        timestamp: new Date(),
      });
    }
  }

  public async removeUserPreference(key: string): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(SettingsService.STORAGE_KEYS.USER_PREFERENCES);
      if (!stored) {
        return;
      }

      const preferences = JSON.parse(stored);
      if (preferences && typeof preferences === 'object') {
        delete preferences[key];
      }

      await AsyncStorage.setItem(
        SettingsService.STORAGE_KEYS.USER_PREFERENCES,
        JSON.stringify(preferences)
      );
    } catch (error) {
      logger.error('Error removing user preference:', error);
      throw new AppError({
        code: 'SETTINGS_UPDATE_ERROR',
        message: `Failed to remove user preference: ${key}`,
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 获取存储使用情况
   */
  public async getStorageUsage(): Promise<{
    readingSettings: number;
    appSettings: number;
    userPreferences: number;
    total: number;
  }> {
    try {
      const [readingSettings, appSettings, userPreferences] = await Promise.all([
        AsyncStorage.getItem(SettingsService.STORAGE_KEYS.READING_SETTINGS),
        AsyncStorage.getItem(SettingsService.STORAGE_KEYS.APP_SETTINGS),
        AsyncStorage.getItem(SettingsService.STORAGE_KEYS.USER_PREFERENCES),
      ]);

      const readingSize = readingSettings ? new Blob([readingSettings]).size : 0;
      const appSize = appSettings ? new Blob([appSettings]).size : 0;
      const preferencesSize = userPreferences ? new Blob([userPreferences]).size : 0;

      return {
        readingSettings: readingSize,
        appSettings: appSize,
        userPreferences: preferencesSize,
        total: readingSize + appSize + preferencesSize,
      };
    } catch (error) {
      logger.error('Error getting storage usage:', error);
      return {
        readingSettings: 0,
        appSettings: 0,
        userPreferences: 0,
        total: 0,
      };
    }
  }

  // 私有方法

  private getDefaultReadingSettings(): ReadingSettings {
    return {
      fontSize: 16,
      fontFamily: 'System',
      lineHeight: 1.5,
      theme: 'light',
      backgroundColor: '#FFFFFF',
      textColor: '#000000',
      highlightColor: '#FFEB3B',
      margin: 16,
      autoScroll: false,
      scrollSpeed: 1,
      showTranslation: true,
      translationPosition: 'bottom',
      enableTTS: false,
      ttsSpeed: 1,
      ttsVoice: 'default',
      wordClickAction: 'translate',
      showProgress: true,
      nightMode: false,
      sepia: false,
      brightness: 1,
      showAllTab: true,
      autoRefreshInterval: 10, // 默认10分钟自动刷新
      autoMarkReadOnScroll: false, // 默认关闭滚动自动标记已读
    };
  }

  private getDefaultAppSettings(): AppSettings {
    return {
      language: 'en',
      theme: 'light',
      notifications: {
        enabled: true,
        newArticles: true,
        vocabularyReview: true,
        dailyGoal: true,
        sound: true,
        vibration: true,
      },
      sync: {
        enabled: false,
        autoSync: false,
        syncInterval: 3600,
        wifiOnly: true,
        mode: 'local',
        serverUrl: '',
        cloudCursors: {},
        userId: '',
        lastProfilePushAt: 0,
        lastStateSyncAt: 0,
      },
      privacy: {
        analytics: false,
        crashReporting: true,
        dataCollection: false,
      },
      performance: {
        cacheSize: 100,
        preloadImages: true,
        offlineMode: true,
        backgroundSync: false,
      },
      accessibility: {
        highContrast: false,
        largeText: false,
        reduceMotion: false,
        screenReader: false,
      },
      backup: {
        autoBackup: false,
        backupInterval: 86400,
        includeImages: false,
        cloudProvider: 'none',
      },
    };
  }

  /**
   * 验证设置对象的有效性
   */
  public validateReadingSettings(settings: Partial<ReadingSettings>): boolean {
    try {
      // 验证字体大小
      if (settings.fontSize !== undefined) {
        if (typeof settings.fontSize !== 'number' || settings.fontSize < 10 || settings.fontSize > 30) {
          return false;
        }
      }

      // 验证行高
      if (settings.lineHeight !== undefined) {
        if (typeof settings.lineHeight !== 'number' || settings.lineHeight < 1 || settings.lineHeight > 3) {
          return false;
        }
      }

      // 验证主题
      if (settings.theme !== undefined) {
        if (!['light', 'dark', 'sepia'].includes(settings.theme)) {
          return false;
        }
      }

      // 验证颜色格式
      const colorFields = ['backgroundColor', 'textColor', 'highlightColor'];
      for (const field of colorFields) {
        if (settings[field as keyof ReadingSettings] !== undefined) {
          const color = settings[field as keyof ReadingSettings] as string;
          if (!/^#[0-9A-F]{6}$/i.test(color)) {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      logger.error('Error validating reading settings:', error);
      return false;
    }
  }

  /**
   * 获取当前主题状态 (组合 ReadingSettings 和 AppSettings)
   */
  public async getCurrentThemeState(): Promise<{
    theme: string;
    backgroundColor: string;
    textColor: string;
    nightMode: boolean;
    sepia: boolean;
  }> {
    try {
      const readingSettings = await this.getReadingSettings();
      const appSettings = await this.getAppSettings();

      return {
        theme: appSettings.theme,
        backgroundColor: readingSettings.backgroundColor,
        textColor: readingSettings.textColor,
        nightMode: readingSettings.nightMode,
        sepia: readingSettings.sepia,
      };
    } catch (error) {
      logger.error('Error getting theme settings:', error);
      return {
        theme: 'light',
        backgroundColor: '#FFFFFF',
        textColor: '#000000',
        nightMode: false,
        sepia: false,
      };
    }
  }

  /**
   * 应用预设主题
   */
  public async applyThemePreset(preset: 'light' | 'dark' | 'sepia'): Promise<void> {
    try {
      const currentSettings = await this.getReadingSettings();
      let updatedSettings: ReadingSettings;

      switch (preset) {
        case 'light':
          updatedSettings = {
            ...currentSettings,
            theme: 'light',
            backgroundColor: '#FFFFFF',
            textColor: '#000000',
            nightMode: false,
            sepia: false,
          };
          break;
        case 'dark':
          updatedSettings = {
            ...currentSettings,
            theme: 'dark',
            backgroundColor: '#000000',
            textColor: '#FFFFFF',
            nightMode: true,
            sepia: false,
          };
          break;
        case 'sepia':
          updatedSettings = {
            ...currentSettings,
            theme: 'sepia',
            backgroundColor: '#F4F1EA',
            textColor: '#5D4037',
            nightMode: false,
            sepia: true,
          };
          break;
        default:
          return;
      }

      await this.saveReadingSettings(updatedSettings);
      await this.updateAppSetting('theme', preset);
    } catch (error) {
      logger.error('Error applying theme preset:', error);
      throw new AppError({
        code: 'SETTINGS_UPDATE_ERROR',
        message: `Failed to apply theme preset: ${preset}`,
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 获取RSS启动刷新设置
   */
  public async getRSSStartupSettings(): Promise<RSSStartupSettings> {
    try {
      const stored = await AsyncStorage.getItem(SettingsService.STORAGE_KEYS.RSS_STARTUP_SETTINGS);
      if (stored) {
        return JSON.parse(stored);
      }
      return this.getDefaultRSSStartupSettings();
    } catch (error) {
      logger.error('Error getting RSS startup settings:', error);
      return this.getDefaultRSSStartupSettings();
    }
  }

  /**
   * 保存RSS启动刷新设置
   */
  public async saveRSSStartupSettings(settings: RSSStartupSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(
        SettingsService.STORAGE_KEYS.RSS_STARTUP_SETTINGS,
        JSON.stringify(settings)
      );
    } catch (error) {
      logger.error('Error saving RSS startup settings:', error);
      throw new AppError({
        code: 'SETTINGS_SAVE_ERROR',
        message: 'Failed to save RSS startup settings',
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 获取默认RSS启动刷新设置
   */
  private getDefaultRSSStartupSettings(): RSSStartupSettings {
    return {
      enabled: false,
      sourceIds: [],
    };
  }

  /**
   * 获取代理模式配置
   */
  public async getProxyModeConfig(): Promise<ProxyModeConfig> {
    try {
      const configStr = await AsyncStorage.getItem(SettingsService.STORAGE_KEYS.PROXY_MODE_CONFIG);
      if (!configStr) {
        try {
          const appSettings = await this.getAppSettings();
          const url = appSettings?.sync?.serverUrl ?? '';
          if (url) {
            return {
              enabled: appSettings?.sync?.mode === 'cloud',
              serverUrl: url,
              serverPassword: '',
              serverToken: '',
            };
          }
        } catch {
        }

        return {
          enabled: false,
          serverUrl: '',
          serverPassword: '',
          serverToken: '',
        };
      }
      const raw = JSON.parse(configStr) as any;
      const serverPassword = raw?.serverPassword ?? '';
      const serverToken = raw?.serverToken ?? raw?.serverAccessKey ?? (raw?.serverPassword ?? '');

      return {
        enabled: !!raw?.enabled,
        serverUrl: raw?.serverUrl ?? '',
        serverPassword,
        serverToken,
        token: raw?.token,
        userId: raw?.userId,
        lastSyncTime: raw?.lastSyncTime,
      };
    } catch (error) {
      logger.error('Error getting proxy mode config:', error);
      return {
        enabled: false,
        serverUrl: '',
        serverPassword: '',
        serverToken: ''
      };
    }
  }

  /**
   * 保存代理模式配置
   */
  public async saveProxyModeConfig(config: ProxyModeConfig): Promise<void> {
    try {
      await AsyncStorage.setItem(
        SettingsService.STORAGE_KEYS.PROXY_MODE_CONFIG,
        JSON.stringify(config)
      );
    } catch (error) {
      logger.error('Error saving proxy mode config:', error);
      throw new AppError({
        code: 'SETTINGS_SAVE_ERROR',
        message: 'Failed to save proxy mode config',
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 批量添加订阅源到代理服务器
   */
  public async syncSubscriptionsToProxy(
    sources: any[],
    config: ProxyModeConfig
  ): Promise<{ success: number; failed: number }> {
    if (!config.token) {
      throw new Error('未登录代理服务器');
    }

    let successCount = 0;
    let failedCount = 0;

    logger.info(`[SyncSubscriptions] 开始同步 ${sources.length} 个订阅源...`);

    for (const source of sources) {
      try {
        const response = await fetch(`${config.serverUrl}/api/subscribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.token}`,
          },
          body: JSON.stringify({
            url: source.url,
            title: source.name || source.title,
          }),
          timeout: 10000,
        } as any);

        const data = await response.json();
        if (data.success) {
          successCount++;
          logger.info(`[SyncSubscriptions] ✅ ${source.name}: 成功`);
        } else {
          failedCount++;
          logger.warn(`[SyncSubscriptions] ⚠️ ${source.name}: ${data.message || '失败'}`);
        }
      } catch (error) {
        failedCount++;
        logger.error(`[SyncSubscriptions] ❗ ${source.name}:`, error);
      }
    }

    logger.info(`[SyncSubscriptions] 完成: 成功 ${successCount}, 失败 ${failedCount}`);
    return { success: successCount, failed: failedCount };
  }

  /**
   * 测试代理服务器 connection
   */
  public async testProxyServerConnection(serverUrl: string): Promise<boolean> {
    try {
      const response = await fetch(`${serverUrl}/health`, {
        method: 'GET',
        timeout: 5000,
      } as any);
      return response.ok;
    } catch (error) {
      logger.error('Error testing proxy server connection:', error);
      return false;
    }
  }

  // ==================== 多代理服务器管理 ====================

  /**
   * 获取多代理服务器配置
   */
  public async getProxyServersConfig(): Promise<ProxyServersConfig> {
    try {
      const configStr = await AsyncStorage.getItem(SettingsService.STORAGE_KEYS.PROXY_SERVERS_CONFIG);
      if (configStr) {
        return JSON.parse(configStr);
      }

      // 迁移旧版本配置
      const oldConfig = await this.getProxyModeConfig();
      if (oldConfig.serverUrl) {
        const migratedServer: ProxyServer = {
          id: this.generateServerId(),
          name: '默认服务器',
          serverUrl: oldConfig.serverUrl,
          token: oldConfig.token,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const newConfig: ProxyServersConfig = {
          servers: [migratedServer],
          activeServerId: oldConfig.enabled ? migratedServer.id : null,
        };
        await this.saveProxyServersConfig(newConfig);
        return newConfig;
      }

      return { servers: [], activeServerId: null };
    } catch (error) {
      logger.error('Error getting proxy servers config:', error);
      return { servers: [], activeServerId: null };
    }
  }

  /**
   * 保存多代理服务器配置
   */
  public async saveProxyServersConfig(config: ProxyServersConfig): Promise<void> {
    try {
      await AsyncStorage.setItem(
        SettingsService.STORAGE_KEYS.PROXY_SERVERS_CONFIG,
        JSON.stringify(config)
      );

      // 同步到旧版配置以保持兼容性
      const activeServer = config.servers.find(s => s.id === config.activeServerId);
      if (activeServer) {
        await this.saveProxyModeConfig({
          enabled: true,
          serverUrl: activeServer.serverUrl,
          serverPassword: '',
          token: activeServer.token,
        });
      } else {
        await this.saveProxyModeConfig({
          enabled: false,
          serverUrl: '',
          serverPassword: '',
        });
      }
    } catch (error) {
      logger.error('Error saving proxy servers config:', error);
      throw new AppError({
        code: 'SETTINGS_SAVE_ERROR',
        message: 'Failed to save proxy servers config',
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 添加代理服务器
   */
  public async addProxyServer(server: Omit<ProxyServer, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProxyServer> {
    const config = await this.getProxyServersConfig();
    const now = new Date().toISOString();
    const newServer: ProxyServer = {
      ...server,
      id: this.generateServerId(),
      createdAt: now,
      updatedAt: now,
    };
    config.servers.push(newServer);
    await this.saveProxyServersConfig(config);
    return newServer;
  }

  /**
   * 更新代理服务器
   */
  public async updateProxyServer(serverId: string, updates: Partial<Omit<ProxyServer, 'id' | 'createdAt'>>): Promise<void> {
    const config = await this.getProxyServersConfig();
    const serverIndex = config.servers.findIndex(s => s.id === serverId);
    if (serverIndex === -1) {
      throw new AppError({
        code: 'SERVER_NOT_FOUND',
        message: `Server with id ${serverId} not found`,
        timestamp: new Date(),
      });
    }
    config.servers[serverIndex] = {
      ...config.servers[serverIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await this.saveProxyServersConfig(config);
  }

  /**
   * 删除代理服务器
   */
  public async deleteProxyServer(serverId: string): Promise<void> {
    const config = await this.getProxyServersConfig();
    config.servers = config.servers.filter(s => s.id !== serverId);
    if (config.activeServerId === serverId) {
      config.activeServerId = null;
    }
    await this.saveProxyServersConfig(config);
  }

  /**
   * 设置激活的代理服务器
   */
  public async setActiveProxyServer(serverId: string | null): Promise<void> {
    const config = await this.getProxyServersConfig();
    if (serverId && !config.servers.find(s => s.id === serverId)) {
      throw new AppError({
        code: 'SERVER_NOT_FOUND',
        message: `Server with id ${serverId} not found`,
        timestamp: new Date(),
      });
    }
    config.activeServerId = serverId;
    await this.saveProxyServersConfig(config);
  }

  /**
   * 获取当前激活的代理服务器
   */
  public async getActiveProxyServer(): Promise<ProxyServer | null> {
    const config = await this.getProxyServersConfig();
    if (!config.activeServerId) return null;
    return config.servers.find(s => s.id === config.activeServerId) || null;
  }

  /**
   * 更新服务器测试结果
   */
  public async updateServerTestResult(serverId: string, result: 'success' | 'fail'): Promise<void> {
    await this.updateProxyServer(serverId, {
      lastTestResult: result,
      lastTestTime: new Date().toISOString(),
    });
  }

  /**
   * 生成服务器ID
   */
  private generateServerId(): string {
    return `server_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

}

// 导出单例实例
export const settingsService = SettingsService.getInstance();
