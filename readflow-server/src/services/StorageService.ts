import { PrismaClient } from '.prisma/client';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/Logger';
import { Article } from '../types';
import { decrypt, encrypt } from '../utils/encryption';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  log: ['warn', 'error'],
});

const prismaAny = prisma as any;

export interface ServerSettings {
  imageQuality: number;
  imageTranscodeEnabled?: boolean;
  imageWarmupEnabled?: boolean;
  imageCacheMaxAgeDays?: number;
  imageCacheMaxFiles?: number;
  imageCacheMaxBytes?: number;
  adminPassword?: string;
  rssDefaultRefreshIntervalSeconds?: number;
  rssDefaultRefreshCron?: string;
  rssMaxItemsPerFetch?: number;
  rssFetchTimeoutMs?: number;
  rssFulltextTimeoutMs?: number;
  retentionDays?: number;
  retentionMaxArticlesPerFeed?: number;
  cleanupIntervalHours?: number;
  syncPageSizeDefault?: number;
  syncPageSizeMax?: number;
  dailyReportSystemPrompt?: string;
  dailyReportRetentionDays?: number;
  llm?: {
    profiles?: LLMProfileConfig[];
    bindings?: Partial<Record<LLMFeature, string>>;
  };
}

export type LLMFeature = 'translation' | 'dictionary' | 'titleTranslation' | 'dailyReport';

export interface LLMProfileConfig {
  id: string;
  name?: string;
  provider: 'openai-compatible' | 'anthropic';
  baseUrl: string;
  model: string;
  apiKeyEncrypted?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  isActive?: boolean;
}

// Retain legacy interfaces for compatibility
export interface User {
  id: string;
  username: string;
  email?: string;
  passwordHash?: string;
  registeredAt?: string;
  lastActive: string | Date;
  settings?: any;
  config?: any;
  feedCount?: number;
}

export interface Feed {
  id: string;
  url: string;
  name: string;
  category: string;
  description?: string;
  createdAt: string | Date;
  updatedAt?: string;
  refreshIntervalSeconds?: number;
  refreshCron?: string;
  lastRefreshAt?: string;
  lastRefreshStatus?: 'ok' | 'error';
  lastRefreshError?: string;
  articleCount?: number;
  subscriberCount?: number;
}

export interface UserFeedLink {
  userId: string;
  feedId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserArticleState {
  userId: string;
  articleUrl: string;
  isRead: boolean;
  isFavorite: boolean;
  readProgress: number;
  updatedAt: string;
}

interface StoredSyncBlock {
  id: number;
  sourceUrl: string;
  createdAt: string;
  upserts: Omit<Article, 'id'>[];
}

export class StorageService {
  private static instance: StorageService;

  private settings: ServerSettings;
  private cacheDir: string;
  private settingsInitialized: boolean = false;
  private readonly serverSettingsKey = 'global';

  private constructor() {
    this.cacheDir = path.join(process.cwd(), 'public', 'cache');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    this.settings = {
      imageQuality: 80,
      imageTranscodeEnabled: true,
      imageWarmupEnabled: true,
      imageCacheMaxAgeDays: 30,
      imageCacheMaxFiles: 50_000,
      imageCacheMaxBytes: 2_000_000_000,
      rssDefaultRefreshIntervalSeconds: 900,
      rssDefaultRefreshCron: undefined,
      rssMaxItemsPerFetch: 20,
      rssFetchTimeoutMs: 15000,
      rssFulltextTimeoutMs: 20000,
      retentionDays: 0,
      retentionMaxArticlesPerFeed: 0,
      cleanupIntervalHours: 24,
      syncPageSizeDefault: 200,
      syncPageSizeMax: 2000,
      dailyReportRetentionDays: 90,
      adminPassword: process.env.ADMIN_PASSWORD || 'admin',
      llm: {
        profiles: [
          {
            id: 'default',
            name: 'Default',
            provider: 'openai-compatible',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini',
            isActive: true,
          },
        ],
        bindings: {
          translation: 'default',
          dictionary: 'default',
          titleTranslation: 'default',
          dailyReport: 'default',
        },
      },
    };
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  public async init(): Promise<void> {
    if (this.settingsInitialized) return;
    try {
      await prisma.$executeRawUnsafe(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_preferences'
  ) THEN
    CREATE TABLE "user_preferences" (
      "userId" TEXT NOT NULL,
      "settings" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("userId")
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_preferences_userId_fkey'
  ) THEN
    ALTER TABLE "user_preferences"
      ADD CONSTRAINT "user_preferences_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("uuid")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
      `);

      await prisma.$executeRawUnsafe(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'llm_usage_events'
  ) THEN
    CREATE TABLE "llm_usage_events" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "requestId" TEXT,
      "feature" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "provider" TEXT,
      "model" TEXT,
      "profileId" TEXT,
      "cacheKey" TEXT,
      "cacheHit" BOOLEAN NOT NULL DEFAULT false,
      "durationMs" INTEGER NOT NULL,
      "tokensTotal" INTEGER,
      "tokensPrompt" INTEGER,
      "tokensCompletion" INTEGER,
      "httpStatus" INTEGER,
      "errorType" TEXT,
      "errorMessage" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "llm_usage_events_pkey" PRIMARY KEY ("id")
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'llm_usage_events_userId_fkey'
  ) THEN
    ALTER TABLE "llm_usage_events"
      ADD CONSTRAINT "llm_usage_events_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("uuid")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
      `);

      const row = await prisma.serverSetting.findUnique({ where: { key: this.serverSettingsKey } });
      const data = row?.data && typeof row.data === 'object' ? row.data : null;
      if (data) {
        this.settings = { ...this.settings, ...this.sanitizeSettings(data) };
      } else {
        await prisma.serverSetting.upsert({
          where: { key: this.serverSettingsKey },
          update: { data: this.settings as any },
          create: { key: this.serverSettingsKey, data: this.settings as any },
        });
      }

      const envAdminPassword = String(process.env.ADMIN_PASSWORD || '').trim();
      if (envAdminPassword) {
        this.settings.adminPassword = envAdminPassword;
      }

      if (!this.settings.adminPassword) {
        this.settings.adminPassword = 'admin';
      }
      this.validateSecurityConfig();
      this.settingsInitialized = true;
    } catch (error) {
      this.settingsInitialized = true;
      logger.error('Failed to init server settings from DB:', error);
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
    }
  }

  private validateSecurityConfig(): void {
    if (process.env.NODE_ENV !== 'production') return;
    const adminPassword = String(this.settings.adminPassword || '').trim();
    if (!adminPassword || adminPassword === 'admin') {
      throw new Error('ADMIN_PASSWORD must be set to a non-default value in production');
    }
  }

  private normalizeUrl(url: string): string {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(raw);
      const normalized = u.toString();
      return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
    } catch {
      return raw.endsWith('/') ? raw.slice(0, -1) : raw;
    }
  }

