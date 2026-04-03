import express, { Request, Response } from 'express';
import { rssParserService } from '../services/RSSParserService';
import { RSSSource, Article } from '../types';
import { storageService } from '../services/StorageService';
import { getProxyUrl, needsProxy, proxyImages } from '../utils/RSSUtils';
import { logger } from '../utils/Logger';
import fetch from 'node-fetch'; // For warm-up requests
import cronParser from 'cron-parser';
import pLimit from 'p-limit';
import { finished } from 'stream/promises';
import { dailyReportService } from '../services/DailyReportService';

const router = express.Router();

import { rssFetchService } from '../services/RssFetchService';

// GET /api/rss?url=...
router.get('/', async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    const imageCompression = req.query.imageCompression === 'true';
    const settings = storageService.getSettings();
    const imageQuality = settings.imageQuality ?? 80;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const source: RSSSource = {
      id: 0,
      url,
      name: 'Temp Source',
      sortOrder: 0,
      category: 'General',
      contentType: 'image_text',
      isActive: true,
      errorCount: 0,
      groupId: null
    };

    // 获取 Host 用于生成本地代理 URL
    const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;

    const articles = await rssParserService.fetchAndParseArticles(
      source,
      [],
      baseUrl,
      imageCompression,
      imageQuality,
      true,
      settings.rssFetchTimeoutMs,
      settings.rssFulltextTimeoutMs
    );
    res.json(articles);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/sync', async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    const mode = String(req.query.mode || '');
    const since = req.query.since ? parseInt(req.query.since as string) : 0;
    const maxBlocks = req.query.maxBlocks ? parseInt(req.query.maxBlocks as string) : 20;
    const limitRaw = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const imageCompression = rssFetchService.coerceBool(req.query.imageCompression);
    const settings = storageService.getSettings();
    const imageQuality = settings.imageQuality ?? 80;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const defaultLimit = settings.syncPageSizeDefault ?? 200;
    const maxLimit = settings.syncPageSizeMax ?? 2000;
    const hardMaxLimit = 500;
    const effectiveMax = Math.min(maxLimit, hardMaxLimit);
    const effectiveLimit = Math.max(
      1,
      Math.min(Number.isFinite(limitRaw as number) ? (limitRaw as number) : defaultLimit, effectiveMax)
    );
    logger.debug(
      '[RSS Sync] request',
      rssFetchService.safeJsonForLog({
        url,
        mode,
        since,
        maxBlocks,
        limitRaw,
        effectiveLimit,
        imageCompression,
      })
    );

    if (mode === 'serverCursor') {
      rssFetchService.syncModeCounters.serverCursor += 1;
      {
        const total = rssFetchService.syncModeCounters.serverCursor + rssFetchService.syncModeCounters.legacy;
        const now = Date.now();
        if ((total > 0 && total % 50 === 0) || now - rssFetchService.lastSyncModeLogAt > 10 * 60 * 1000) {
          rssFetchService.lastSyncModeLogAt = now;
          logger.debug(
            '[RSS Sync] mode stats',
            rssFetchService.safeJsonForLog({
              total,
              serverCursor: rssFetchService.syncModeCounters.serverCursor,
              legacy: rssFetchService.syncModeCounters.legacy,
              serverCursorRatio: total > 0 ? rssFetchService.syncModeCounters.serverCursor / total : 0,
            })
          );
        }
      }
      const userId = String((req as any)?.user?.id || '');
      if (!userId || userId === 'admin') {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { deliveryId, since: cursorSince, latest, blocks, hasMore } =
        await storageService.getSyncDeliveryForSourceUser(userId, url, effectiveLimit);
      const totalUpserts = blocks.reduce((acc, b) => acc + (Array.isArray(b.upserts) ? b.upserts.length : 0), 0);
      logger.debug(
        '[RSS Sync] response',
        rssFetchService.safeJsonForLog({
          url,
          mode,
          userId,
          since: cursorSince,
          latest,
          hasMore,
          blocks: blocks.length,
          upserts: totalUpserts,
          deliveryId,
        })
      );

      const mappedBlocks = blocks.map(b => ({
        id: b.id,
        createdAt: b.createdAt,
        upserts: b.upserts.map(a => rssFetchService.applyProxyToArticle(a, baseUrl, imageCompression, imageQuality)),
      }));

      await rssFetchService.enrichBlocksWithVideoUrls(mappedBlocks);

      return res.json({
        sourceUrl: url,
        mode,
        deliveryId,
        since: cursorSince,
        latest,
        blocks: mappedBlocks,
        hasMore,
      });
    }

    rssFetchService.syncModeCounters.legacy += 1;
    {
      const total = rssFetchService.syncModeCounters.serverCursor + rssFetchService.syncModeCounters.legacy;
      const now = Date.now();
      if ((total > 0 && total % 50 === 0) || now - rssFetchService.lastSyncModeLogAt > 10 * 60 * 1000) {
        rssFetchService.lastSyncModeLogAt = now;
        logger.debug(
          '[RSS Sync] mode stats',
          rssFetchService.safeJsonForLog({
            total,
            serverCursor: rssFetchService.syncModeCounters.serverCursor,
            legacy: rssFetchService.syncModeCounters.legacy,
            serverCursorRatio: total > 0 ? rssFetchService.syncModeCounters.serverCursor / total : 0,
          })
        );
      }
    }
    const { latest, blocks, hasMore } = await storageService.getSyncBlocksForSource(url, Number.isFinite(since) ? since : 0, effectiveLimit);
    const totalUpserts = blocks.reduce((acc, b) => acc + (Array.isArray(b.upserts) ? b.upserts.length : 0), 0);
    logger.debug(
      '[RSS Sync] response',
      rssFetchService.safeJsonForLog({
        url,
        mode,
        since,
        latest,
        hasMore,
        blocks: blocks.length,
        upserts: totalUpserts,
      })
    );

    const mappedBlocks = blocks.map(b => ({
      id: b.id,
      createdAt: b.createdAt,
      upserts: b.upserts.map(a => rssFetchService.applyProxyToArticle(a, baseUrl, imageCompression, imageQuality)),
    }));

    await rssFetchService.enrichBlocksWithVideoUrls(mappedBlocks);

    res.json({
      sourceUrl: url,
      mode,
      latest,
      blocks: mappedBlocks,
      hasMore,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/syncAck', async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '');
    if (!userId || userId === 'admin') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const deliveryId = String(req.body?.deliveryId || '');
    if (!deliveryId) {
      return res.status(400).json({ error: 'deliveryId is required' });
    }

    const result = await storageService.ackSyncDelivery(userId, deliveryId);
    if (!result.ok) {
      return res.status(404).json({ error: 'Delivery not found' });
    }
    res.json({ ok: true, deliveryId, advancedTo: result.advancedTo });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/profile', async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '');
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const user = await storageService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const feeds = await storageService.getFeedsForUser(userId);
    const raw = (user.config && typeof user.config === 'object') ? user.config : {};
    const configSync = (raw as any).configSync;
    res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        registeredAt: user.registeredAt,
        lastActive: user.lastActive,
      },
      settings: user.settings ?? null,
      configSync: configSync || null,
      feeds,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
});

router.post('/clientSync', async (req: Request, res: Response) => {
  try {
    const { user, settings, feeds, replaceFeeds } = req.body || {};
    if (!user?.id) {
      return res.status(400).json({ error: 'user.id is required' });
    }

    const savedUser = await storageService.upsertUserFromClient({
      id: String(user.id),
      username: user.username ? String(user.username) : undefined,
      email: user.email ? String(user.email) : undefined,
      registeredAt: user.registeredAt ? String(user.registeredAt) : undefined,
      settings: settings ?? user.settings,
    });

    let savedFeedsCount = 0;
    if (Array.isArray(feeds)) {
      if (replaceFeeds === true) {
        const result = await storageService.replaceUserFeedsFromClient(savedUser.id, feeds);
        savedFeedsCount = result.upserted;
      } else {
        const savedFeeds = await storageService.upsertFeedsFromClient(savedUser.id, feeds);
        savedFeedsCount = savedFeeds.length;
      }
    }

    res.json({ ok: true, user: savedUser, feeds: savedFeedsCount });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/rss/refresh?url=... - Trigger manual refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const settings = storageService.getSettings();
    const feeds = await storageService.getFeeds();
    const feed = feeds.find(f => f.url === url);
    const feedId = feed?.id || 'temp'; // Should ideally exist if syncing

    // Even if feed not found in DB (unlikely for sync), we can try to fetch it
    // But we need to store it to generate sync blocks.
    // If client is syncing, feed should be in userFeeds and thus in feeds.

    if (!feed) {
      // If not found, maybe just fetch and parse without storing? 
      // No, purpose is to update sync blocks.
      // So we must have it.
      return res.status(404).json({ error: 'Feed not found (please sync profile first)' });
    }

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

    const atIso = new Date().toISOString();
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

    await storageService.updateFeedRefreshState(feed.id, { lastRefreshAt: atIso, status: 'ok' });

    logger.info(`[RSS Manual Refresh] ${feed.name || feed.url} ok upserts=${result.upsertsCount}`);

    // 🔥 Trigger image pre-warming
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    rssFetchService.warmUpImages(articles, baseUrl);

    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('[RSS Manual Refresh] Failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/rss/syncState - Upload user article states (read/favorite)
router.post('/syncState', async (req: Request, res: Response) => {
  try {
    const { userId, states } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    if (!Array.isArray(states)) {
      return res.status(400).json({ error: 'states must be an array' });
    }

    await storageService.updateUserArticleStates(String(userId), states);

    res.json({ success: true, count: states.length });
  } catch (error) {
    logger.error('[SyncState] Failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/rss/syncState - Download user article states
router.get('/syncState', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const since = req.query.since as string; // ISO string

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const states = await storageService.getUserArticleStates(userId, since);

    res.json({
      userId,
      since: since || null,
      states
    });
  } catch (error) {
    logger.error('[GetSyncState] Failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/rss/parse
router.post('/parse', async (req: Request, res: Response) => {
  try {
    const { source, filterRules } = req.body;
    if (!source || !source.url) {
      return res.status(400).json({ error: 'Source with URL is required' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const settings = storageService.getSettings();
    const articles = await rssParserService.fetchAndParseArticles(
      source,
      filterRules || [],
      baseUrl,
      true,
      settings.imageQuality ?? 80,
      true,
      settings.rssFetchTimeoutMs,
      settings.rssFulltextTimeoutMs
    );
    res.json({ articles });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/rss/validate?url=...
router.get('/validate', async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const metadata = await rssParserService.validateRSSFeed(url);
    res.json(metadata);
  } catch (error) {
    const message = (error as Error).message;
    // Handle validation errors as 400 Bad Request
    if (
      message.includes('Invalid RSS') ||
      message.includes('Response is HTML') ||
      message.includes('URL format')
    ) {
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: message });
  }
});

// GET /api/rss/sync/config
router.get('/sync/config', async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await storageService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const raw = (user.config && typeof user.config === 'object') ? user.config : {};
    const configSync = (raw as any).configSync;
    if (!configSync || typeof configSync !== 'object') {
      return res.status(404).json({ error: 'No remote config' });
    }
    rssFetchService.logConfigSyncSnapshot(String(userId), 'GET', configSync);
    res.json(configSync);
  } catch (error) {
    logger.error('[SyncConfig] GET failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/rss/sync/config
router.post('/sync/config', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const legacyConfig = (body as any).config;
    const incoming = (legacyConfig && typeof legacyConfig === 'object')
      ? legacyConfig
      : {
        settings: (body as any).settings,
        sources: (body as any).sources,
        groups: (body as any).groups,
        filterRules: (body as any).filterRules,
        updatedAt: (body as any).updatedAt,
      };

    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'Config payload is required' });
    }

    const updatedAt = (incoming as any).updatedAt ? String((incoming as any).updatedAt) : new Date().toISOString();
    const nextConfigSync = { ...(incoming as any), updatedAt };
    rssFetchService.logConfigSyncSnapshot(String(userId), 'Incoming', nextConfigSync);

    const user = await storageService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // LWW (Last Write Wins) Strategy based on updatedAt
    const serverConfigSyncUpdatedAt = (user.config && typeof user.config === 'object' && (user.config as any).configSync?.updatedAt)
      ? String((user.config as any).configSync.updatedAt)
      : null;
    const serverTime = serverConfigSyncUpdatedAt ? new Date(serverConfigSyncUpdatedAt).getTime() : 0;
    const clientTime = nextConfigSync.updatedAt ? new Date(nextConfigSync.updatedAt).getTime() : 0;

    // Allow overwrite if client is newer or server has no config
    // Also allow if forced (optional param, but for now just time based)
    // Actually for simple sync, we usually just accept what client pushes if it claims to be newer.
    // Or if we want to be strict: if clientTime > serverTime.

    // For MVP: We accept the push and update.
    // The client is responsible for pulling first before pushing to avoid overwriting newer server data blindly,
    // or we can reject here if server is newer.

    if (serverTime > clientTime) {
      logger.warn(
        `[SyncConfig] Conflict userId=${userId} serverUpdatedAt=${serverConfigSyncUpdatedAt} clientUpdatedAt=${nextConfigSync.updatedAt}`
      );
      return res.status(409).json({
        error: 'Conflict: Server has newer config',
        serverUpdatedAt: serverConfigSyncUpdatedAt
      });
    }

    await storageService.upsertUserFromClient({
      id: userId,
      config: { configSync: nextConfigSync }
    });

    try {
      if (Array.isArray((nextConfigSync as any).sources)) {
        const result = await storageService.replaceUserFeedsFromClient(userId, (nextConfigSync as any).sources);
        logger.debug(`[SyncConfig] Reconciled user feeds userId=${userId} upserted=${result.upserted} deleted=${result.deleted}`);
      }
    } catch (e) {
      logger.warn(`[SyncConfig] Reconcile user feeds failed userId=${userId}:`, e);
    }

    const updatedUser = await storageService.getUserById(userId);
    const persistedRaw = (updatedUser?.config && typeof updatedUser.config === 'object') ? updatedUser.config : {};
    const persistedConfigSync = (persistedRaw as any).configSync;
    logger.debug(`[SyncConfig] Persisted at prisma.user.syncData.configSync userId=${userId}`);
    rssFetchService.logConfigSyncSnapshot(String(userId), 'Persisted', persistedConfigSync);

    logger.debug(`[SyncConfig] Updated config for user ${userId}`);
    res.json({ success: true, updatedAt: nextConfigSync.updatedAt });
  } catch (error) {
    logger.error('[SyncConfig] POST failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/rss/public - Get public feeds from the global pool (No auth required)
router.get('/public', async (req: Request, res: Response) => {
  try {
    const feeds = await storageService.getPublicFeeds();
    res.json({ ok: true, feeds });
  } catch (error) {
    logger.error('[PublicFeeds] GET failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/public/lookup', async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    if (!url) {
      return res.status(400).json({ ok: false, error: 'URL is required' });
    }
    const feed = await storageService.getPublicFeedByUrl(url);
    res.json({ ok: true, feed });
  } catch (error) {
    logger.error('[PublicFeeds] LOOKUP failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ─── Daily Report Routes ─────────────────────────────────────────────────────

// GET /api/rss/daily-reports - Get daily reports for user
router.get('/daily-reports', async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '');
    if (!userId || userId === 'admin') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 50);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const reports = await dailyReportService.getReportsForUser(userId, limit, offset);
    res.json({ ok: true, reports });
  } catch (error) {
    logger.error('[DailyReport] GET list failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/rss/daily-reports/latest - Get latest daily report
router.get('/daily-reports/latest', async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '');
    if (!userId || userId === 'admin') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const report = await dailyReportService.getLatestReport(userId);
    if (!report) {
      return res.status(404).json({ ok: false, error: 'No daily report found' });
    }

    res.json({ ok: true, report });
  } catch (error) {
    logger.error('[DailyReport] GET latest failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/rss/daily-reports/:id - Get a single daily report
router.get('/daily-reports/:id', async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '');
    if (!userId || userId === 'admin') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const reportId = parseInt(req.params.id);
    if (isNaN(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID' });
    }

    const report = await dailyReportService.getReportById(reportId, userId);
    if (!report) {
      return res.status(404).json({ ok: false, error: 'Report not found' });
    }

    res.json({ ok: true, report });
  } catch (error) {
    logger.error('[DailyReport] GET by ID failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/rss/daily-reports/generate - Manually trigger daily report generation
router.post('/daily-reports/generate', async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '');
    if (!userId || userId === 'admin') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await dailyReportService.generateForUser(userId);
    if (!result) {
      return res.status(400).json({ ok: false, error: 'No articles or LLM config available for report generation' });
    }

    res.json({ ok: true, report: result });
  } catch (error) {
    logger.error('[DailyReport] Generate failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/rss/daily-reports/:id/read - Mark daily report as read
router.post('/daily-reports/:id/read', async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '');
    if (!userId || userId === 'admin') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const reportId = parseInt(req.params.id);
    if (isNaN(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID' });
    }

    const success = await dailyReportService.markAsRead(reportId, userId);
    if (!success) {
      return res.status(404).json({ ok: false, error: 'Report not found' });
    }

    res.json({ ok: true });
  } catch (error) {
    logger.error('[DailyReport] Mark read failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/rss/daily-reports/articles/cleaned - Get cleaned articles by date range for AI summary
router.get('/daily-reports/articles/cleaned', async (req: Request, res: Response) => {
  try {
    let userId = String((req as any)?.user?.id || '');

    // 如果是 Admin 身份，允许通过参数指定要查的 userId
    if (userId === 'admin' && req.query.userId) {
      userId = String(req.query.userId);
    } else if (!userId || userId === 'admin') {
      return res.status(401).json({ error: 'Unauthorized: missing user token or target userId' });
    }

    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'Missing required parameters: start, end (format: YYYY-MM-DD or ISO)' });
    }

    const startDate = new Date(start as string);
    const endDate = new Date(end as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for start or end' });
    }

    // Ensure end date covers the whole day if only date is provided
    if ((end as string).length <= 10) {
      endDate.setHours(23, 59, 59, 999);
    }

    if (startDate > endDate) {
      return res.status(400).json({ error: 'start date cannot be after end date' });
    }

    const articles = await dailyReportService.getCleanedArticlesForDateRange(userId, startDate, endDate);

    res.json({ ok: true, articles });
  } catch (error) {
    logger.error('[DailyReport] GET cleaned articles failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/daily-reports/articles/raw', async (req: Request, res: Response) => {
  try {
    let userId = String((req as any)?.user?.id || '');

    if (userId === 'admin' && req.query.userId) {
      userId = String(req.query.userId);
    } else if (!userId || userId === 'admin') {
      return res.status(401).json({ error: 'Unauthorized: missing user token or target userId' });
    }

    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'Missing required parameters: start, end (format: YYYY-MM-DD or ISO)' });
    }

    const startDate = new Date(start as string);
    const endDate = new Date(end as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for start or end' });
    }

    if ((end as string).length <= 10) {
      endDate.setHours(23, 59, 59, 999);
    }

    if (startDate > endDate) {
      return res.status(400).json({ error: 'start date cannot be after end date' });
    }

    const articles = await dailyReportService.getRawArticlesForDateRange(userId, startDate, endDate);

    res.json({ ok: true, articles });
  } catch (error) {
    logger.error('[DailyReport] GET raw articles failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
