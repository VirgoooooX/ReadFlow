import fs from 'fs';
import path from 'path';
import { logger } from '../utils/Logger';
import { Article } from '../types';
import { simpleHash } from '../utils/RSSUtils';

export interface ServerSettings {
  imageQuality: number;
  adminPassword?: string; // Simple auth
  rssRefreshIntervalSeconds?: number;
  rssMaxArticlesPerFeed?: number;
  rssSyncMaxBlocksPerFeed?: number;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  passwordHash?: string; // Add password support
  registeredAt?: string;
  lastActive: string | Date;
  settings?: any;
}

export interface Feed {
  id: string;
  url: string;
  name: string;
  category: string;
  createdAt: string | Date;
  updatedAt?: string;
  refreshIntervalSeconds?: number;
  lastRefreshAt?: string;
  lastRefreshStatus?: 'ok' | 'error';
  lastRefreshError?: string;
}

export interface UserFeedLink {
  userId: string;
  feedId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserArticleState {
  userId: string;
  articleUrl: string; // Use URL as key to match across devices/feeds
  isRead: boolean;
  isFavorite: boolean;
  readProgress: number;
  updatedAt: string;
}

interface StoredFeedArticle {
  key: string;
  sourceUrl: string;
  fingerprint: number;
  updatedAt: string;
  article: Omit<Article, 'id'>;
}

interface StoredSyncBlock {
  id: number;
  sourceUrl: string;
  createdAt: string;
  upserts: Omit<Article, 'id'>[];
}

interface StoredArticlesFile {
  version: 1;
  updatedAt: string;
  articlesByKey: Record<string, StoredFeedArticle>;
}

interface StoredSyncBlocksFile {
  version: 1;
  updatedAt: string;
  latestBySourceUrl: Record<string, number>;
  blocksBySourceUrl: Record<string, StoredSyncBlock[]>;
}

export class StorageService {
  private static instance: StorageService;
  private dataDir: string;
  private cacheDir: string;
  
  private settingsFile: string;
  private usersFile: string;
  private feedsFile: string;
  private userFeedsFile: string;
  private articlesFile: string;
  private syncBlocksFile: string;
  private userArticleStatesFile: string; // New file for storing user article states

  private settings: ServerSettings;
  private users: User[];
  private feeds: Feed[];
  private userFeeds: UserFeedLink[];
  private storedArticles: StoredArticlesFile;
  private storedSyncBlocks: StoredSyncBlocksFile;
  private userArticleStates: Record<string, UserArticleState[]>; // In-memory cache: userId -> states

  private constructor() {
    this.dataDir = path.join(process.cwd(), 'data');
    this.cacheDir = path.join(process.cwd(), 'public', 'cache');
    
    this.settingsFile = path.join(this.dataDir, 'settings.json');
    this.usersFile = path.join(this.dataDir, 'users.json');
    this.feedsFile = path.join(this.dataDir, 'feeds.json');
    this.userFeedsFile = path.join(this.dataDir, 'userFeeds.json');
    this.articlesFile = path.join(this.dataDir, 'articles.json');
    this.syncBlocksFile = path.join(this.dataDir, 'syncBlocks.json');
    this.userArticleStatesFile = path.join(this.dataDir, 'userArticleStates.json'); // Init path

    this.initDirectories();
    this.settings = this.loadSettings();
    this.users = this.loadUsers();
    this.feeds = this.loadFeeds();
    this.userFeeds = this.loadUserFeeds();
    this.migrateLegacyFeedsAndLinks();
    this.storedArticles = this.loadStoredArticles();
    this.storedSyncBlocks = this.loadStoredSyncBlocks();
    this.userArticleStates = this.loadUserArticleStates(); // Load states
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private initDirectories() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
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

  private migrateLegacyFeedsAndLinks() {
    let changed = false;
    const canonicalByUrl = new Map<string, Feed>();

    for (const feed of this.feeds) {
      const url = this.normalizeUrl(feed?.url || '');
      if (!url) continue;
      const id = String(simpleHash(url));
      const existing = canonicalByUrl.get(url);
      const nowIso = new Date().toISOString();

      const merged: Feed = {
        id,
        url,
        name: feed.name || existing?.name || url,
        category: feed.category || existing?.category || 'General',
        createdAt: existing?.createdAt || feed.createdAt || nowIso,
        updatedAt: feed.updatedAt || existing?.updatedAt || nowIso,
        refreshIntervalSeconds: feed.refreshIntervalSeconds ?? existing?.refreshIntervalSeconds,
        lastRefreshAt: feed.lastRefreshAt || existing?.lastRefreshAt,
        lastRefreshStatus: feed.lastRefreshStatus || existing?.lastRefreshStatus,
        lastRefreshError: feed.lastRefreshError || existing?.lastRefreshError,
      };

      canonicalByUrl.set(url, merged);

      const legacyOwner = (feed as any)?.ownerUserId;
      if (legacyOwner) {
        this.ensureUserFeedLink(String(legacyOwner), id, nowIso);
        changed = true;
      }

      if (feed.id !== id || feed.url !== url) changed = true;
    }

    if (changed) {
      this.feeds = Array.from(canonicalByUrl.values());
      this.persistFeeds();
      this.persistUserFeeds();
    }
  }

  // Settings
  private loadSettings(): ServerSettings {
    try {
      if (fs.existsSync(this.settingsFile)) {
        const data = fs.readFileSync(this.settingsFile, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('Failed to load settings:', error);
    }
    return { imageQuality: 80, rssRefreshIntervalSeconds: 900, rssMaxArticlesPerFeed: 20, rssSyncMaxBlocksPerFeed: 200 };
  }

  public getSettings(): ServerSettings {
    return { ...this.settings };
  }

  public saveSettings(newSettings: Partial<ServerSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings, null, 2));
  }

  private loadStoredArticles(): StoredArticlesFile {
    const fallback: StoredArticlesFile = { version: 1, updatedAt: new Date().toISOString(), articlesByKey: {} };
    try {
      if (!fs.existsSync(this.articlesFile)) return fallback;
      const parsed = JSON.parse(fs.readFileSync(this.articlesFile, 'utf-8')) as StoredArticlesFile;
      if (!parsed || parsed.version !== 1 || !parsed.articlesByKey) return fallback;
      return parsed;
    } catch (error) {
      logger.error('Failed to load stored articles:', error);
      return fallback;
    }
  }

  private persistStoredArticles() {
    this.storedArticles.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.articlesFile, JSON.stringify(this.storedArticles, null, 2));
  }