  private normalizeArticleUrl(url: string): string {
    let raw = String(url || '').trim();
    if (!raw) return '';
    raw = raw.replace(/`/g, '').trim();
    while (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      raw = raw.slice(1, -1).trim();
    }
    return this.normalizeUrl(raw);
  }

  private buildArticleDedupSuffixes(url: string): string[] {
    const cleaned = this.normalizeArticleUrl(url);
    if (!cleaned) return [];
    try {
      const u = new URL(cleaned);
      const pathname = u.pathname || '';
      if (!pathname || pathname === '/') return [];

      const trackingKeys = new Set([
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'spm',
        'from',
        'ref',
        'referer',
      ]);

      const params = new URLSearchParams(u.search);
      for (const key of Array.from(params.keys())) {
        if (trackingKeys.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
          params.delete(key);
        }
      }

      const entries = Array.from(params.entries()).sort((a, b) => {
        if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
        return a[1].localeCompare(b[1]);
      });

      const normalizedParams = new URLSearchParams();
      for (const [k, v] of entries) normalizedParams.append(k, v);

      const query = normalizedParams.toString();
      const suffixes: string[] = [];
      suffixes.push(pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname);
      if (query) suffixes.unshift(`${suffixes[0]}?${query}`);
      return Array.from(new Set(suffixes.filter(Boolean)));
    } catch {
      return [];
    }
  }

  // Settings
  public getSettings(): ServerSettings {
    return { ...this.settings };
  }

  public getAdminSettings(): ServerSettings {
    const copy: ServerSettings = JSON.parse(JSON.stringify(this.settings));
    const profiles = copy.llm?.profiles;
    if (Array.isArray(profiles)) {
      copy.llm = copy.llm || {};
      copy.llm.profiles = profiles.map((p) => {
        const key = typeof p.apiKeyEncrypted === 'string' ? decrypt(p.apiKeyEncrypted) : '';
        const hint = key ? `${'*'.repeat(Math.max(0, key.length - 4))}${key.slice(-4)}` : '';
        return {
          ...p,
          apiKeyEncrypted: '',
          hasApiKey: !!key,
          apiKeyHint: hint,
        };
      });
    }
    return copy;
  }

  public async saveSettings(newSettings: Partial<ServerSettings>) {
    const sanitized = this.sanitizeSettings(newSettings);
    this.settings = { ...this.settings, ...sanitized };
    await prisma.serverSetting.upsert({
      where: { key: this.serverSettingsKey },
      update: { data: this.settings as any },
      create: { key: this.serverSettingsKey, data: this.settings as any },
    });
  }

  private sanitizeSettings(input: any): Partial<ServerSettings> {
    const out: Partial<ServerSettings> = {};

    const setNum = (key: keyof ServerSettings, v: any, min?: number, max?: number) => {
      if (v === undefined || v === null) return;
      const n = typeof v === 'number' ? v : parseInt(String(v), 10);
      if (!Number.isFinite(n)) return;
      let next = n;
      if (typeof min === 'number') next = Math.max(min, next);
      if (typeof max === 'number') next = Math.min(max, next);
      (out as any)[key] = next;
    };

    const setBool = (key: keyof ServerSettings, v: any) => {
      if (v === undefined || v === null) return;
      if (typeof v === 'boolean') {
        (out as any)[key] = v;
        return;
      }
      if (typeof v === 'number') {
        (out as any)[key] = v !== 0;
        return;
      }
      const s = String(v).trim().toLowerCase();
      if (s === '1' || s === 'true') {
        (out as any)[key] = true;
      } else if (s === '0' || s === 'false') {
        (out as any)[key] = false;
      }
    };

    const setStr = (key: keyof ServerSettings, v: any) => {
      if (v === undefined || v === null) return;
      const s = String(v);
      if (!s) return;
      (out as any)[key] = s;
    };

    const setOptionalStr = (key: keyof ServerSettings, v: any) => {
      if (v === undefined) return;
      if (v === null) {
        (out as any)[key] = undefined;
        return;
      }
      const s = String(v).trim();
      if (!s) {
        (out as any)[key] = undefined;
        return;
      }
      (out as any)[key] = s;
    };

    setNum('imageQuality', input.imageQuality, 1, 100);
    setBool('imageTranscodeEnabled', input.imageTranscodeEnabled);
    setBool('imageWarmupEnabled', input.imageWarmupEnabled);
    setNum('imageCacheMaxAgeDays', input.imageCacheMaxAgeDays, 0, 3650);
    setNum('imageCacheMaxFiles', input.imageCacheMaxFiles, 0, 5_000_000);
    setNum('imageCacheMaxBytes', input.imageCacheMaxBytes, 0, 50_000_000_000);
    setNum(
      'rssDefaultRefreshIntervalSeconds',
      input.rssDefaultRefreshIntervalSeconds ?? input.rssRefreshIntervalSeconds,
      60
    );
    setOptionalStr('rssDefaultRefreshCron', input.rssDefaultRefreshCron ?? input.rssRefreshCron);

    setNum(
      'rssMaxItemsPerFetch',
      input.rssMaxItemsPerFetch ?? input.rssMaxArticlesPerFeed ?? input.fetchParseItemCap,
      0,
      5000
    );
    setNum('rssFetchTimeoutMs', input.rssFetchTimeoutMs ?? input.fetchTimeoutMs, 1000, 60000);
    setNum('rssFulltextTimeoutMs', input.rssFulltextTimeoutMs, 1000, 60000);

    setNum('syncPageSizeDefault', input.syncPageSizeDefault ?? input.syncDefaultPageSize, 10, 2000);
    setNum(
      'syncPageSizeMax',
      input.syncPageSizeMax ?? input.syncMaxPageSize ?? input.rssSyncMaxBlocksPerFeed,
      100,
      10000
    );

    setNum('retentionDays', input.retentionDays ?? input.articleRetentionDays, 0, 3650);
    setNum(
      'retentionMaxArticlesPerFeed',
      input.retentionMaxArticlesPerFeed ?? input.articleMaxCountPerFeed,
      0,
      5_000_000
    );
    setNum('cleanupIntervalHours', input.cleanupIntervalHours, 1, 168);

    setStr('adminPassword', input.adminPassword);
    setOptionalStr('dailyReportSystemPrompt', input.dailyReportSystemPrompt);
    setNum('dailyReportRetentionDays', input.dailyReportRetentionDays, 0, 3650);

    if (input && typeof input === 'object' && input.llm && typeof input.llm === 'object') {
      const prev = (this.settings && typeof this.settings === 'object' ? this.settings.llm : undefined) || {};
      const prevProfiles: LLMProfileConfig[] = Array.isArray((prev as any).profiles) ? (prev as any).profiles : [];
      const prevById = new Map(prevProfiles.map((p) => [p.id, p]));

      const nextLlm: ServerSettings['llm'] = {};

      const rawProfiles = (input.llm as any).profiles;
      if (Array.isArray(rawProfiles)) {
        const normalized: LLMProfileConfig[] = [];
        for (const raw of rawProfiles) {
          if (!raw || typeof raw !== 'object') continue;
          const id = String((raw as any).id || '').trim();
          if (!id) continue;
          const providerRaw = String((raw as any).provider || '').trim();
          const provider = providerRaw === 'anthropic' ? 'anthropic' : 'openai-compatible';
          const baseUrl = String((raw as any).baseUrl || '').trim();
          const model = String((raw as any).model || '').trim();
          if (!baseUrl || !model) continue;

          const temperature = (raw as any).temperature;
          const maxTokens = (raw as any).maxTokens;
          const topP = (raw as any).topP;

          const next: LLMProfileConfig = {
            id,
            name: typeof (raw as any).name === 'string' ? (raw as any).name : undefined,
            provider,
            baseUrl,
            model,
            isActive: (raw as any).isActive !== false,
          };

          if (typeof temperature === 'number' && Number.isFinite(temperature)) {
            next.temperature = Math.max(0, Math.min(2, temperature));
          }
          if (typeof maxTokens === 'number' && Number.isFinite(maxTokens)) {
            next.maxTokens = Math.max(1, Math.min(200000, maxTokens));
          }
          if (typeof topP === 'number' && Number.isFinite(topP)) {
            next.topP = Math.max(0, Math.min(1, topP));
          }

          const apiKey = typeof (raw as any).apiKey === 'string' ? String((raw as any).apiKey).trim() : '';
          if (apiKey) {
            next.apiKeyEncrypted = encrypt(apiKey);
          } else {
            const legacyEncrypted = typeof (raw as any).apiKeyEncrypted === 'string' ? String((raw as any).apiKeyEncrypted).trim() : '';
            if (legacyEncrypted && legacyEncrypted.includes(':')) {
              next.apiKeyEncrypted = legacyEncrypted;
            } else {
            const prevOne = prevById.get(id);
            if (prevOne?.apiKeyEncrypted) next.apiKeyEncrypted = prevOne.apiKeyEncrypted;
            }
          }

          normalized.push(next);
        }
        nextLlm.profiles = normalized;
      }

      const rawBindings = (input.llm as any).bindings;
      if (rawBindings && typeof rawBindings === 'object') {
        const b: Partial<Record<LLMFeature, string>> = {};
        const features: LLMFeature[] = ['translation', 'dictionary', 'titleTranslation', 'dailyReport'];
        for (const f of features) {
          const v = (rawBindings as any)[f];
          if (typeof v === 'string' && v.trim()) b[f] = v.trim();
        }
        nextLlm.bindings = b;
      }

      out.llm = { ...prev, ...nextLlm };
    }
    return out;
  }

  // Users
  public async getUsers(): Promise<User[]> {
    const users = await prisma.user.findMany({
      include: {
        _count: { select: { feeds: true } }
      },
    }) as any[];

    // Fetch preferences manually to avoid include type errors
    for (const u of users) {
      u.preference = await prismaAny.userPreference.findUnique({ where: { userId: u.uuid } });
    }

    return users.map(this.mapDbUserToUser);
  }

  public async getUserById(id: string): Promise<User | undefined> {
    const user = await prisma.user.findUnique({
      where: { uuid: id }
    }) as any;
    if (!user) return undefined;
    user.preference = await prismaAny.userPreference.findUnique({ where: { userId: user.uuid } });
    return this.mapDbUserToUser(user);
  }

  public async findUserByEmail(email: string): Promise<User | undefined> {
    const user = await prisma.user.findUnique({
      where: { email }
    }) as any;
    if (!user) return undefined;
    user.preference = await prismaAny.userPreference.findUnique({ where: { userId: user.uuid } });
    return this.mapDbUserToUser(user);
  }

  public async createUser(user: User): Promise<User> {
    if (user.email) {
      const existing = await this.findUserByEmail(user.email);
      if (existing) throw new Error('User with this email already exists');
    }
    await this.saveUser(user);
    return user;
  }

  public async saveUser(user: User) {
    const syncData = {
      ...(user.config || {}),
      settings: user.settings || user.config?.settings,
    };

    const savedUser = await prisma.user.upsert({
      where: { uuid: user.id },
      update: {
        username: user.username,
        email: user.email,
        passwordHash: user.passwordHash,
        lastActive: new Date(user.lastActive),
      },
      create: {
        uuid: user.id,
        username: user.username,
        email: user.email,
        passwordHash: user.passwordHash,
        registeredAt: new Date(user.registeredAt || new Date()),
        lastActive: new Date(user.lastActive),
      },
    });

    await prismaAny.userPreference.upsert({
      where: { userId: savedUser.uuid },
      update: { settings: syncData },
      create: { userId: savedUser.uuid, settings: syncData }
    });
  }

  public async upsertUserFromClient(payload: { id: string; username?: string; email?: string; registeredAt?: string; settings?: any; config?: any }) {
    const now = new Date();

    // Check duplication by email if provided
    let existingUser = null;
    if (payload.email) {
      existingUser = await prisma.user.findUnique({
        where: { email: payload.email }
      }) as any;
    }
    if (!existingUser) {
      existingUser = await prisma.user.findUnique({
        where: { uuid: payload.id }
      }) as any;
    }

    if (existingUser) {
      existingUser.preference = await prismaAny.userPreference.findUnique({ where: { userId: existingUser.uuid } });
    }

    const syncData = payload.config || {};
    if (payload.settings) {
      syncData.settings = payload.settings;
      // Dual-write strategy: Also merge settings to root for compatibility with flat-config clients
      try {
        const { settings: _ignored, ...flatSettings } = payload.settings;
        Object.assign(syncData, flatSettings);
      } catch (e) {
        // Ignore parsing errors if settings is not object
      }
    }

    logger.info(`[Sync] Upserting user ${payload.id}. HasSettings=${!!payload.settings} HasConfig=${!!payload.config}`);

    let userObj;
    if (existingUser) {
      // Update User
      userObj = await prisma.user.update({
        where: { id: existingUser.id }, // Use internal Int ID
        data: {
          username: payload.username || existingUser.username,
          email: payload.email || existingUser.email,
          lastActive: now,
        }
      }) as any;

      const existingSettingsObj = (existingUser as any).preference?.settings || {};

      userObj.preference = await prismaAny.userPreference.upsert({
        where: { userId: userObj.uuid },
        update: { settings: { ...(existingSettingsObj as object), ...syncData } },
        create: { userId: userObj.uuid, settings: { ...(existingSettingsObj as object), ...syncData } }
      }) as any;

      return this.mapDbUserToUser(userObj);
    } else {
      // Create User
      userObj = await prisma.user.create({
        data: {
          uuid: payload.id,
          username: payload.username || payload.id,
          email: payload.email,
          registeredAt: payload.registeredAt ? new Date(payload.registeredAt) : now,
          lastActive: now,
        }
      });

      userObj = Object.assign({}, userObj, {
        preference: await prismaAny.userPreference.create({
          data: { userId: userObj.uuid, settings: syncData }
        })
      });

      return this.mapDbUserToUser(userObj);
    }
  }

  // Feeds
  public async getFeeds(): Promise<Feed[]> {
    const sources = await prisma.rSSSource.findMany({
      include: {
        _count: { select: { articles: true, users: true } },
      },
    });
    return sources.map((s: any) => ({
      id: String(s.id), // Use Int ID as string
      url: s.url,
      name: s.name,
      category: s.category,
      description: s.description || undefined,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt.toISOString(),
      refreshIntervalSeconds: s.refreshIntervalSeconds ?? undefined,
      refreshCron: s.refreshCron ?? undefined,
      lastRefreshAt: s.lastFetchAt?.toISOString(),
      lastRefreshStatus: (s.errorCount && s.lastErrorMessage) ? 'error' : 'ok',
      lastRefreshError: s.lastErrorMessage || undefined,
      articleCount: s._count?.articles ?? 0,
      subscriberCount: s._count?.users ?? 0,
      isPublic: s.isPublic,
    }));
  }

  public async getFeedsLight(): Promise<Feed[]> {
    const sources = await prisma.rSSSource.findMany({
      select: {
        id: true,
        url: true,
        name: true,
        category: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        refreshIntervalSeconds: true,
        refreshCron: true,
        lastFetchAt: true,
        isPublic: true,
        errorCount: true,
        lastErrorMessage: true,
      },
    });

    return sources.map((s: any) => ({
      id: String(s.id),
      url: s.url,
      name: s.name,
      category: s.category,
      description: s.description || undefined,
      isActive: s.isActive !== false,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt.toISOString(),
      refreshIntervalSeconds: s.refreshIntervalSeconds ?? undefined,
      refreshCron: s.refreshCron ?? undefined,
      lastRefreshAt: s.lastFetchAt?.toISOString(),
      lastRefreshStatus: (s.errorCount && s.lastErrorMessage) ? 'error' : 'ok',
      lastRefreshError: s.lastErrorMessage || undefined,
      isPublic: s.isPublic,
    }));
  }

  public async getFeedsForUser(userId: string): Promise<Feed[]> {
    const userFeeds = await prisma.userFeed.findMany({
      where: { userId: userId },
      include: { source: { include: { _count: { select: { articles: true, users: true } } } } }
    });
    return userFeeds.map((uf: any) => ({
      id: String(uf.source.id),
      url: uf.source.url,
      name: uf.customName || uf.source.name,         // Prefer user's custom name
      category: uf.customCategory || uf.source.category, // Prefer user's custom category
      description: uf.source.description || undefined,
      isPublic: uf.source.isPublic,
      createdAt: uf.source.createdAt,
      updatedAt: uf.source.updatedAt.toISOString(),
      refreshIntervalSeconds: uf.source.refreshIntervalSeconds ?? undefined,
      refreshCron: uf.source.refreshCron ?? undefined,
      lastRefreshAt: uf.source.lastFetchAt?.toISOString(),
      articleCount: uf.source._count?.articles ?? 0,
      subscriberCount: uf.source._count?.users ?? 0,
    }));
  }

  public async getUsersForFeed(feedId: string): Promise<User[]> {
    const sourceId = parseInt(feedId);
    if (isNaN(sourceId)) return [];
    const links = await prisma.userFeed.findMany({
      where: { sourceId },
      include: { user: true },
    });
    return links.map((l: any) => this.mapDbUserToUser(l.user));
  }

  public async upsertFeedsFromClient(userId: string, feeds: any[]) {
    const results: Feed[] = [];

    // Ensure user exists
    const user = await prisma.user.findUnique({ where: { uuid: userId } });
    if (!user) return [];

    for (const f of feeds) {
      if (!f.url) continue;
      const normalizedUrl = this.normalizeUrl(f.url);

      const incomingDescriptionRaw = typeof f.description === 'string' ? f.description.trim() : '';
      if (incomingDescriptionRaw) {
        const existingDesc = await prisma.rSSSource.findUnique({
          where: { url: normalizedUrl },
          select: { id: true, description: true },
        });
        if (existingDesc?.id && !String(existingDesc.description || '').trim()) {
          await prisma.rSSSource.update({
            where: { id: existingDesc.id },
            data: { description: incomingDescriptionRaw },
          });
        }
      }

      // Upsert Source (Global Pool)
      const source = await prisma.rSSSource.upsert({
        where: { url: normalizedUrl },
        update: {
          // DO NOT UPDATE NAME/CATEGORY HERE! It overwrites the global pool!
          // We only create it if it doesn't exist.
        },
        create: {
          url: normalizedUrl,
          name: f.name || normalizedUrl,
          category: f.category || 'General',
          description: incomingDescriptionRaw || null,
          isPublic: false, // Default to false for user-added sources
        }
      });

      // Link to User with their custom overrides
      const uf = await prisma.userFeed.upsert({
        where: {
          userId_sourceId: {
            userId: userId,
            sourceId: source.id
          }
        },
        update: {
          customName: f.name || null,
          customCategory: f.category || null,
        },
        create: {
          userId: userId,
          sourceId: source.id,
          customName: f.name || null,
          customCategory: f.category || null,
        }
      });

      results.push({
        id: String(source.id),
        url: source.url,
        name: uf.customName || source.name,
        category: uf.customCategory || source.category,
        description: source.description || undefined,
        isPublic: source.isPublic,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt.toISOString(),
      } as any);
    }
    return results;
  }

  public async replaceUserFeedsFromClient(userId: string, feeds: any[]): Promise<{ upserted: number; deleted: number }> {
    // Ensure user exists
    const user = await prisma.user.findUnique({ where: { uuid: userId } });
    if (!user) return { upserted: 0, deleted: 0 };

    const desiredUrls = new Set<string>();
    for (const f of feeds || []) {
      if (!f || !f.url) continue;
      const normalizedUrl = this.normalizeUrl(f.url);
      if (normalizedUrl) desiredUrls.add(normalizedUrl);
    }

    const upsertedFeeds = await this.upsertFeedsFromClient(
      userId,
      Array.from(desiredUrls).map((u) => {
        const raw = (feeds || []).find((x: any) => this.normalizeUrl(x?.url) === u) || {};
        return { ...raw, url: u };
      }),
    );

    const links = await prisma.userFeed.findMany({
      where: { userId },
      include: { source: { select: { id: true, url: true } } },
    });

    const toDeleteSourceIds: number[] = [];
    for (const l of links as any[]) {
      const url = String(l?.source?.url || '');
      const keep = desiredUrls.has(url);
      if (!keep && typeof l?.source?.id === 'number') {
        toDeleteSourceIds.push(l.source.id);
      }
    }

    let deleted = 0;
    if (toDeleteSourceIds.length > 0) {
      const res = await prisma.userFeed.deleteMany({
        where: { userId, sourceId: { in: toDeleteSourceIds } },
      });
      deleted = res.count || 0;
    }

    return { upserted: upsertedFeeds.length, deleted };
  }

  public async getPublicFeeds(): Promise<Feed[]> {
    const sources = await prisma.rSSSource.findMany({
      where: { isPublic: true },
      include: {
        _count: {
          select: { articles: true, users: true }
        }
      },
      orderBy: {
        users: {
          _count: 'desc'
        }
      }
    });
    return sources.map((s: any) => ({
      id: String(s.id),
      url: s.url,
      name: s.name,
      category: s.category,
      description: s.description || undefined,
      isPublic: s.isPublic,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt.toISOString(),
      refreshIntervalSeconds: s.refreshIntervalSeconds ?? undefined,
      refreshCron: s.refreshCron ?? undefined,
      lastRefreshAt: s.lastFetchAt?.toISOString(),
      articleCount: s._count?.articles ?? 0,
      subscriberCount: s._count?.users ?? 0,
    }));
  }

  public async getPublicFeedByUrl(url: string): Promise<Feed | null> {
    const normalizedUrl = this.normalizeUrl(url);
    if (!normalizedUrl) return null;
    const source = await prisma.rSSSource.findFirst({
      where: { url: normalizedUrl, isPublic: true },
      include: {
        _count: { select: { articles: true, users: true } },
      },
    });
    if (!source) return null;
    return {
      id: String((source as any).id),
      url: (source as any).url,
      name: (source as any).name,
      category: (source as any).category,
      description: (source as any).description || undefined,
      isPublic: (source as any).isPublic,
      createdAt: (source as any).createdAt,
      updatedAt: (source as any).updatedAt.toISOString(),
      refreshIntervalSeconds: (source as any).refreshIntervalSeconds ?? undefined,
      refreshCron: (source as any).refreshCron ?? undefined,
      lastRefreshAt: (source as any).lastFetchAt?.toISOString(),
      articleCount: (source as any)._count?.articles ?? 0,
      subscriberCount: (source as any)._count?.users ?? 0,
    } as any;
  }

  public async updateFeedRefreshState(feedId: string, data: { lastRefreshAt: string; status: 'ok' | 'error'; error?: string }) {
    // feedId might be stringified Int or legacy string
    // If it's number, use ID. If not, try to find by URL? 
    // The system now uses Int IDs for sources.
    const id = parseInt(feedId);
    if (isNaN(id)) return; // Can't update if ID is legacy string hash not in DB

    await prisma.rSSSource.update({
      where: { id },
      data: {
        lastFetchAt: new Date(data.lastRefreshAt),
        ...(data.status === 'ok'
          ? { errorCount: 0, lastErrorMessage: null }
          : {
            errorCount: { increment: 1 },
            lastErrorMessage: (data.error ? String(data.error).slice(0, 500) : 'Unknown error'),
          }),
      }
    });
  }

  // Articles
  public async storeCanonicalArticlesForSource(sourceUrl: string, articles: Omit<Article, 'id'>[]) {
    const normalizedUrl = this.normalizeUrl(sourceUrl);
    const source = await prisma.rSSSource.findUnique({ where: { url: normalizedUrl } });

    if (!source) {
      // Should ensure source exists
      // But usually it should
      return { upsertsCount: 0, latestBlockId: 0 };
    }

    let upsertsCount = 0;
    let maxId = 0;
    const seenDedupKeys = new Set<string>();

    for (const a of articles) {
      if (!a.url) continue;

      const normalizedArticleUrl = this.normalizeArticleUrl(a.url);
      if (!normalizedArticleUrl) continue;

      const dedupSuffixes = this.buildArticleDedupSuffixes(normalizedArticleUrl);
      const localKey = dedupSuffixes[0] || normalizedArticleUrl;
      if (seenDedupKeys.has(localKey)) {
        continue;
      }
      seenDedupKeys.add(localKey);

      if (dedupSuffixes.length > 0) {
        const existing = await prisma.article.findFirst({
          where: {
            sourceId: source.id,
            OR: dedupSuffixes.map(suffix => ({ url: { endsWith: suffix } })),
          },
          select: { id: true, url: true },
        });
        if (existing && existing.url !== normalizedArticleUrl) {
          continue;
        }
      }

      // Upsert Article
      // Using upsert to handle updates
      const saved = await prisma.article.upsert({
        where: { url: normalizedArticleUrl },
        update: {}, // Don't overwrite existing content to save perf, or maybe update?
        create: {
          url: normalizedArticleUrl,
          title: a.title || 'No Title',
          content: a.content || '',
          summary: a.summary,
          author: a.author,
          publishedAt: a.publishedAt ? new Date(a.publishedAt) : new Date(),
          imageUrl: a.imageUrl,
          sourceId: source.id,
          // Correctly map wordCount and readingTime from the parsed article
          wordCount: (a as any).wordCount || 0,
          readingTime: a.readingTime || 0,
        }
      });

      upsertsCount++;
      if (saved.id > maxId) maxId = saved.id;
    }

    return {
      upsertsCount,
      latestBlockId: maxId, // Use Max Article ID as the "Block ID"
    };
  }

  public async getSyncBlocksForSource(sourceUrl: string, since: number, maxBlocks: number) {
    const normalizedUrl = this.normalizeUrl(sourceUrl);
    const source = await prisma.rSSSource.findUnique({ where: { url: normalizedUrl } });

    const limit = Number.isFinite(maxBlocks) && maxBlocks > 0 ? maxBlocks : 50;

    if (!source) return { latest: 0, blocks: [], hasMore: false };

    // Fetch articles newer than `since` (Article ID)
    const rawArticles = await prisma.article.findMany({
      where: {
        sourceId: source.id,
        id: { gt: since }
      },
      orderBy: { id: 'asc' },
      take: limit * 3
    });

    if (rawArticles.length === 0) {
      return { latest: since, blocks: [], hasMore: false };
    }

    const deduped: any[] = [];
    const seen = new Set<string>();
    for (const a of rawArticles) {
      const suffixes = this.buildArticleDedupSuffixes(a.url);
      const key = suffixes[0] || a.url;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(a);
      if (deduped.length >= limit) break;
    }

    if (deduped.length === 0) {
      return { latest: since, blocks: [], hasMore: false };
    }

    const latestId = deduped[deduped.length - 1].id;
    const hasMore =
      !!(await prisma.article.findFirst({
        where: { sourceId: source.id, id: { gt: latestId } },
        select: { id: true },
      }));
    logger.request(
      '[RSS Sync] blocks',
      JSON.stringify({
        sourceUrl: sourceUrl,
        normalizedUrl,
        sourceId: source.id,
        since,
        limit,
        raw: rawArticles.length,
        deduped: deduped.length,
        latestId,
        hasMore,
      })
    );

    // Wrap as a single block
    const block: StoredSyncBlock = {
      id: latestId,
      sourceUrl: normalizedUrl,
      createdAt: new Date().toISOString(),
      upserts: deduped.map((a: any) => ({
        title: a.title,
        content: a.content,
        summary: a.summary || '',
        url: a.url,
        publishedAt: a.publishedAt,
        author: a.author || undefined,
        imageUrl: a.imageUrl || undefined,
        sourceId: source.id,
        sourceName: source.name,
        wordCount: (a as any).wordCount || 0,
        readingTime: (a as any).readingTime || 0,
        difficulty: 'intermediate',
        isRead: false,
        isFavorite: false,
        readProgress: 0,
        tags: [],
        category: source.category,
      }))
    };

    return {
      latest: latestId,
      blocks: [block],
      hasMore,
    };
  }

  public async getSyncDeliveryForSourceUser(userId: string, sourceUrl: string, maxBlocks: number) {
    const normalizedUrl = this.normalizeUrl(sourceUrl);
    const source = await prisma.rSSSource.findUnique({ where: { url: normalizedUrl } });
    const limit = Number.isFinite(maxBlocks) && maxBlocks > 0 ? maxBlocks : 50;

    if (!source) {
      return { deliveryId: null, since: 0, latest: 0, blocks: [], hasMore: false };
    }

    const cursorRow = await (prisma as any).userSourceCursor.findUnique({
      where: { userId_sourceId: { userId, sourceId: source.id } },
      select: { lastAckedArticleId: true },
    });
    const since = cursorRow?.lastAckedArticleId ?? 0;

    const rawArticles = await prisma.article.findMany({
      where: {
        sourceId: source.id,
        id: { gt: since },
      },
      orderBy: { id: 'asc' },
      take: limit * 3,
    });

    if (rawArticles.length === 0) {
      return { deliveryId: null, since, latest: since, blocks: [], hasMore: false };
    }

    const deduped: any[] = [];
    const seen = new Set<string>();
    for (const a of rawArticles) {
      const suffixes = this.buildArticleDedupSuffixes(a.url);
      const key = suffixes[0] || a.url;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(a);
      if (deduped.length >= limit) break;
    }

    if (deduped.length === 0) {
      return { deliveryId: null, since, latest: since, blocks: [], hasMore: false };
    }

    const latestId = deduped[deduped.length - 1].id;
    const hasMore =
      !!(await prisma.article.findFirst({
        where: { sourceId: source.id, id: { gt: latestId } },
        select: { id: true },
      }));

    const delivery = await (prisma as any).syncDelivery.create({
      data: {
        userId,
        sourceId: source.id,
        fromExclusiveId: since,
        toInclusiveId: latestId,
      },
      select: { id: true },
    });

    logger.request(
      '[RSS Sync] delivery',
      JSON.stringify({
        userId,
        sourceUrl,
        normalizedUrl,
        sourceId: source.id,
        since,
        limit,
        raw: rawArticles.length,
        deduped: deduped.length,
        latestId,
        hasMore,
        deliveryId: delivery.id,
      })
    );

    const block: StoredSyncBlock = {
      id: latestId,
      sourceUrl: normalizedUrl,
      createdAt: new Date().toISOString(),
      upserts: deduped.map((a: any) => ({
        title: a.title,
        content: a.content,
        summary: a.summary || '',
        url: a.url,
        publishedAt: a.publishedAt,
        author: a.author || undefined,
        imageUrl: a.imageUrl || undefined,
        sourceId: source.id,
        sourceName: source.name,
        wordCount: (a as any).wordCount || 0,
        readingTime: (a as any).readingTime || 0,
        difficulty: 'intermediate',
        isRead: false,
        isFavorite: false,
        readProgress: 0,
        tags: [],
        category: source.category,
      })),
    };

    return {
      deliveryId: delivery.id,
      since,
      latest: latestId,
      blocks: [block],
      hasMore,
    };
  }

  public async ackSyncDelivery(userId: string, deliveryId: string) {
    const now = new Date();
    const result = await prisma.$transaction(async (tx: any) => {
      const delivery = await tx.syncDelivery.findFirst({
        where: { id: deliveryId, userId },
        select: { id: true, sourceId: true, toInclusiveId: true, ackedAt: true },
      });
      if (!delivery) {
        return { ok: false, advancedTo: null as number | null };
      }
      if (delivery.ackedAt) {
        return { ok: true, advancedTo: delivery.toInclusiveId };
      }

      const existing = await tx.userSourceCursor.findUnique({
        where: { userId_sourceId: { userId, sourceId: delivery.sourceId } },
        select: { lastAckedArticleId: true },
      });
      const next = Math.max(existing?.lastAckedArticleId ?? 0, delivery.toInclusiveId);

      await tx.userSourceCursor.upsert({
        where: { userId_sourceId: { userId, sourceId: delivery.sourceId } },
        update: { lastAckedArticleId: next },
        create: { userId, sourceId: delivery.sourceId, lastAckedArticleId: next },
      });
      await tx.syncDelivery.update({
        where: { id: delivery.id },
        data: { ackedAt: now },
      });

      return { ok: true, advancedTo: next };
    });

    logger.request('[RSS Sync] ack', JSON.stringify({ userId, deliveryId, ...result }));
    return result;
  }

  // User Article States
  public async updateUserArticleStates(userId: string, states: Partial<UserArticleState>[]) {
    const user = await prisma.user.findUnique({ where: { uuid: userId } });
    if (!user) return;

    for (const s of states) {
      if (!s.articleUrl) continue;

      const article = await prisma.article.findUnique({ where: { url: s.articleUrl } });
      if (!article) continue;

      await prisma.userArticleState.upsert({
        where: {
          userId_articleId: {
            userId: userId,
            articleId: article.id
          }
        },
        update: {
          isRead: s.isRead,
          isFavorite: s.isFavorite,
          readProgress: s.readProgress,
        },
        create: {
          userId: userId,
          articleId: article.id,
          articleUrl: article.url,
          isRead: s.isRead || false,
          isFavorite: s.isFavorite || false,
          readProgress: s.readProgress || 0,
        }
      });
    }
  }

  public async getUserArticleStates(userId: string, since?: string): Promise<UserArticleState[]> {
    const where: any = { userId };
    if (since) {
      where.updatedAt = { gt: new Date(since) };
    }

    const states = await prisma.userArticleState.findMany({ where });

    // Need to map back articleUrl since we store ArticleID
    // But we need to join Article to get URL
    const statesWithUrl = await prisma.userArticleState.findMany({
      where,
      include: { article: true }
    });

    return statesWithUrl.map((s: any) => ({
      userId: s.userId,
      articleUrl: s.article.url,
      isRead: s.isRead,
      isFavorite: s.isFavorite,
      readProgress: s.readProgress,
      updatedAt: s.updatedAt.toISOString(),
    }));
  }

  // Admin / Extra
  public async deleteUser(id: string) {
    await prisma.user.delete({ where: { uuid: id } });
  }

  public async saveFeed(feed: Feed) {
    const normalizedUrl = this.normalizeUrl(feed.url);
    await prisma.rSSSource.upsert({
      where: { url: normalizedUrl },
      update: {
        name: feed.name,
        category: feed.category,
        description: feed.description === undefined ? undefined : (feed.description ?? null),
        isPublic: (feed as any).isPublic ?? false,
        lastFetchAt: feed.lastRefreshAt ? new Date(feed.lastRefreshAt) : null,
        refreshIntervalSeconds: feed.refreshIntervalSeconds === undefined ? undefined : (feed.refreshIntervalSeconds ?? null),
        refreshCron: feed.refreshCron === undefined ? undefined : (feed.refreshCron ?? null),
      },
      create: {
        url: normalizedUrl,
        name: feed.name,
        category: feed.category || 'General',
        description: feed.description || null,
        isPublic: (feed as any).isPublic ?? false,
        lastFetchAt: feed.lastRefreshAt ? new Date(feed.lastRefreshAt) : null,
        refreshIntervalSeconds: feed.refreshIntervalSeconds ?? null,
        refreshCron: feed.refreshCron ?? null,
      }
    });
  }

  public async cleanupArticles(): Promise<{
    deletedByRetention: number;
    deletedByMaxCount: number;
    deletedSyncDeliveries: number;
    deletedDailyReports: number;
  }> {
    const settings = this.getSettings();
    const retentionDays = settings.retentionDays ?? 0;
    const maxCount = settings.retentionMaxArticlesPerFeed ?? 0;
    const syncDeliveryRetentionRaw = parseInt(String(process.env.SYNC_DELIVERY_RETENTION_DAYS || ''), 10);
    const syncDeliveryRetentionDays = Number.isFinite(syncDeliveryRetentionRaw) && syncDeliveryRetentionRaw > 0 ? syncDeliveryRetentionRaw : 30;
    const dailyReportRetentionDays = settings.dailyReportRetentionDays ?? 90;

    let deletedByRetention = 0;
    let deletedByMaxCount = 0;
    let deletedSyncDeliveries = 0;
    let deletedDailyReports = 0;

    const sources = await prisma.rSSSource.findMany({ select: { id: true } });

    if (retentionDays > 0) {
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const result = await prisma.article.deleteMany({
        where: {
          sourceId: { in: sources.map((s: { id: number }) => s.id) },
          publishedAt: { lt: cutoff },
        },
      });
      deletedByRetention += result.count;
    }

    if (maxCount > 0) {
      for (const s of sources) {
        while (true) {
          const ids = await prisma.article.findMany({
            where: { sourceId: s.id },
            orderBy: { publishedAt: 'desc' },
            select: { id: true },
            skip: maxCount,
            take: 1000,
          });
          if (ids.length === 0) break;
          const result = await prisma.article.deleteMany({
            where: { id: { in: ids.map((x: { id: number }) => x.id) } },
          });
          deletedByMaxCount += result.count;
          if (ids.length < 1000) break;
        }
      }
    }

    if (syncDeliveryRetentionDays > 0) {
      const cutoff = new Date(Date.now() - syncDeliveryRetentionDays * 24 * 60 * 60 * 1000);
      const res = await prisma.syncDelivery.deleteMany({
        where: {
          ackedAt: { lt: cutoff },
        },
      });
      deletedSyncDeliveries += res.count || 0;
    }

    if (dailyReportRetentionDays > 0) {
      const cutoff = new Date(Date.now() - dailyReportRetentionDays * 24 * 60 * 60 * 1000);
      const res = await (prisma as any).dailyReport.deleteMany({
        where: {
          generatedAt: { lt: cutoff },
        },
      });
      deletedDailyReports += res?.count || 0;
    }

    return { deletedByRetention, deletedByMaxCount, deletedSyncDeliveries, deletedDailyReports };
  }

  public async deleteFeed(id: string) {
    const intId = parseInt(id);
    if (!isNaN(intId)) {
      await prisma.rSSSource.delete({ where: { id: intId } });
    }
  }

  public async getCachedArticlesForSource(sourceUrl: string, options: { limit?: number; offset?: number } = {}) {
    const normalizedUrl = this.normalizeUrl(sourceUrl);
    const source = await prisma.rSSSource.findUnique({ where: { url: normalizedUrl } });
    if (!source) return { total: 0, articles: [] };

    const total = await prisma.article.count({ where: { sourceId: source.id } });
    const rawArticles = await prisma.article.findMany({
      where: { sourceId: source.id },
      orderBy: { publishedAt: 'desc' },
      take: options.limit || 20,
      skip: options.offset || 0,
    });

    const seen = new Set<string>();
    const articles = rawArticles.filter((a: any) => {
      const suffixes = this.buildArticleDedupSuffixes(a.url);
      const key = suffixes[0] || a.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      total,
      articles: articles.map((a: any) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        summary: a.summary || '',
        url: a.url,
        publishedAt: a.publishedAt.toISOString(),
        imageUrl: a.imageUrl || undefined,
        author: a.author || undefined,
        sourceId: source.id,
        sourceName: source.name,
        wordCount: (a as any).wordCount || 0,
        readingTime: (a as any).readingTime || 0,
        difficulty: 'intermediate',
        isRead: false,
        isFavorite: false,
        readProgress: 0,
        tags: [],
        category: source.category,
      }))
    };
  }

  public async clearSourceCachedData(sourceUrl: string) {
    const normalizedUrl = this.normalizeUrl(sourceUrl);
    const source = await prisma.rSSSource.findUnique({ where: { url: normalizedUrl } });
    if (source) {
      await prisma.article.deleteMany({ where: { sourceId: source.id } });
    }
  }

  public async getArticleCacheStats() {
    const totalArticles = await prisma.article.count();
    const totalSources = await prisma.rSSSource.count();
    return {
      totalArticles,
      totalSources,
      updatedAt: new Date().toISOString(),
    };
  }

  public async getDatabaseSize(): Promise<number> {
    try {
      const result: any[] = await prisma.$queryRaw`SELECT pg_database_size(current_database()) as size`;
      if (result && result.length > 0) {
        return Number(result[0].size);
      }
      return 0;
    } catch (err) {
      logger.error('Failed to get database size:', err);
      return 0;
    }
  }

  private computeAdvisoryLockKeys(name: string): { k1: number; k2: number } {
    const buf = crypto.createHash('sha256').update(String(name || '')).digest();
    return { k1: buf.readInt32BE(0), k2: buf.readInt32BE(4) };
  }

  public async tryAcquireAdvisoryLock(name: string): Promise<boolean> {
    try {
      const { k1, k2 } = this.computeAdvisoryLockKeys(name);
      const rows: any[] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${k1}::int4, ${k2}::int4) as locked`;
      return !!rows?.[0]?.locked;
    } catch (e) {
      logger.warn(`[Lock] tryAcquireAdvisoryLock failed name=${String(name)} err=${String((e as any)?.message || e)}`);
      return true;
    }
  }

