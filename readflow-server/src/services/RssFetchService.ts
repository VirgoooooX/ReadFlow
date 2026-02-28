import { rssParserService } from './RSSParserService';
import { RSSSource, Article } from '../types';
import { storageService } from './StorageService';
import { getProxyUrl, needsProxy, proxyImages } from '../utils/RSSUtils';
import { logger } from '../utils/Logger';
import fetch from 'node-fetch';
import cronParser from 'cron-parser';
import pLimit from 'p-limit';
import { finished } from 'stream/promises';

export class RssFetchService {
    private static instance: RssFetchService;

    public refreshTimer: NodeJS.Timeout | null = null;
    public refreshRunning = false;
    public refreshingFeedIds = new Set<string>();
    public syncModeCounters = { serverCursor: 0, legacy: 0 };
    public lastSyncModeLogAt = 0;

    public warmUpQueueLimit = pLimit(3);
    public warmUpRecent = new Map<string, number>();
    public WARMUP_RECENT_TTL_MS = 30 * 60_000;
    public warmUpPending = new Set<string>();
    public warmUpWorkerRunning = false;
    public WARMUP_PENDING_MAX = 2000;
    public warmUpDropped = 0;

    private constructor() { }

    public static getInstance(): RssFetchService {
        if (!RssFetchService.instance) {
            RssFetchService.instance = new RssFetchService();
        }
        return RssFetchService.instance;
    }

    public async runWarmUpWorker() {
        if (this.warmUpWorkerRunning) return;
        this.warmUpWorkerRunning = true;
        try {
            let processed = 0;
            while (this.warmUpPending.size > 0) {
                const batch: string[] = [];
                for (const u of this.warmUpPending) {
                    batch.push(u);
                    if (batch.length >= 50) break;
                }
                for (const u of batch) this.warmUpPending.delete(u);

                const tasks = batch.map(u =>
                    this.warmUpQueueLimit(async () => {
                        const controller = new AbortController();
                        const timer = setTimeout(() => controller.abort(), 10_000);
                        try {
                            const resp = await fetch(u, { signal: controller.signal } as any);
                            if (resp?.body) {
                                (resp.body as any).resume?.();
                                await finished(resp.body as any);
                            }
                        } catch {
                        } finally {
                            clearTimeout(timer);
                        }
                    })
                );
                await Promise.all(tasks);
                processed += batch.length;
            }
            if (processed > 0) {
                logger.info(`[Pre-warm] Completed for ${processed} images`);
            }
            if (this.warmUpDropped > 0) {
                logger.warn(`[Pre-warm] Dropped ${this.warmUpDropped} images due to backlog cap`);
                this.warmUpDropped = 0;
            }
        } finally {
            this.warmUpWorkerRunning = false;
        }
    }