  private loadStoredSyncBlocks(): StoredSyncBlocksFile {
    const fallback: StoredSyncBlocksFile = {
      version: 1,
      updatedAt: new Date().toISOString(),
      latestBySourceUrl: {},
      blocksBySourceUrl: {},
    };
    try {
      if (!fs.existsSync(this.syncBlocksFile)) return fallback;
      const parsed = JSON.parse(fs.readFileSync(this.syncBlocksFile, 'utf-8')) as StoredSyncBlocksFile;
      if (!parsed || parsed.version !== 1 || !parsed.latestBySourceUrl || !parsed.blocksBySourceUrl) return fallback;
      return parsed;
    } catch (error) {
      logger.error('Failed to load sync blocks:', error);
      return fallback;
    }
  }

  private persistStoredSyncBlocks() {
    this.storedSyncBlocks.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.syncBlocksFile, JSON.stringify(this.storedSyncBlocks, null, 2));
  }

  private buildArticleKey(sourceUrl: string, url: string): string {
    return `${sourceUrl}::${url}`;
  }

  private computeFingerprint(article: Omit<Article, 'id'>): number {
    const contentSlice = (article.content || '').slice(0, 5000);
    const s = `${article.title}|${article.publishedAt}|${article.summary}|${article.author || ''}|${article.imageUrl || ''}|${contentSlice}`;
    return simpleHash(s).valueOf();
  }

  public storeCanonicalArticlesForSource(sourceUrl: string, articles: Omit<Article, 'id'>[]) {
    const maxArticles = this.settings.rssMaxArticlesPerFeed ?? 20;
    const trimmed = maxArticles > 0 ? articles.slice(0, maxArticles) : articles;

    const upserts: Omit<Article, 'id'>[] = [];
    const nowIso = new Date().toISOString();

    for (const article of trimmed) {
      if (!article?.url) continue;
      const key = this.buildArticleKey(sourceUrl, article.url);
      const fingerprint = this.computeFingerprint(article);

      const existing = this.storedArticles.articlesByKey[key];
      if (!existing || existing.fingerprint !== fingerprint) {
        this.storedArticles.articlesByKey[key] = {
          key,
          sourceUrl,
          fingerprint,
          updatedAt: nowIso,
          article,
        };
        upserts.push(article);
      }
    }

    if (upserts.length > 0) {
      const currentLatest = this.storedSyncBlocks.latestBySourceUrl[sourceUrl] || 0;
      const nextId = currentLatest + 1;
      const block: StoredSyncBlock = {
        id: nextId,
        sourceUrl,
        createdAt: nowIso,
        upserts,
      };

      const blocks = this.storedSyncBlocks.blocksBySourceUrl[sourceUrl] || [];
      blocks.push(block);

      const maxBlocks = this.settings.rssSyncMaxBlocksPerFeed ?? 200;
      const trimmedBlocks = maxBlocks > 0 && blocks.length > maxBlocks ? blocks.slice(blocks.length - maxBlocks) : blocks;

      this.storedSyncBlocks.blocksBySourceUrl[sourceUrl] = trimmedBlocks;
      this.storedSyncBlocks.latestBySourceUrl[sourceUrl] = nextId;

      this.persistStoredArticles();
      this.persistStoredSyncBlocks();
    } else {
      this.persistStoredArticles();
    }

    return {
      upsertsCount: upserts.length,
      latestBlockId: this.storedSyncBlocks.latestBySourceUrl[sourceUrl] || 0,
    };
  }