  public async releaseAdvisoryLock(name: string): Promise<void> {
    try {
      const { k1, k2 } = this.computeAdvisoryLockKeys(name);
      await prisma.$queryRaw`SELECT pg_advisory_unlock(${k1}::int4, ${k2}::int4)`;
    } catch (e) {
      logger.warn(`[Lock] releaseAdvisoryLock failed name=${String(name)} err=${String((e as any)?.message || e)}`);
    }
  }

  public getImageCacheTotalSize(): number {
    if (!fs.existsSync(this.cacheDir)) return 0;
    try {
      const files = fs.readdirSync(this.cacheDir);
      let total = 0;
      for (const file of files) {
        const full = path.join(this.cacheDir, file);
        try {
          const stat = fs.statSync(full);
          total += stat.size;
        } catch { }
      }
      return total;
    } catch (err) {
      logger.error('Failed to get image cache size:', err);
      return 0;
    }
  }

  public async cleanupImageCache(): Promise<{
    deletedByAge: number;
    deletedByCap: number;
    remainingFiles: number;
    remainingBytes: number;
  }> {
    const settings = this.getSettings();
    const maxAgeDays = settings.imageCacheMaxAgeDays ?? 0;
    const maxFiles = settings.imageCacheMaxFiles ?? 0;
    const maxBytes = settings.imageCacheMaxBytes ?? 0;

    if (maxAgeDays <= 0 && maxFiles <= 0 && maxBytes <= 0) {
      const remainingBytes = this.getImageCacheTotalSize();
      let remainingFiles = 0;
      try {
        remainingFiles = fs.existsSync(this.cacheDir) ? fs.readdirSync(this.cacheDir).length : 0;
      } catch {
        remainingFiles = 0;
      }
      return { deletedByAge: 0, deletedByCap: 0, remainingFiles, remainingBytes };
    }

    if (!fs.existsSync(this.cacheDir)) {
      return { deletedByAge: 0, deletedByCap: 0, remainingFiles: 0, remainingBytes: 0 };
    }

    const now = Date.now();
    const cutoffMs = maxAgeDays > 0 ? now - maxAgeDays * 24 * 60 * 60 * 1000 : 0;

    let deletedByAge = 0;
    let deletedByCap = 0;

    type CacheFile = { full: string; size: number; mtimeMs: number };
    let entries: CacheFile[] = [];

    try {
      const names = await fs.promises.readdir(this.cacheDir);
      const stats = await Promise.all(
        names.map(async name => {
          const full = path.join(this.cacheDir, name);
          try {
            const st = await fs.promises.stat(full);
            if (!st.isFile()) return null;
            return { full, size: st.size, mtimeMs: st.mtimeMs } satisfies CacheFile;
          } catch {
            return null;
          }
        })
      );
      entries = stats.filter(Boolean) as CacheFile[];
    } catch (err) {
      logger.error('Failed to read image cache directory:', err);
      return { deletedByAge: 0, deletedByCap: 0, remainingFiles: 0, remainingBytes: 0 };
    }

    if (maxAgeDays > 0) {
      const toDelete = entries.filter(e => e.mtimeMs < cutoffMs);
      if (toDelete.length > 0) {
        await Promise.all(
          toDelete.map(async e => {
            try {
              await fs.promises.unlink(e.full);
              deletedByAge += 1;
            } catch {
            }
          })
        );
        entries = entries.filter(e => e.mtimeMs >= cutoffMs);
      }
    }

    entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
    let totalBytes = entries.reduce((sum, e) => sum + e.size, 0);

    const enforceFiles = maxFiles > 0;
    const enforceBytes = maxBytes > 0;
    while (
      entries.length > 0 &&
      ((enforceFiles && entries.length > maxFiles) || (enforceBytes && totalBytes > maxBytes))
    ) {
      const victim = entries.shift()!;
      try {
        await fs.promises.unlink(victim.full);
        deletedByCap += 1;
        totalBytes -= victim.size;
      } catch {
      }
    }

    return {
      deletedByAge,
      deletedByCap,
      remainingFiles: entries.length,
      remainingBytes: Math.max(0, totalBytes),
    };
  }

