import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/Logger';
import { Article } from '../types';
import { simpleHash } from '../utils/RSSUtils';

console.log('StorageService initializing...');
// console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Found' : 'Missing');

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
  adminPassword?: string;
  rssRefreshIntervalSeconds?: number;
  rssMaxArticlesPerFeed?: number;
  rssSyncMaxBlocksPerFeed?: number;
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
  createdAt: string | Date;
  updatedAt?: string;
  refreshIntervalSeconds?: number;
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
  
  // In-memory cache for ServerSettings (since we decided to keep them simple/file-based or hardcoded for now)
  // Actually, let's just hardcode defaults + env vars for ServerSettings to avoid fs dependency
  private settings: ServerSettings;
  private cacheDir: string;

  private constructor() {
    this.cacheDir = path.join(process.cwd(), 'public', 'cache');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    this.settings = {
      imageQuality: 80,
      rssRefreshIntervalSeconds: 900,
      rssMaxArticlesPerFeed: 20,
      rssSyncMaxBlocksPerFeed: 200,
      adminPassword: process.env.ADMIN_PASSWORD || 'admin'
    };
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
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

  // Settings
  public getSettings(): ServerSettings {
    return { ...this.settings };
  }

  public saveSettings(newSettings: Partial<ServerSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    // TODO: Persist server settings if needed. For now memory/env is fine.
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
      createdAt: s.createdAt,
      updatedAt: s.updatedAt.toISOString(),
      lastRefreshAt: s.lastFetchAt?.toISOString(),
      lastRefreshStatus: 'ok', // Simplified
      lastRefreshError: undefined,
      articleCount: s._count?.articles ?? 0,
      subscriberCount: s._count?.users ?? 0,
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
      name: uf.source.name,
      category: uf.source.category,
      createdAt: uf.source.createdAt,
      updatedAt: uf.source.updatedAt.toISOString(),
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
      
      // Upsert Source
      const source = await prisma.rSSSource.upsert({
        where: { url: normalizedUrl },
        update: {
          name: f.name || undefined,
          category: f.category || undefined,
        },
        create: {
          url: normalizedUrl,
          name: f.name || normalizedUrl,
          category: f.category || 'General',
        }
      });

      // Link to User
      await prisma.userFeed.upsert({
        where: {
          userId_sourceId: {
            userId: userId,
            sourceId: source.id
          }
        },
        update: {},
        create: {
          userId: userId,
          sourceId: source.id
        }
      });

      results.push({
        id: String(source.id),
        url: source.url,
        name: source.name,
        category: source.category,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt.toISOString(),
      });
    }
    return results;
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

    for (const a of articles) {
      if (!a.url) continue;
      
      // Upsert Article
      // Using upsert to handle updates
      const saved = await prisma.article.upsert({
        where: { url: a.url },
        update: {}, // Don't overwrite existing content to save perf, or maybe update?
        create: {
          url: a.url,
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
    
    if (!source) return { latest: 0, blocks: [] };

    // Fetch articles newer than `since` (Article ID)
    const articles = await prisma.article.findMany({
      where: {
        sourceId: source.id,
        id: { gt: since }
      },
      orderBy: { id: 'asc' },
      take: 50 // Limit batch size
    });

    if (articles.length === 0) {
      return { latest: since, blocks: [] };
    }

    const latestId = articles[articles.length - 1].id;
    
    // Wrap as a single block
    const block: StoredSyncBlock = {
      id: latestId,
      sourceUrl: normalizedUrl,
      createdAt: new Date().toISOString(),
      upserts: articles.map((a: any) => ({
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
      blocks: [block]
    };
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
        lastFetchAt: feed.lastRefreshAt ? new Date(feed.lastRefreshAt) : null,
      },
      create: {
        url: normalizedUrl,
        name: feed.name,
        category: feed.category || 'General',
        lastFetchAt: feed.lastRefreshAt ? new Date(feed.lastRefreshAt) : null,
      }
    });
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
    const articles = await prisma.article.findMany({
      where: { sourceId: source.id },
      orderBy: { publishedAt: 'desc' },
      take: options.limit || 20,
      skip: options.offset || 0,
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
        } catch {}
      }
      return total;
    } catch (err) {
      logger.error('Failed to get image cache size:', err);
      return 0;
    }
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
        } catch {}
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
    const nestedSettings = syncData && typeof syncData === 'object' ? syncData.settings : undefined;
    const rootLooksLikeSettings =
      syncData &&
      typeof syncData === 'object' &&
      (Object.prototype.hasOwnProperty.call(syncData, 'appSettings') ||
        Object.prototype.hasOwnProperty.call(syncData, 'readingSettings') ||
        Object.prototype.hasOwnProperty.call(syncData, 'sync'));
    const settings = nestedSettings || (rootLooksLikeSettings ? syncData : undefined);
     
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
