import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { DatabaseService } from '../database/DatabaseService';

export class ConfigSyncService {
  private static instance: ConfigSyncService;
  private static readonly LAST_PUSHED_FINGERPRINT_KEY = 'cloud_config_last_pushed_fingerprint_v2';
  private static readonly MIGRATION_DONE_PREFIX = 'cloud_config_migration_done_v1:';
  private settingsService?: SettingsService;
  private databaseService = DatabaseService.getInstance();
  private rssService = rssService;
  private groupService = GroupService;
  private filterService = filterService;
  private vocabService = vocabularyService;
  private inFlight: Record<'push' | 'pull', Promise<void> | undefined> = { push: undefined, pull: undefined };
  private inFlightMarker: Record<'push' | 'pull', string | undefined> = { push: undefined, pull: undefined };

  private constructor() { }

  private static stableStringify(value: any): string {
    const seen = new WeakSet<object>();
    const normalize = (input: any): any => {
      if (input === null || input === undefined) return input;
      const t = typeof input;
      if (t === 'string' || t === 'number' || t === 'boolean') return input;
      if (Array.isArray(input)) return input.map(normalize);
      if (t === 'object') {
        if (seen.has(input)) return '[Circular]';
        seen.add(input);
        const out: Record<string, any> = {};
        for (const key of Object.keys(input).sort()) {
          const v = (input as any)[key];
          if (v === undefined) continue;
          out[key] = normalize(v);
        }
        return out;
      }
      return String(input);
    };
    return JSON.stringify(normalize(value));
  }

  private static fnv1aHex(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  private sanitizeExportedSettingsForConfigSync(settings: any): any {
    const exported = settings && typeof settings === 'object' ? settings : {};
    const {
      exportedAt: _exportedAt,
      appSettings: rawAppSettings,
      ...rest
    } = exported;

    const appSettings = rawAppSettings && typeof rawAppSettings === 'object' ? { ...rawAppSettings } : undefined;
    if (appSettings && 'sync' in appSettings) {
      delete (appSettings as any).sync;
    }

    return {
      ...rest,
      ...(appSettings ? { appSettings } : {}),
    };
  }

  private computeConfigFingerprint(input: { settings: any; sources: any; groups: any; filterRules: any }): string {
    const canonical = ConfigSyncService.stableStringify({
      settings: this.sanitizeExportedSettingsForConfigSync(input.settings),
      sources: input.sources,
      groups: input.groups,
      filterRules: input.filterRules,
    });
    return ConfigSyncService.fnv1aHex(canonical);
  }

  private async getLastPushedFingerprint(): Promise<string | null> {
    try {
      const v = await AsyncStorage.getItem(ConfigSyncService.LAST_PUSHED_FINGERPRINT_KEY);
      return v ? String(v) : null;
    } catch {
      return null;
    }
  }

  private async setLastPushedFingerprint(value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(ConfigSyncService.LAST_PUSHED_FINGERPRINT_KEY, value);
    } catch {
    }
  }

  private async clearLastPushedFingerprint(): Promise<void> {
    try {
      await AsyncStorage.removeItem(ConfigSyncService.LAST_PUSHED_FINGERPRINT_KEY);
    } catch {
    }
  }

  private buildMigrationDoneKey(baseUrl: string, userId: string): string {
    const normalizedBaseUrl = String(baseUrl || '').replace(/\/$/, '');
    return `${ConfigSyncService.MIGRATION_DONE_PREFIX}${normalizedBaseUrl}:${String(userId || '')}`;
  }

  private async isMigrationDone(baseUrl: string, userId: string): Promise<boolean> {
    const key = this.buildMigrationDoneKey(baseUrl, userId);
    try {
      const v = await AsyncStorage.getItem(key);
      return !!v;
    } catch {
      return false;
    }
  }

  private async markMigrationDone(baseUrl: string, userId: string): Promise<void> {
    const key = this.buildMigrationDoneKey(baseUrl, userId);
    try {
      await AsyncStorage.setItem(key, new Date().toISOString());
    } catch {
    }
  }

  private isNonEmptyObject(input: any): boolean {
    if (!input || typeof input !== 'object') return false;
    if (Array.isArray(input)) return input.length > 0;
    return Object.keys(input).length > 0;
  }