  public async pruneArticles(days: number): Promise<number> {
    const date = new Date();
    date.setDate(date.getDate() - days);

    try {
      const result = await prisma.article.deleteMany({
        where: {
          publishedAt: {
            lt: date
          }
        }
      });
      return result.count;
    } catch (err) {
      logger.error('Failed to prune articles:', err);
      throw err;
    }
  }

  public async getRecentArticleCount(hours: number): Promise<number> {
    const date = new Date();
    date.setHours(date.getHours() - hours);
    try {
      return await prisma.article.count({
        where: {
          publishedAt: {
            gte: date
          }
        }
      });
    } catch (err) {
      logger.error('Failed to get recent article count:', err);
      return 0;
    }
  }

  // Vocabulary
  public async upsertVocabulary(word: any) {
    try {
      // Cast prisma to any to bypass type check for now since schema might not be generated yet
      await (prisma as any).vocabulary.upsert({
        where: { word: word.word },
        update: {
          definition: word.definition || undefined,
          context: word.context || undefined,
          articleId: word.articleId || undefined,
          sourceArticleId: word.sourceArticleId || undefined,
          reviewCount: word.reviewCount || undefined,
          correctCount: word.correctCount || undefined,
          masteryLevel: word.masteryLevel || undefined,
          difficulty: word.difficulty || undefined,
          updatedAt: word.updatedAt ? new Date(word.updatedAt) : new Date(),
          lastReviewedAt: word.lastReviewedAt ? new Date(word.lastReviewedAt) : undefined,
          nextReviewAt: word.nextReviewAt ? new Date(word.nextReviewAt) : undefined,
          tags: word.tags || undefined,
          notes: word.notes || undefined,
          isDeleted: word.isDeleted ?? false,
        },
        create: {
          word: word.word,
          definition: word.definition,
          context: word.context,
          articleId: word.articleId,
          sourceArticleId: word.sourceArticleId,
          reviewCount: word.reviewCount || 0,
          correctCount: word.correctCount || 0,
          masteryLevel: word.masteryLevel || 0,
          difficulty: word.difficulty || 'medium',
          addedAt: word.addedAt ? new Date(word.addedAt) : new Date(),
          updatedAt: word.updatedAt ? new Date(word.updatedAt) : new Date(),
          lastReviewedAt: word.lastReviewedAt ? new Date(word.lastReviewedAt) : undefined,
          nextReviewAt: word.nextReviewAt ? new Date(word.nextReviewAt) : new Date(),
          tags: word.tags,
          notes: word.notes,
          isDeleted: word.isDeleted ?? false,
        }
      });
    } catch (error) {
      logger.error(`Failed to upsert vocabulary word ${word.word}:`, error);
      throw error;
    }
  }

