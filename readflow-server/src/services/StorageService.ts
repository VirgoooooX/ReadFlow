import { PrismaClient } from '.prisma/client';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/Logger';
import { Article } from '../types';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  log: ['warn', 'error'],
});

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
  retentionDays?: number;
  retentionMaxArticlesPerFeed?: number;
  cleanupIntervalHours?: number;
  syncPageSizeDefault?: number;
  syncPageSizeMax?: number;
  dailyReportSystemPrompt?: string;
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
      retentionDays: 0,
      retentionMaxArticlesPerFeed: 0,
      cleanupIntervalHours: 24,
      syncPageSizeDefault: 200,
      syncPageSizeMax: 2000,
      adminPassword: process.env.ADMIN_PASSWORD || 'admin',
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
      this.settingsInitialized = true;
    } catch (error) {
      this.settingsInitialized = true;
      logger.error('Failed to init server settings from DB:', error);
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
    return out;
  }

  // Users
  public async getUsers(): Promise<User[]> {
    const users = await prisma.user.findMany({
      include: {
        _count: { select: { feeds: true } },
      },
    });
    return users.map(this.mapDbUserToUser);
  }

  public async getUserById(id: string): Promise<User | undefined> {
    const user = await prisma.user.findUnique({ where: { uuid: id } });
    if (!user) return undefined;
    return this.mapDbUserToUser(user);
  }

  public async findUserByEmail(email: string): Promise<User | undefined> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return undefined;
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

    await prisma.user.upsert({
      where: { uuid: user.id },
      update: {
        username: user.username,
        email: user.email,
        passwordHash: user.passwordHash,
        lastActive: new Date(user.lastActive),
        syncData: syncData,
      },
      create: {
        uuid: user.id,
        username: user.username,
        email: user.email,
        passwordHash: user.passwordHash,
        registeredAt: new Date(user.registeredAt || new Date()),
        lastActive: new Date(user.lastActive),
        syncData: syncData,
      },
    });
  }

  public async upsertUserFromClient(payload: { id: string; username?: string; email?: string; registeredAt?: string; settings?: any; config?: any }) {
    const now = new Date();

    // Check duplication by email if provided
    let existingUser = null;
    if (payload.email) {
      existingUser = await prisma.user.findUnique({ where: { email: payload.email } });
    }
    if (!existingUser) {
      existingUser = await prisma.user.findUnique({ where: { uuid: payload.id } });
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

    if (existingUser) {
      // Update
      const updated = await prisma.user.update({
        where: { id: existingUser.id }, // Use internal Int ID
        data: {
          username: payload.username || existingUser.username,
          email: payload.email || existingUser.email,
          syncData: { ...(existingUser.syncData as object), ...syncData }, // Merge
          lastActive: now,
        }
      });
      return this.mapDbUserToUser(updated);
    } else {
      // Create
      const created = await prisma.user.create({
        data: {
          uuid: payload.id,
          username: payload.username || payload.id,
          email: payload.email,
          registeredAt: payload.registeredAt ? new Date(payload.registeredAt) : now,
          lastActive: now,
          syncData: syncData,
        }
      });
      return this.mapDbUserToUser(created);
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
      lastRefreshStatus: 'ok', // Simplified
      lastRefreshError: undefined,
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
        createdAt: true,
        updatedAt: true,
        refreshIntervalSeconds: true,
        refreshCron: true,
        lastFetchAt: true,
        isPublic: true,
      },
    });

    return sources.map((s: any) => ({
      id: String(s.id),
      url: s.url,
      name: s.name,
      category: s.category,
      description: s.description || undefined,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt.toISOString(),
      refreshIntervalSeconds: s.refreshIntervalSeconds ?? undefined,
      refreshCron: s.refreshCron ?? undefined,
      lastRefreshAt: s.lastFetchAt?.toISOString(),
      lastRefreshStatus: 'ok',
      lastRefreshError: undefined,
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
          description: f.description || null,
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
        // We don't store error status in DB currently to keep it simple, or add fields to RSSSource
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

  public async cleanupArticles(): Promise<{ deletedByRetention: number; deletedByMaxCount: number }> {
    const settings = this.getSettings();
    const retentionDays = settings.retentionDays ?? 0;
    const maxCount = settings.retentionMaxArticlesPerFeed ?? 0;

    let deletedByRetention = 0;
    let deletedByMaxCount = 0;

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

    return { deletedByRetention, deletedByMaxCount };
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

  // Helpers
  private mapDbUserToUser(dbUser: any): User {
    const syncData = (dbUser.syncData as any) || {};
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
