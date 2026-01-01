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
  private inFlight: Record<'push' | 'pull', Promise<void> | undefined> = { push: undefined, pull: undefined };
  private inFlightMarker: Record<'push' | 'pull', string | undefined> = { push: undefined, pull: undefined };

  private constructor() {}

  private redactForLog(input: any, depth: number = 0): any {
    if (depth > 8) return '[Truncated]';
    if (input === null || input === undefined) return input;
    if (typeof input !== 'object') return input;

    if (Array.isArray(input)) {
      return input.map(v => this.redactForLog(v, depth + 1));
    }

    const out: any = {};
    for (const [k, v] of Object.entries(input)) {
      const keyLower = String(k).toLowerCase();
      const isSensitive =
        keyLower !== 'keyword' &&
        (keyLower.includes('apikey') ||
          keyLower === 'token' ||
          keyLower.endsWith('token') ||
          keyLower.includes('password') ||
          keyLower.includes('secret') ||
          keyLower.includes('accesskey'));
      out[k] = isSensitive ? '***' : this.redactForLog(v, depth + 1);
    }
    return out;
  }

  private safeJsonForLog(value: any, maxLen: number = 12000): string {
    try {
      const redacted = this.redactForLog(value);
      const str = JSON.stringify(redacted);
      if (str.length > maxLen) {
        return `${str.slice(0, maxLen)}...[Truncated ${str.length - maxLen} chars]`;
      }
      return str;
    } catch {
      return '[Unserializable]';
    }
  }

  private logConfigSnapshot(requestId: string, label: string, snapshot: any): void {
    const updatedAt = snapshot?.updatedAt ? String(snapshot.updatedAt) : '';
    const sourcesCount = Array.isArray(snapshot?.sources) ? snapshot.sources.length : 0;
    const groupsCount = Array.isArray(snapshot?.groups) ? snapshot.groups.length : 0;
    const filterRulesCount = Array.isArray(snapshot?.filterRules) ? snapshot.filterRules.length : 0;
    const hasSettings = !!snapshot?.settings;

    logger.info(
      `[ConfigSync] ${label} summary requestId=${requestId} updatedAt=${updatedAt} hasSettings=${hasSettings} sources=${sourcesCount} groups=${groupsCount} filterRules=${filterRulesCount}`
    );
    logger.info(`[ConfigSync] ${label} settings requestId=${requestId}: ${this.safeJsonForLog(snapshot?.settings)}`);
    logger.info(`[ConfigSync] ${label} sources requestId=${requestId}: ${this.safeJsonForLog(snapshot?.sources)}`);
    logger.info(`[ConfigSync] ${label} groups requestId=${requestId}: ${this.safeJsonForLog(snapshot?.groups)}`);
    logger.info(`[ConfigSync] ${label} filterRules requestId=${requestId}: ${this.safeJsonForLog(snapshot?.filterRules)}`);
  }
  
  private getSettingsService(): SettingsService {
    if (!this.settingsService) {
      this.settingsService = SettingsService.getInstance();
    }
    return this.settingsService;
  }

  private async runExclusive(mode: 'push' | 'pull', fn: () => Promise<void>): Promise<void> {
    const existing = this.inFlight[mode];
    if (existing) return existing;

    const marker = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    this.inFlightMarker[mode] = marker;

    const task = (async () => {
      try {
        await fn();
      } finally {
        if (this.inFlightMarker[mode] === marker) {
          this.inFlight[mode] = undefined;
          this.inFlightMarker[mode] = undefined;
        }
      }
    })();

    this.inFlight[mode] = task;
    return task;
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

    const token = AuthService.getAuthToken() ?? cloudConfig.auth.accessToken;
    if (!token) {
      logger.info('[ConfigSync] Skip sync: Not authenticated');
      return;
    }

    try {
      await this.runExclusive(mode, async () => {
        if (mode === 'push') {
          await this.pushConfig();
        } else {
          await this.pullConfig();
        }
      });
    } catch (error) {
      logger.error(`[ConfigSync] ${mode} failed:`, error);
      throw error;
    }
  }

  private async getAuthHeaders(): Promise<HeadersInit> {
    const cloudConfig = await cloudConfigService.getConfig();
    const token = AuthService.getAuthToken() ?? cloudConfig.auth.accessToken;
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
    const requestId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    logger.info(`[ConfigSync] Starting push... requestId=${requestId}`);
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
      updatedAt: new Date().toISOString(),
    };

    this.logConfigSnapshot(requestId, 'Local config (push payload)', payload);

    const cloudConfig = await cloudConfigService.getConfig();
    const url = `${cloudConfig.serverUrl.replace(/\/$/, '')}/api/rss/sync/config`;

    const response = await fetch(url, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let body = '';
      try {
        body = await response.text();
      } catch {
      }
      if (body && body.length > 2000) {
        body = `${body.slice(0, 2000)}...[Truncated ${body.length - 2000} chars]`;
      }
      if (response.status === 409) {
        try {
          const parsed = body ? JSON.parse(body) : null;
          const serverUpdatedAt = parsed?.serverUpdatedAt ? String(parsed.serverUpdatedAt) : '';
          logger.warn(
            `[ConfigSync] Push conflict (409) requestId=${requestId}${serverUpdatedAt ? ` serverUpdatedAt=${serverUpdatedAt}` : ''}${body ? ` body=${body}` : ''}`
          );
        } catch {
          logger.warn(
            `[ConfigSync] Push conflict (409) requestId=${requestId}${body ? ` body=${body}` : ''}`
          );
        }
      }
      throw new Error(`Push failed with status: ${response.status}${body ? ` body=${body}` : ''}`);
    }

    let resData: any = null;
    try {
      resData = await response.json();
    } catch {
    }
    logger.info(
      `[ConfigSync] Push successful requestId=${requestId}${resData?.updatedAt ? ` serverUpdatedAt=${resData.updatedAt}` : ''}`
    );
    
    // Trigger Vocabulary Sync
    this.vocabService.syncToProxyServer().catch(e => logger.warn('[ConfigSync] Vocab sync failed:', e));
  }

  private async pullConfig(): Promise<void> {
    const requestId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    logger.info(`[ConfigSync] Starting pull... requestId=${requestId}`);
    const cloudConfig = await cloudConfigService.getConfig();
    const url = `${cloudConfig.serverUrl.replace(/\/$/, '')}/api/rss/sync/config`;

    const response = await fetch(url, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    });

    if (response.status === 404) {
      logger.info(`[ConfigSync] No remote config found (404). Skipping pull. requestId=${requestId}`);
      return;
    }

    if (!response.ok) {
      let body = '';
      try {
        body = await response.text();
      } catch {
      }
      if (body && body.length > 2000) {
        body = `${body.slice(0, 2000)}...[Truncated ${body.length - 2000} chars]`;
      }
      throw new Error(`Pull failed with status: ${response.status}${body ? ` body=${body}` : ''}`);
    }

    const data = await response.json();
    this.logConfigSnapshot(requestId, 'Remote config (pull payload)', data);
    
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
    try {
      const [settings, sources, groups, filterRules] = await Promise.all([
        this.getSettingsService().exportSettings(),
        this.rssService.exportSourcesForSync(),
        this.groupService.exportGroupsForSync(),
        this.filterService.exportRulesForSync(),
      ]);
      this.logConfigSnapshot(requestId, 'Local config (after pull applied)', {
        settings,
        sources,
        groups,
        filterRules,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      logger.warn(`[ConfigSync] Post-pull local snapshot export failed requestId=${requestId}:`, e);
    }
    cacheEventEmitter.updateRSSStats();
    cacheEventEmitter.settingsUpdated('cloudPull');

    // Trigger Vocabulary Sync
    this.vocabService.syncToProxyServer().catch(e => logger.warn('[ConfigSync] Vocab sync failed:', e));
  }
}

export const configSyncService = ConfigSyncService.getInstance();