  public async getVocabularySince(since: string, limit: number = 500) {
    const date = new Date(since);
    // Find modified words (upserted or deleted)
    // Note: If deleted, we mark isDeleted=true in DB, so we just fetch all updated > since
    const words = await (prisma as any).vocabulary.findMany({
      where: {
        updatedAt: { gt: date }
      },
      orderBy: { updatedAt: 'asc' },
      take: limit
    });

    return words;
  }

  public async getVocabularyServerTime(): Promise<string> {
    // Get the latest updatedAt
    const latest = await (prisma as any).vocabulary.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    });
    return latest?.updatedAt.toISOString() || new Date().toISOString();
  }

  public pruneImages(days: number): { count: number; size: number } {
    if (!fs.existsSync(this.cacheDir)) return { count: 0, size: 0 };

    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    let deletedCount = 0;
    let deletedSize = 0;

    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        const full = path.join(this.cacheDir, file);
        try {
          const stat = fs.statSync(full);
          const ageDays = (now - stat.mtimeMs) / msPerDay;
          if (ageDays > days) {
            fs.unlinkSync(full);
            deletedCount++;
            deletedSize += stat.size;
          }
        } catch { }
      }
    } catch (err) {
      logger.error('Failed to prune images:', err);
    }
    return { count: deletedCount, size: deletedSize };
  }

  public listCachedImages(options: { limit?: number; offset?: number } = {}) {
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;
    if (!fs.existsSync(this.cacheDir)) return { total: 0, images: [] as Array<{ name: string; size: number; mtimeMs: number }> };

    const names = fs.readdirSync(this.cacheDir);
    const files = names
      .map(name => {
        const full = path.join(this.cacheDir, name);
        try {
          const stat = fs.statSync(full);
          return { name, size: stat.size, mtimeMs: stat.mtimeMs };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{ name: string; size: number; mtimeMs: number }>;

    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const slice = files.slice(offset, offset + limit);
    return { total: files.length, images: slice };
  }

  public deleteCachedImage(name: string) {
    if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
      throw new Error('Invalid file name');
    }
    const full = path.join(this.cacheDir, name);
    if (!fs.existsSync(full)) return;
    fs.unlinkSync(full);
  }

  public async clearCache(): Promise<void> {
    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      }
      logger.info('Cache cleared');
    } catch (error) {
      logger.error('Failed to clear cache:', error);
      throw error;
    }
  }

  public async clearData(): Promise<void> {
    try {
      await prisma.article.deleteMany();
      await prisma.userFeed.deleteMany();
      await prisma.rSSSource.deleteMany();
      await prisma.user.deleteMany();
      logger.info('Data cleared');
    } catch (error) {
      logger.error('Failed to clear data:', error);
      throw error;
    }
  }

  public async clearArticles(): Promise<void> {
    try {
      await prisma.article.deleteMany();
      logger.info('Articles cleared');
    } catch (error) {
      logger.error('Failed to clear articles:', error);
      throw error;
    }
  }

  public async recordLLMUsageEvent(event: {
    userId: string;
    requestId?: string;
    feature: string;
    status: string;
    provider?: string;
    model?: string;
    profileId?: string;
    cacheKey?: string;
    cacheHit?: boolean;
    durationMs: number;
    tokensTotal?: number;
    tokensPrompt?: number;
    tokensCompletion?: number;
    httpStatus?: number;
    errorType?: string;
    errorMessage?: string;
  }): Promise<void> {
    const id = crypto.randomUUID();
    const safeMessage = (() => {
      const raw = String(event.errorMessage || '').trim();
      if (!raw) return null;
      const sliced = raw.length > 500 ? raw.slice(0, 500) : raw;
      return sliced;
    })();

    try {
      await prisma.$executeRaw`
INSERT INTO "llm_usage_events" (
  "id",
  "userId",
  "requestId",
  "feature",
  "status",
  "provider",
  "model",
  "profileId",
  "cacheKey",
  "cacheHit",
  "durationMs",
  "tokensTotal",
  "tokensPrompt",
  "tokensCompletion",
  "httpStatus",
  "errorType",
  "errorMessage"
) VALUES (
  ${id},
  ${event.userId},
  ${event.requestId ?? null},
  ${event.feature},
  ${event.status},
  ${event.provider ?? null},
  ${event.model ?? null},
  ${event.profileId ?? null},
  ${event.cacheKey ?? null},
  ${event.cacheHit === true},
  ${Math.max(0, Math.floor(event.durationMs || 0))},
  ${event.tokensTotal ?? null},
  ${event.tokensPrompt ?? null},
  ${event.tokensCompletion ?? null},
  ${event.httpStatus ?? null},
  ${event.errorType ?? null},
  ${safeMessage}
)
      `;
    } catch (err) {
      logger.warn(`[LLM] failed to record usage event: ${(err as Error).message}`);
    }
  }

  public async getLLMUsageSummary(rangeDays: number): Promise<Array<{
    day: string;
    feature: string;
    requests: number;
    ok: number;
    rateLimited: number;
    cacheHits: number;
    avgMs: number;
    p95Ms: number;
    tokens: number;
  }>> {
    const days = Math.min(90, Math.max(1, Math.floor(rangeDays || 7)));
    const rows: any[] = await prisma.$queryRaw`
SELECT
  date_trunc('day', "createdAt") AS day,
  "feature" AS feature,
  COUNT(*)::int AS requests,
  SUM(CASE WHEN "status" = 'ok' THEN 1 ELSE 0 END)::int AS ok,
  SUM(CASE WHEN "status" = 'rate_limited' THEN 1 ELSE 0 END)::int AS "rateLimited",
  SUM(CASE WHEN "cacheHit" = true THEN 1 ELSE 0 END)::int AS "cacheHits",
  COALESCE(AVG("durationMs")::int, 0) AS "avgMs",
  COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "durationMs")::int, 0) AS "p95Ms",
  COALESCE(SUM(COALESCE("tokensTotal", 0))::bigint, 0)::bigint AS tokens
FROM "llm_usage_events"
WHERE "createdAt" >= (NOW() - (${days}::int * interval '1 day'))
GROUP BY 1, 2
ORDER BY 1 DESC, 2 ASC
    `;

    return rows.map((r) => ({
      day: new Date(r.day).toISOString(),
      feature: String(r.feature),
      requests: Number(r.requests || 0),
      ok: Number(r.ok || 0),
      rateLimited: Number(r.rateLimited || 0),
      cacheHits: Number(r.cacheHits || 0),
      avgMs: Number(r.avgMs || 0),
      p95Ms: Number(r.p95Ms || 0),
      tokens: Number(r.tokens || 0),
    }));
  }

  // Helpers
  private mapDbUserToUser(dbUser: any): User {
    const syncData = dbUser.preference?.settings || {};
    const configSync = syncData && typeof syncData === 'object' ? (syncData as any).configSync : undefined;
    const settingsFromConfigSync =
      configSync && typeof configSync === 'object' && (configSync as any).settings && typeof (configSync as any).settings === 'object'
        ? (configSync as any).settings
        : undefined;
    const nestedSettings = syncData && typeof syncData === 'object' ? syncData.settings : undefined;
    const rootLooksLikeSettings =
      syncData &&
      typeof syncData === 'object' &&
      (Object.prototype.hasOwnProperty.call(syncData, 'appSettings') ||
        Object.prototype.hasOwnProperty.call(syncData, 'readingSettings') ||
        Object.prototype.hasOwnProperty.call(syncData, 'sync'));
    const settingsRaw = settingsFromConfigSync || nestedSettings || (rootLooksLikeSettings ? syncData : undefined);
    const settings =
      settingsRaw && typeof settingsRaw === 'object'
        ? (() => {
          const cloned: any = { ...(settingsRaw as any) };
          if (cloned.appSettings && typeof cloned.appSettings === 'object') {
            cloned.appSettings = { ...cloned.appSettings };
            if ('sync' in cloned.appSettings) {
              delete cloned.appSettings.sync;
            }
          }
          if ('sync' in cloned) {
            delete cloned.sync;
          }
          return cloned;
        })()
        : settingsRaw;

    return {
      id: dbUser.uuid,
      username: dbUser.username,
      email: dbUser.email || undefined,
      passwordHash: dbUser.passwordHash || undefined,
      registeredAt: dbUser.registeredAt.toISOString(),
      lastActive: dbUser.lastActive.toISOString(),
      config: syncData,
      settings: settings,
      feedCount: dbUser._count?.feeds ?? undefined,
    };
  }


}

export const storageService = StorageService.getInstance();