    public redactForLog(input: any, depth: number = 0): any {
        if (depth > 8) return '[Truncated]';
        if (input === null || input === undefined) return input;
        if (typeof input !== 'object') return input;
        if (Array.isArray(input)) return input.map(v => this.redactForLog(v, depth + 1));

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

    public safeJsonForLog(value: any, maxLen: number = 12000): string {
        try {
            const str = JSON.stringify(this.redactForLog(value));
            if (str.length > maxLen) return `${str.slice(0, maxLen)}...[Truncated ${str.length - maxLen} chars]`;
            return str;
        } catch {
            return '[Unserializable]';
        }
    }

    public logConfigSyncSnapshot(userId: string, label: string, snapshot: any) {
        const updatedAt = snapshot?.updatedAt ? String(snapshot.updatedAt) : '';
        const sourcesCount = Array.isArray(snapshot?.sources) ? snapshot.sources.length : 0;
        const groupsCount = Array.isArray(snapshot?.groups) ? snapshot.groups.length : 0;
        const filterRulesCount = Array.isArray(snapshot?.filterRules) ? snapshot.filterRules.length : 0;
        const hasSettings = !!snapshot?.settings;

        logger.info(
            `[SyncConfig] ${label} summary userId=${userId} updatedAt=${updatedAt} hasSettings=${hasSettings} sources=${sourcesCount} groups=${groupsCount} filterRules=${filterRulesCount}`
        );
        logger.info(`[SyncConfig] ${label} full userId=${userId}: ${this.safeJsonForLog(snapshot)}`);
    }

    public coerceBool(val: unknown): boolean {
        if (val === true) return true;
        if (val === false) return false;
        if (typeof val !== 'string') return false;
        return val === '1' || val.toLowerCase() === 'true';
    }

    public applyProxyToArticle(
        article: any,
        baseUrl: string,
        imageCompression: boolean,
        imageQuality: number
    ) {
        const content = proxyImages(article.content || '', baseUrl, imageCompression, imageQuality);
        let imageUrl = article.imageUrl;
        if (imageUrl && needsProxy(imageUrl, baseUrl, imageCompression)) {
            imageUrl = getProxyUrl(imageUrl, baseUrl, imageCompression, imageQuality);
        }
        return { ...article, content, imageUrl };
    }

    public isXchuxingVideoUrl(value: unknown): boolean {
        if (!value || typeof value !== 'string') return false;
        try {
            const urlObj = new URL(value);
            return urlObj.hostname === 'www.xchuxing.com' && urlObj.pathname.startsWith('/video/');
        } catch {
            return false;
        }
    }

    public async enrichBlocksWithVideoUrls(blocks: any[]) {
        const limit = pLimit(3);
        const tasks: Array<Promise<void>> = [];
        for (const block of blocks) {
            const upserts = Array.isArray(block?.upserts) ? block.upserts : [];
            for (const a of upserts) {
                if (!this.isXchuxingVideoUrl(a?.url)) continue;
                if (typeof a?.videoUrl === 'string' && a.videoUrl.trim()) continue;
                tasks.push(limit(async () => {
                    const videoUrl = await rssParserService.resolveVideoUrl(String(a.url));
                    if (videoUrl) {
                        a.videoUrl = videoUrl;
                    }
                }));
            }
        }
        if (tasks.length) {
            await Promise.all(tasks);
        }
    }

    /**
     * Pre-warm images for a list of articles (background task)
     * Extracts first 2 images from latest 5 articles and requests them from local proxy
     */
    public async warmUpImages(articles: Omit<Article, 'id'>[], baseUrl: string = 'http://localhost:3000') {
        if (!articles || articles.length === 0) return;

        const settings = storageService.getSettings();
        const envEnabled = process.env.IMAGE_WARMUP_ENABLED;
        const enabled =
            envEnabled === undefined
                ? settings.imageWarmupEnabled !== false
                : envEnabled === '1' || envEnabled.toLowerCase() === 'true';
        if (!enabled) return;

        const imageCompression = true; // Always warm up compressed version
        const imageQuality = settings.imageQuality ?? 80;

        // Process latest 5 articles
        const candidates = articles.slice(0, 5);
        const urlsToWarm = new Set<string>();

        for (const article of candidates) {
            let count = 0;

            // 1. Cover image
            if (article.imageUrl && needsProxy(article.imageUrl, baseUrl, imageCompression)) {
                urlsToWarm.add(article.imageUrl);
                count++;
            }

            // 2. Images in content (up to 2 total per article)
            if (article.content) {
                const imgRegex = /<img[^>]*\ssrc=["']([^"']+)["']/gi;
                let match;
                while ((match = imgRegex.exec(article.content)) !== null) {
                    if (count >= 2) break;
                    const src = match[1];
                    if (src && needsProxy(src, baseUrl, imageCompression)) {
                        urlsToWarm.add(src);
                        count++;
                    }
                }
            }
        }

        if (urlsToWarm.size === 0) return;

        logger.info(`[Pre-warm] Warming up ${urlsToWarm.size} images...`);

        // Fire requests asynchronously (concurrency limit: 3)
        const urls = Array.from(urlsToWarm);
        const chunkParams: any[] = [];

        for (const url of urls) {
            const proxyUrl = getProxyUrl(url, baseUrl, imageCompression, imageQuality);
            if (proxyUrl.startsWith(baseUrl)) {
                chunkParams.push(proxyUrl);
            }
        }

        const now = Date.now();
        const toWarm: string[] = [];
        for (const u of chunkParams) {
            const last = this.warmUpRecent.get(u);
            if (last && now - last < this.WARMUP_RECENT_TTL_MS) continue;
            this.warmUpRecent.set(u, now);
            toWarm.push(u);
        }

        if (toWarm.length === 0) return;

        if (this.warmUpRecent.size > 5000) {
            const pruneBefore = Date.now() - this.WARMUP_RECENT_TTL_MS;
            for (const [k, v] of this.warmUpRecent.entries()) {
                if (v < pruneBefore) this.warmUpRecent.delete(k);
            }
        }

        for (const u of toWarm) {
            if (this.warmUpPending.has(u)) continue;
            if (this.warmUpPending.size >= this.WARMUP_PENDING_MAX) {
                this.warmUpDropped += 1;
                continue;
            }
            this.warmUpPending.add(u);
        }
        void this.runWarmUpWorker();
    }

    public async refreshAllFeedsOnce() {
        if (this.refreshRunning) return;
        this.refreshRunning = true;
        const lockName = 'rss_auto_refresh';
        let locked = false;
        try {
            locked = await storageService.tryAcquireAdvisoryLock(lockName);
            if (!locked) return;
            const feeds = await storageService.getFeedsLight();
            if (!feeds || feeds.length === 0) return;

            const nowDate = new Date();
            const now = nowDate.getTime();
            const settings = storageService.getSettings();
            const globalIntervalSeconds = settings.rssDefaultRefreshIntervalSeconds ?? 900;
            const globalCron = settings.rssDefaultRefreshCron;
            const refreshConcurrencyRaw = parseInt(String(process.env.RSS_REFRESH_CONCURRENCY || ''), 10);
            const refreshConcurrency = Number.isFinite(refreshConcurrencyRaw) && refreshConcurrencyRaw > 0 ? refreshConcurrencyRaw : 2;
            const limit = pLimit(Math.max(1, Math.min(8, refreshConcurrency)));

            const tasks = feeds.map((feed) => limit(async () => {
                if (!feed?.url) return;
                if ((feed as any).isActive === false) return;
                try {
                    let cronExpr = feed.refreshCron;
                    if (cronExpr) cronExpr = String(cronExpr).trim();
                    if (!cronExpr) cronExpr = globalCron ? String(globalCron).trim() : undefined;

                    if (cronExpr) {
                        try {
                            const base = feed.lastRefreshAt ? new Date(feed.lastRefreshAt) : new Date(0);
                            const interval = cronParser.parseExpression(cronExpr, { currentDate: base });
                            const next = interval.next().toDate();
                            if (next.getTime() > now) return;
                        } catch (e) {
                            logger.warn(`[RSS Refresh] Invalid cron for ${feed.url}: ${cronExpr}`);
                            cronExpr = undefined;
                        }
                    }

                    if (!cronExpr) {
                        const intervalSeconds = feed.refreshIntervalSeconds ?? globalIntervalSeconds;
                        if (intervalSeconds <= 0) return;

                        const last = feed.lastRefreshAt ? Date.parse(feed.lastRefreshAt) : 0;
                        if (last && now - last < intervalSeconds * 1000) return;
                    }
                    if (this.refreshingFeedIds.has(feed.id)) return;
                    this.refreshingFeedIds.add(feed.id);

                    const source: RSSSource = {
                        id: 0,
                        url: feed.url,
                        name: feed.name || 'Feed',
                        sortOrder: 0,
                        category: feed.category || 'General',
                        contentType: 'image_text',
                        isActive: true,
                        errorCount: 0,
                        groupId: null,
                        maxArticles: settings.rssMaxItemsPerFetch ?? 20,
                    };

                    const startedAtIso = new Date().toISOString();
                    const articles = await rssParserService.fetchAndParseArticles(
                        source,
                        [],
                        undefined,
                        true,
                        settings.imageQuality ?? 80,
                        false,
                        settings.rssFetchTimeoutMs,
                        settings.rssFulltextTimeoutMs
                    );
                    const result = await storageService.storeCanonicalArticlesForSource(feed.url, articles);

                    await storageService.updateFeedRefreshState(feed.id, { lastRefreshAt: startedAtIso, status: 'ok' });

                    logger.info(`[RSS Refresh] ${feed.name || feed.url} ok upserts=${result.upsertsCount} latest=${result.latestBlockId}`);

                    // 🔥 Trigger image pre-warming (local loopback)
                    // Assume default port 3000 if env not set
                    const port = process.env.PORT || 3000;
                    this.warmUpImages(articles, `http://localhost:${port}`);

                } catch (error) {
                    const atIso = new Date().toISOString();
                    await storageService.updateFeedRefreshState(feed.id, {
                        lastRefreshAt: atIso,
                        status: 'error',
                        error: (error as Error)?.message || String(error),
                    });
                    logger.error(`[RSS Refresh] Failed for ${feed.url}:`, error);
                } finally {
                    this.refreshingFeedIds.delete(feed.id);
                }
            }));

            await Promise.all(tasks);
        } finally {
            if (locked) {
                await storageService.releaseAdvisoryLock(lockName);
            }
            this.refreshRunning = false;
        }
    }

    public startRssAutoRefresh() {
        if (this.refreshTimer) return;
        const scheduleNext = async () => {
            if (this.refreshTimer) {
                clearTimeout(this.refreshTimer);
                this.refreshTimer = null;
            }

            let delayMs = 60_000;
            try {
                const feeds = await storageService.getFeedsLight();
                const settings = storageService.getSettings();
                const globalIntervalSeconds = settings.rssDefaultRefreshIntervalSeconds ?? 900;
                const globalCron = settings.rssDefaultRefreshCron ? String(settings.rssDefaultRefreshCron).trim() : undefined;
                const now = Date.now();

                let nextAt = now + delayMs;
                for (const feed of feeds) {
                    if (!feed?.url) continue;

                    let cronExpr = feed.refreshCron;
                    if (cronExpr) cronExpr = String(cronExpr).trim();
                    if (!cronExpr) cronExpr = globalCron;

                    if (cronExpr) {
                        try {
                            const base = feed.lastRefreshAt ? new Date(feed.lastRefreshAt) : new Date(0);
                            const interval = cronParser.parseExpression(cronExpr, { currentDate: base });
                            const next = interval.next().toDate().getTime();
                            nextAt = Math.min(nextAt, next);
                            continue;
                        } catch {
                            cronExpr = undefined;
                        }
                    }

                    const intervalSeconds = feed.refreshIntervalSeconds ?? globalIntervalSeconds;
                    if (intervalSeconds <= 0) continue;
                    const last = feed.lastRefreshAt ? Date.parse(feed.lastRefreshAt) : 0;
                    const candidate = last ? last + intervalSeconds * 1000 : now;
                    nextAt = Math.min(nextAt, candidate);
                }

                delayMs = Math.max(0, nextAt - now);
                if (!Number.isFinite(delayMs)) delayMs = 60_000;
                delayMs = Math.min(delayMs, 60 * 60 * 1000);
            } catch {
                delayMs = 60_000;
            }

            this.refreshTimer = setTimeout(() => {
                this.refreshAllFeedsOnce()
                    .catch(() => { })
                    .finally(() => {
                        scheduleNext().catch(() => { });
                    });
            }, delayMs);
        };

        scheduleNext().catch(() => { });
    }
}

export const rssFetchService = RssFetchService.getInstance();
