import { SettingsService } from './SettingsService';
import { rssService } from './rss/RSSService';
import { cloudConfigService } from './CloudConfigService';
import AuthService from './AuthService';
import { logger } from './rss/RSSUtils';
import { AppError } from '../types';
import GroupService from './RSSGroupService';
import { filterService } from './rss/FilterService';
import { vocabularyService } from './VocabularyService';
import cacheEventEmitter from './CacheEventEmitter';

export class ConfigSyncService {
  private static instance: ConfigSyncService;
  private settingsService?: SettingsService;
  private rssService = rssService;
  private groupService = GroupService;
  private filterService = filterService;
  private vocabService = vocabularyService;

  private constructor() {}
  
  private getSettingsService(): SettingsService {
    if (!this.settingsService) {
      this.settingsService = SettingsService.getInstance();
    }
    return this.settingsService;
  }

  public static getInstance(): ConfigSyncService {
    if (!ConfigSyncService.instance) {
      ConfigSyncService.instance = new ConfigSyncService();
    }
    return ConfigSyncService.instance;
  }

  /**
   * 同步配置
   * @param mode 'push' | 'pull'
   */
  public async syncConfig(mode: 'push' | 'pull'): Promise<void> {
    const cloudConfig = await cloudConfigService.getConfig();
    if (cloudConfig.mode !== 'cloud' || !cloudConfig.serverUrl) {
      logger.info('[ConfigSync] Skip sync: Cloud mode not enabled');
      return;
    }

    if (!AuthService.isAuthenticated()) {
      logger.info('[ConfigSync] Skip sync: Not authenticated');
      return;
    }

    try {
      if (mode === 'push') {
        await this.pushConfig();
      } else {
        await this.pullConfig();
      }
    } catch (error) {
      logger.error(`[ConfigSync] ${mode} failed:`, error);
      throw error;
    }
  }

  private async getAuthHeaders(): Promise<HeadersInit> {
    const cloudConfig = await cloudConfigService.getConfig();
    const token = AuthService.getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (cloudConfig.serverAccessKey) {
      headers['x-server-token'] = cloudConfig.serverAccessKey;
      headers['x-server-access-key'] = cloudConfig.serverAccessKey;
    }
    
    return headers;
  }

  private async pushConfig(): Promise<void> {
    logger.info('[ConfigSync] Starting push...');
    const [settings, sources, groups, filterRules] = await Promise.all([
      this.getSettingsService().exportSettings(),
      this.rssService.exportSourcesForSync(),
      this.groupService.exportGroupsForSync(),
      this.filterService.exportRulesForSync(),
    ]);

    const payload = {
      settings,
      sources,
      groups,
      filterRules,
    };

    const cloudConfig = await cloudConfigService.getConfig();
    const url = `${cloudConfig.serverUrl.replace(/\/$/, '')}/api/rss/sync/config`;

    const response = await fetch(url, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Push failed with status: ${response.status}`);
    }

    logger.info('[ConfigSync] Push successful');
    
    // Trigger Vocabulary Sync
    this.vocabService.syncToProxyServer().catch(e => logger.warn('[ConfigSync] Vocab sync failed:', e));
  }

  private async pullConfig(): Promise<void> {
    logger.info('[ConfigSync] Starting pull...');
    const cloudConfig = await cloudConfigService.getConfig();
    const url = `${cloudConfig.serverUrl.replace(/\/$/, '')}/api/rss/sync/config`;

    const response = await fetch(url, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    });

    if (response.status === 404) {
      logger.info('[ConfigSync] No remote config found (404). Skipping pull.');
      return;
    }

    if (!response.ok) {
      throw new Error(`Pull failed with status: ${response.status}`);
    }

    const data = await response.json();
    
    // Data structure: { settings, sources, groups, filterRules, timestamp }
    if (!data || Object.keys(data).length === 0) {
      logger.info('[ConfigSync] Remote config is empty.');
      return;
    }

    // Apply in order: Groups -> Sources -> FilterRules -> Settings
    if (data.groups && Array.isArray(data.groups)) {
      await this.groupService.importGroupsFromSync(data.groups);
      logger.info(`[ConfigSync] Imported ${data.groups.length} groups`);
    }

    if (data.sources && Array.isArray(data.sources)) {
      await this.rssService.importSourcesFromSync(data.sources);
      logger.info(`[ConfigSync] Imported ${data.sources.length} sources`);
    }

    if (data.filterRules && Array.isArray(data.filterRules)) {
      await this.filterService.importRulesFromSync(data.filterRules);
      logger.info(`[ConfigSync] Imported ${data.filterRules.length} filter rules`);
    }

    if (data.settings) {
      await this.getSettingsService().importSettings(data.settings);
      logger.info('[ConfigSync] Imported settings');
    }

    logger.info('[ConfigSync] Pull successful');
    cacheEventEmitter.updateRSSStats();
    cacheEventEmitter.settingsUpdated('cloudPull');

    // Trigger Vocabulary Sync
    this.vocabService.syncToProxyServer().catch(e => logger.warn('[ConfigSync] Vocab sync failed:', e));
  }
}

export const configSyncService = ConfigSyncService.getInstance();