  public getSyncBlocksForSource(sourceUrl: string, since: number, maxBlocks: number) {
    const latest = this.storedSyncBlocks.latestBySourceUrl[sourceUrl] || 0;
    const blocks = this.storedSyncBlocks.blocksBySourceUrl[sourceUrl] || [];
    const filtered = blocks.filter(b => b.id > since);
    const limited = maxBlocks > 0 ? filtered.slice(0, maxBlocks) : filtered;
    return { latest, blocks: limited };
  }

  public getCachedArticlesForSource(sourceUrl: string, options: { limit?: number; offset?: number } = {}) {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    const all = Object.values(this.storedArticles.articlesByKey)
      .filter(v => v.sourceUrl === sourceUrl)
      .map(v => v.article);

    all.sort((a, b) => Date.parse(String(b.publishedAt)) - Date.parse(String(a.publishedAt)));
    const slice = all.slice(offset, offset + limit);
    return { total: all.length, articles: slice };
  }

  public clearSourceCachedData(sourceUrl: string) {
    const keys = Object.keys(this.storedArticles.articlesByKey);
    for (const key of keys) {
      if (this.storedArticles.articlesByKey[key]?.sourceUrl === sourceUrl) {
        delete this.storedArticles.articlesByKey[key];
      }
    }

    delete this.storedSyncBlocks.blocksBySourceUrl[sourceUrl];
    delete this.storedSyncBlocks.latestBySourceUrl[sourceUrl];

    this.persistStoredArticles();
    this.persistStoredSyncBlocks();
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

  public getArticleCacheStats() {
    const entries = Object.values(this.storedArticles.articlesByKey);
    const sources = new Set(entries.map(e => e.sourceUrl));
    return {
      totalArticles: entries.length,
      totalSources: sources.size,
      updatedAt: this.storedArticles.updatedAt,
    };
  }

  // Users
  private loadUsers(): User[] {
    try {
      if (fs.existsSync(this.usersFile)) {
        return JSON.parse(fs.readFileSync(this.usersFile, 'utf-8'));
      }
    } catch (error) {
      logger.error('Failed to load users:', error);
    }
    return [];
  }

  public getUsers(): User[] {
    return [...this.users];
  }

  public saveUser(user: User) {
    const index = this.users.findIndex(u => u.id === user.id);
    if (index >= 0) {
      this.users[index] = user;
    } else {
      this.users.push(user);
    }
    this.persistUsers();
  }

  public upsertUserFromClient(payload: { id: string; username?: string; email?: string; registeredAt?: string; settings?: any }) {
    const nowIso = new Date().toISOString();
    const email = payload.email ? String(payload.email).trim().toLowerCase() : undefined;
    const byEmail = email ? this.users.find(u => (u.email || '').toLowerCase() === email) : undefined;
    const byId = this.users.find(u => u.id === payload.id);

    if (byEmail && byId && byEmail.id !== byId.id) {
      const merged: User = {
        ...byEmail,
        username: byEmail.username || byId.username,
        registeredAt: byEmail.registeredAt || byId.registeredAt,
        settings: byEmail.settings ?? byId.settings,
        lastActive: nowIso,
      };
      this.users = this.users.filter(u => u.id !== byId.id);
      this.saveUser(merged);
      this.reassignUserLinks(byId.id, byEmail.id);
    }

    const existing = byEmail || byId;
    const id = existing?.id || (email ? email : payload.id); // Prefer email as ID if not existing

    const next: User = {
      id,
      username: payload.username || existing?.username || id,
      email: email || existing?.email,
      passwordHash: existing?.passwordHash, // Preserve password
      registeredAt: payload.registeredAt || existing?.registeredAt || nowIso,
      lastActive: nowIso,
      settings: payload.settings ?? existing?.settings,
    };

    this.saveUser(next);
    return next;
  }

  // Auth Helpers
  public findUserByEmail(email: string): User | undefined {
    if (!email) return undefined;
    const normalized = email.trim().toLowerCase();
    return this.users.find(u => (u.email || '').toLowerCase() === normalized);
  }

  public createUser(user: User): User {
    // Check duplication by email
    if (user.email) {
      const existing = this.findUserByEmail(user.email);
      if (existing) throw new Error('User with this email already exists');
    }
    this.saveUser(user);
    return user;
  }

  public deleteUser(id: string) {
    this.users = this.users.filter(u => u.id !== id);
    this.persistUsers();
    this.userFeeds = this.userFeeds.filter(l => l.userId !== id);
    this.persistUserFeeds();
  }

  private persistUsers() {
    fs.writeFileSync(this.usersFile, JSON.stringify(this.users, null, 2));
  }

  private loadUserFeeds(): UserFeedLink[] {
    try {
      if (fs.existsSync(this.userFeedsFile)) {
        const parsed = JSON.parse(fs.readFileSync(this.userFeedsFile, 'utf-8'));
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (error) {
      logger.error('Failed to load user feeds:', error);
    }
    return [];
  }

  private persistUserFeeds() {
    fs.writeFileSync(this.userFeedsFile, JSON.stringify(this.userFeeds, null, 2));
  }

  private ensureUserFeedLink(userId: string, feedId: string, nowIso?: string) {
    const atIso = nowIso || new Date().toISOString();
    const existing = this.userFeeds.find(l => l.userId === userId && l.feedId === feedId);
    if (existing) {
      existing.updatedAt = atIso;
      return;
    }
    this.userFeeds.push({ userId, feedId, createdAt: atIso, updatedAt: atIso });
  }

  private reassignUserLinks(fromUserId: string, toUserId: string) {
    let changed = false;
    for (const link of this.userFeeds) {
      if (link.userId === fromUserId) {
        link.userId = toUserId;
        link.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) {
      const dedup = new Map<string, UserFeedLink>();
      for (const l of this.userFeeds) {
        const key = `${l.userId}::${l.feedId}`;
        const existing = dedup.get(key);
        if (!existing) {
          dedup.set(key, l);
        } else if (Date.parse(l.updatedAt) > Date.parse(existing.updatedAt)) {
          dedup.set(key, l);
        }
      }
      this.userFeeds = Array.from(dedup.values());
      this.persistUserFeeds();
    }
  }

  // User Article States
  private loadUserArticleStates(): Record<string, UserArticleState[]> {
    try {
      if (fs.existsSync(this.userArticleStatesFile)) {
        const data = fs.readFileSync(this.userArticleStatesFile, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('Failed to load user article states:', error);
    }
    return {};
  }

  private persistUserArticleStates() {
    fs.writeFileSync(this.userArticleStatesFile, JSON.stringify(this.userArticleStates, null, 2));
  }

  public updateUserArticleStates(userId: string, states: Partial<UserArticleState>[]) {
    if (!this.userArticleStates[userId]) {
      this.userArticleStates[userId] = [];
    }
    
    const userStates = this.userArticleStates[userId];
    const nowIso = new Date().toISOString();
    let changed = false;

    for (const incoming of states) {
      if (!incoming.articleUrl) continue;

      const existingIndex = userStates.findIndex(s => s.articleUrl === incoming.articleUrl);
      
      if (existingIndex >= 0) {
        // Update existing
        const existing = userStates[existingIndex];
        // Merge logic: only update if incoming is newer or explicit (we assume incoming is always newer for now)
        userStates[existingIndex] = {
          ...existing,
          ...incoming,
          updatedAt: nowIso,
          userId // Ensure userId matches
        } as UserArticleState;
        changed = true;
      } else {
        // Insert new
        userStates.push({
          userId,
          articleUrl: incoming.articleUrl,
          isRead: incoming.isRead ?? false,
          isFavorite: incoming.isFavorite ?? false,
          readProgress: incoming.readProgress ?? 0,
          updatedAt: nowIso
        });
        changed = true;
      }
    }

    if (changed) {
      this.persistUserArticleStates();
    }
  }

  public getUserArticleStates(userId: string, since?: string): UserArticleState[] {
    const states = this.userArticleStates[userId] || [];
    if (!since) return states;
    
    const sinceDate = new Date(since).getTime();
    return states.filter(s => new Date(s.updatedAt).getTime() > sinceDate);
  }

  // Feeds
  private loadFeeds(): Feed[] {
    try {
      if (fs.existsSync(this.feedsFile)) {
        return JSON.parse(fs.readFileSync(this.feedsFile, 'utf-8'));
      }
    } catch (error) {
      logger.error('Failed to load feeds:', error);
    }
    return [];
  }

  public getFeeds(): Feed[] {
    return [...this.feeds];
  }

  public saveFeed(feed: Feed) {
    const normalizedUrl = this.normalizeUrl(feed.url);
    const existingByUrl = this.feeds.find(f => this.normalizeUrl(f.url) === normalizedUrl);
    if (existingByUrl && existingByUrl.id !== feed.id) {
      const merged = {
        ...existingByUrl,
        ...feed,
        id: existingByUrl.id,
        url: normalizedUrl,
      };
      const index = this.feeds.findIndex(f => f.id === existingByUrl.id);
      this.feeds[index] = merged;
      this.persistFeeds();
      return;
    }

    const index = this.feeds.findIndex(f => f.id === feed.id);
    if (index >= 0) {
      this.feeds[index] = { ...feed, url: normalizedUrl };
    } else {
      this.feeds.push({ ...feed, url: normalizedUrl });
    }
    this.persistFeeds();
  }

  public upsertFeedsFromClient(
    userId: string,
    feeds: Array<{
      id?: string | number;
      url: string;
      name?: string;
      category?: string;
      refreshIntervalSeconds?: number;
      updateFrequency?: number;
    }>
  ) {
    const nowIso = new Date().toISOString();
    const results: Feed[] = [];

    for (const incoming of feeds) {
      if (!incoming?.url) continue;
      const normalizedUrl = this.normalizeUrl(incoming.url);
      if (!normalizedUrl) continue;
      const id = String(simpleHash(normalizedUrl));
      const existing = this.feeds.find(f => f.id === id) || this.feeds.find(f => this.normalizeUrl(f.url) === normalizedUrl);
      const refreshIntervalSeconds =
        incoming.refreshIntervalSeconds ??
        (incoming.updateFrequency ? Math.max(60, Number(incoming.updateFrequency)) : undefined) ??
        existing?.refreshIntervalSeconds;

      const next: Feed = {
        id,
        url: normalizedUrl,
        name: incoming.name || existing?.name || normalizedUrl,
        category: incoming.category || existing?.category || 'General',
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
        refreshIntervalSeconds,
        lastRefreshAt: existing?.lastRefreshAt,
        lastRefreshStatus: existing?.lastRefreshStatus,
        lastRefreshError: existing?.lastRefreshError,
      };

      this.saveFeed(next);
      this.ensureUserFeedLink(userId, id, nowIso);
      results.push(next);
    }

    this.persistUserFeeds();
    return results;
  }

  public updateFeedRefreshState(feedId: string, data: { lastRefreshAt: string; status: 'ok' | 'error'; error?: string }) {
    const idx = this.feeds.findIndex(f => f.id === feedId);
    if (idx < 0) return;
    this.feeds[idx] = {
      ...this.feeds[idx],
      lastRefreshAt: data.lastRefreshAt,
      lastRefreshStatus: data.status,
      lastRefreshError: data.error,
      updatedAt: data.lastRefreshAt,
    };
    this.persistFeeds();
  }

  public deleteFeed(id: string) {
    this.feeds = this.feeds.filter(f => f.id !== id);
    this.persistFeeds();
    this.userFeeds = this.userFeeds.filter(l => l.feedId !== id);
    this.persistUserFeeds();
  }

  private persistFeeds() {
    fs.writeFileSync(this.feedsFile, JSON.stringify(this.feeds, null, 2));
  }

  // Cleanup
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
      // Clear JSON files but keep structure
      this.users = [];
      this.feeds = [];
      this.userFeeds = [];
      // Don't clear settings probably? Or maybe reset to default?
      // User asked "Clear database", usually means content data
      this.persistUsers();
      this.persistFeeds();
      this.persistUserFeeds();
      logger.info('Data cleared');
    } catch (error) {
      logger.error('Failed to clear data:', error);
      throw error;
    }
  }

  public async clearArticles(): Promise<void> {
    try {
      this.storedArticles = { version: 1, updatedAt: new Date().toISOString(), articlesByKey: {} };
      this.storedSyncBlocks = {
        version: 1,
        updatedAt: new Date().toISOString(),
        latestBySourceUrl: {},
        blocksBySourceUrl: {},
      };
      this.persistStoredArticles();
      this.persistStoredSyncBlocks();
      logger.info('Articles cleared');
    } catch (error) {
      logger.error('Failed to clear articles:', error);
      throw error;
    }
  }
}

export const storageService = StorageService.getInstance();