  private async hasRemoteConfig(baseUrl: string, headers: HeadersInit): Promise<boolean> {
    const endpoints = [
      `${baseUrl}/api/config/preferences`,
      `${baseUrl}/api/config/groups`,
      `${baseUrl}/api/config/sources`,
      `${baseUrl}/api/config/filter-rules`,
    ];
    const responses = await Promise.all(
      endpoints.map((url) => fetch(url, { headers }).catch(() => null as any))
    );

    for (const res of responses) {
      if (!res) continue;
      if (res.status === 404) continue;
      if (!res.ok) continue;
      try {
        const json = await res.json();
        const data = json?.data ?? json;
        if (res.url.includes('/preferences')) {
          if (this.isNonEmptyObject(data)) return true;
        } else {
          if (Array.isArray(data) && data.length > 0) return true;
        }
      } catch {
      }
    }
    return false;
  }

  private async hasLocalConfig(): Promise<boolean> {
    try {
      const [settings, sources, groups, filterRules] = await Promise.all([
        this.getSettingsService().exportSettings(),
        this.rssService.exportSourcesForSync(),
        this.groupService.exportGroupsForSync(),
        this.filterService.exportRulesForSync(),
      ]);

      const settingsForCheck = this.sanitizeExportedSettingsForConfigSync(settings);
      const hasSettings =
        this.isNonEmptyObject((settingsForCheck as any).readingSettings) ||
        this.isNonEmptyObject((settingsForCheck as any).appSettings) ||
        this.isNonEmptyObject((settingsForCheck as any).rssSettings) ||
        this.isNonEmptyObject((settingsForCheck as any).themeSettings) ||
        this.isNonEmptyObject((settingsForCheck as any).dailyReportSettings) ||
        this.isNonEmptyObject((settingsForCheck as any).rssStartupSettings);

      return (
        hasSettings ||
        (Array.isArray(sources) && sources.length > 0) ||
        (Array.isArray(groups) && groups.length > 0) ||
        (Array.isArray(filterRules) && filterRules.length > 0)
      );
    } catch {
      return false;
    }
  }

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
    if (!cloudConfig.serverUrl) {
      logger.info('[ConfigSync] Skip sync: Server URL not configured');
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

  public async bootstrapConfigAfterAuth(): Promise<void> {
    const cloudConfig = await cloudConfigService.getConfig();
    if (!cloudConfigService.isCloudEnabled(cloudConfig)) {
      return;
    }

    const userId = cloudConfig.auth?.user?.id ? String(cloudConfig.auth.user.id) : '';
    if (!userId) return;

    const token = AuthService.getAuthToken() ?? cloudConfig.auth.accessToken;
    if (!token) return;

    const headers = await this.getAuthHeaders();
    const baseUrl = cloudConfig.serverUrl.replace(/\/$/, '');

    if (await this.isMigrationDone(baseUrl, userId)) {
      return;
    }

    try {
      const [remoteHasAny, localHasAny] = await Promise.all([
        this.hasRemoteConfig(baseUrl, headers),
        this.hasLocalConfig(),
      ]);

      if (remoteHasAny) {
        await this.syncConfig('pull');
        if (localHasAny) {
          await this.clearLastPushedFingerprint();
          await this.syncConfig('push');
        }
        await this.markMigrationDone(baseUrl, userId);
        return;
      }

      if (localHasAny) {
        await this.syncConfig('push');
        await this.markMigrationDone(baseUrl, userId);
        return;
      }

      await this.markMigrationDone(baseUrl, userId);
    } catch (e) {
      logger.warn(`[ConfigSync] bootstrapConfigAfterAuth failed: ${String((e as any)?.message || e)}`);
    }
  }

  public async resetBootstrapForCurrentUser(): Promise<void> {
    const cloudConfig = await cloudConfigService.getConfig();
    const baseUrl = cloudConfig.serverUrl ? cloudConfig.serverUrl.replace(/\/$/, '') : '';
    const userId = cloudConfig.auth?.user?.id ? String(cloudConfig.auth.user.id) : '';
    if (!baseUrl || !userId) return;
    const key = this.buildMigrationDoneKey(baseUrl, userId);
    try {
      await AsyncStorage.removeItem(key);
    } catch {
    }
    await this.clearLastPushedFingerprint();
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

  private async normalizeRssStartupSettingsForPush(exportedSettings: any): Promise<any> {
    const settings = exportedSettings && typeof exportedSettings === 'object' ? { ...exportedSettings } : {};
    const startup = (settings as any).rssStartupSettings;
    if (!startup || typeof startup !== 'object') return settings;
    const enabled = !!(startup as any).enabled;
    const sourceIds = Array.isArray((startup as any).sourceIds) ? (startup as any).sourceIds : [];
    if (sourceIds.length === 0) {
      (settings as any).rssStartupSettings = { enabled, sourceUrls: [] };
      return settings;
    }

    const rows: any[] = await this.databaseService.executeQuery('SELECT id, url FROM rss_sources').catch(() => []);
    const idToUrl = new Map<number, string>();
    for (const r of rows) {
      const id = typeof r?.id === 'number' ? r.id : parseInt(String(r?.id ?? ''), 10);
      const url = r?.url ? String(r.url) : '';
      if (Number.isFinite(id) && url) idToUrl.set(id, url);
    }

    const sourceUrls = sourceIds
      .map((id: any) => {
        const num = typeof id === 'number' ? id : parseInt(String(id ?? ''), 10);
        return idToUrl.get(num);
      })
      .filter(Boolean);

    (settings as any).rssStartupSettings = { enabled, sourceUrls };
    return settings;
  }

  private async normalizeRssStartupSettingsForPull(remoteSettings: any): Promise<any> {
    const settings = remoteSettings && typeof remoteSettings === 'object' ? { ...remoteSettings } : {};
    const startup = (settings as any).rssStartupSettings;
    if (!startup || typeof startup !== 'object') return settings;
    const enabled = !!(startup as any).enabled;
    const sourceUrls = Array.isArray((startup as any).sourceUrls) ? (startup as any).sourceUrls : [];
    if (sourceUrls.length === 0) {
      (settings as any).rssStartupSettings = { enabled, sourceIds: [] };
      return settings;
    }

    const rows: any[] = await this.databaseService.executeQuery('SELECT id, url FROM rss_sources').catch(() => []);
    const urlToId = new Map<string, number>();
    for (const r of rows) {
      const id = typeof r?.id === 'number' ? r.id : parseInt(String(r?.id ?? ''), 10);
      const url = r?.url ? String(r.url) : '';
      if (Number.isFinite(id) && url) urlToId.set(url, id);
    }

    const sourceIds = sourceUrls
      .map((u: any) => urlToId.get(String(u || '')))
      .filter((v: any) => typeof v === 'number' && Number.isFinite(v));

    (settings as any).rssStartupSettings = { enabled, sourceIds };
    return settings;
  }

  private async pushConfig(): Promise<void> {
    const requestId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    logger.info(`[ConfigSync] Starting modular push... requestId=${requestId}`);

    const [settings, sources, groups, filterRules] = await Promise.all([
      this.getSettingsService().exportSettings(),
      this.rssService.exportSourcesForSync(),
      this.groupService.exportGroupsForSync(),
      this.filterService.exportRulesForSync(),
    ]);

    const settingsForPush = await this.normalizeRssStartupSettingsForPush(settings);
    const fingerprint = this.computeConfigFingerprint({
      settings: { ...(settingsForPush as any), llmSettings: undefined },
      sources,
      groups,
      filterRules
    });
    const lastFingerprint = await this.getLastPushedFingerprint();

    if (lastFingerprint && lastFingerprint === fingerprint) {
      logger.info(`[ConfigSync] Skip push: Config unchanged requestId=${requestId} fingerprint=${fingerprint}`);
      return;
    }

    const cloudConfig = await cloudConfigService.getConfig();
    const headers = await this.getAuthHeaders();
    const baseUrl = cloudConfig.serverUrl.replace(/\/$/, '');

    // 1. Push Preferences (Settings)
    // Bundles readingSettings, appSettings, rssSettings, themeSettings, dailyReportSettings
    const preferencesPayload = {
      readingSettings: settingsForPush.readingSettings,
      appSettings: this.sanitizeExportedSettingsForConfigSync(settingsForPush.appSettings),
      rssSettings: settingsForPush.rssSettings,
      themeSettings: settingsForPush.themeSettings,
      dailyReportSettings: settingsForPush.dailyReportSettings,
      rssStartupSettings: settingsForPush.rssStartupSettings,
    };

    const pushPrefs = fetch(`${baseUrl}/api/config/preferences`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(preferencesPayload),
    });

    // 2. Push Groups
    const pushGroups = fetch(`${baseUrl}/api/config/groups/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify(groups),
    });

    // 3. Push Sources
    const pushSources = fetch(`${baseUrl}/api/config/sources/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify(sources),
    });

    // 4. Push Filter Rules
    const pushRules = fetch(`${baseUrl}/api/config/filter-rules/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify(filterRules),
    });

    const responses = await Promise.all([pushPrefs, pushGroups, pushSources, pushRules]);

    for (const res of responses) {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        logger.error(`[ConfigSync] Push failed for ${res.url}: ${res.status} ${text}`);
        throw new Error(`Modular push failed at ${res.url}`);
      }
    }

    logger.info(`[ConfigSync] Modular push successful requestId=${requestId}`);
    await this.setLastPushedFingerprint(fingerprint);
  }

  private async pullConfig(): Promise<void> {
    const requestId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    logger.info(`[ConfigSync] Starting modular pull... requestId=${requestId}`);

    const cloudConfig = await cloudConfigService.getConfig();
    const headers = await this.getAuthHeaders();
    const baseUrl = cloudConfig.serverUrl.replace(/\/$/, '');

    const endpoints = [
      `${baseUrl}/api/config/preferences`,
      `${baseUrl}/api/config/groups`,
      `${baseUrl}/api/config/sources`,
      `${baseUrl}/api/config/filter-rules`,
    ];

    try {
      const responses = await Promise.all(endpoints.map(url => fetch(url, { headers })));

      const results: any = {};
      for (const res of responses) {
        if (res.status === 404) continue;
        if (!res.ok) throw new Error(`Pull failed: ${res.status} from ${res.url}`);

        const json = await res.json();
        const data = json.data || json;

        if (res.url.includes('/preferences')) results.preferences = data;
        else if (res.url.includes('/groups')) results.groups = data;
        else if (res.url.includes('/sources')) results.sources = data;
        else if (res.url.includes('/filter-rules')) results.filterRules = data;
      }

      if (Object.keys(results).length === 0) {
        logger.info('[ConfigSync] No remote config found.');
        return;
      }

      // Apply in order
      if (results.groups) {
        await this.groupService.importGroupsFromSync(results.groups);
        logger.info(`[ConfigSync] Imported ${results.groups.length} groups`);
      }

      if (results.sources) {
        await this.rssService.importSourcesFromSync(results.sources);
        logger.info(`[ConfigSync] Imported ${results.sources.length} sources`);
      }

      if (results.filterRules) {
        await this.filterService.importRulesFromSync(results.filterRules);
        logger.info(`[ConfigSync] Imported ${results.filterRules.length} filter rules`);
      }

      if (results.preferences) {
        const normalized = await this.normalizeRssStartupSettingsForPull(results.preferences);
        await this.getSettingsService().importSettings(normalized);
        logger.info('[ConfigSync] Imported preferences');
      }

      logger.info('[ConfigSync] Modular pull successful');

      // Update fingerprint
      const [settings, sources, groups, filterRules] = await Promise.all([
        this.getSettingsService().exportSettings(),
        this.rssService.exportSourcesForSync(),
        this.groupService.exportGroupsForSync(),
        this.filterService.exportRulesForSync(),
      ]);
      const fingerprint = this.computeConfigFingerprint({ settings, sources, groups, filterRules });
      await this.setLastPushedFingerprint(fingerprint);

      cacheEventEmitter.updateRSSStats();
    } catch (error) {
      logger.error(`[ConfigSync] Modular pull failed requestId=${requestId}:`, error);
      throw error;
    }
  }
}

export const configSyncService = ConfigSyncService.getInstance();
