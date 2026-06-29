import express from 'express';
import { storageService } from '../services/StorageService';
import { logger } from '../utils/Logger';
import { rssParserService } from '../services/RSSParserService';
import { RSSSource } from '../types';
import { simpleHash } from '../utils/RSSUtils';
import { generateAdminToken, verifyAdminToken } from './auth';
import { ValidationError, validateString, validateInt, validateUrl } from '../utils/validation';

const router = express.Router();
const adminLoginAttempts = new Map<string, { count: number; windowStart: number; lockedUntil: number }>();
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const ADMIN_LOGIN_LOCK_MS = 15 * 60 * 1000;

function getHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function getClientIp(req: express.Request): string {
  const forwarded = getHeaderValue(req.headers['x-forwarded-for']);
  if (forwarded) return forwarded.split(',')[0].trim();
  return String(req.ip || req.socket.remoteAddress || 'unknown');
}

function getAdminToken(req: express.Request): string {
  const authHeader = getHeaderValue(req.headers.authorization);
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return getHeaderValue(req.headers['x-admin-token']);
}

function getAdminLoginAttempt(ip: string) {
  const now = Date.now();
  const existing = adminLoginAttempts.get(ip);
  if (!existing || now - existing.windowStart >= ADMIN_LOGIN_WINDOW_MS) {
    const next = { count: 0, windowStart: now, lockedUntil: 0 };
    adminLoginAttempts.set(ip, next);
    return next;
  }
  return existing;
}

function isAdminLoginLocked(ip: string): boolean {
  const attempt = getAdminLoginAttempt(ip);
  return attempt.lockedUntil > Date.now();
}

function recordAdminLoginFailure(ip: string): number {
  const attempt = getAdminLoginAttempt(ip);
  attempt.count += 1;
  if (attempt.count >= ADMIN_LOGIN_MAX_ATTEMPTS) {
    attempt.lockedUntil = Date.now() + ADMIN_LOGIN_LOCK_MS;
  }

  if (adminLoginAttempts.size > 10_000) {
    const pruneBefore = Date.now() - ADMIN_LOGIN_WINDOW_MS;
    for (const [key, value] of adminLoginAttempts.entries()) {
      if (value.windowStart < pruneBefore && value.lockedUntil < Date.now()) {
        adminLoginAttempts.delete(key);
      }
    }
  }

  return attempt.count;
}

function clearAdminLoginFailures(ip: string): void {
  adminLoginAttempts.delete(ip);
}

// Auth Middleware
const requireAdminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = getAdminToken(req);
  if (token && verifyAdminToken(token)) {
    next();
  } else {
    logger.warn(`[Admin] Unauthorized request ip=${getClientIp(req)} method=${req.method} path=${req.path}`);
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Login Route (Public)
router.post('/login', (req, res) => {
  const { password } = req.body;
  const ip = getClientIp(req);

  if (isAdminLoginLocked(ip)) {
    logger.warn(`[Admin] Login rate limited ip=${ip}`);
    return res.status(429).json({ success: false, error: 'Too many login attempts' });
  }

  const settings = storageService.getSettings();
  const currentPassword = settings.adminPassword || 'admin';

  if (password === currentPassword) {
    clearAdminLoginFailures(ip);
    logger.info(`[Admin] Login success ip=${ip}`);
    res.json({ success: true, token: generateAdminToken() });
  } else {
    const attempts = recordAdminLoginFailure(ip);
    logger.warn(`[Admin] Login failed ip=${ip} attempts=${attempts}`);
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Protect all other routes
router.use(requireAdminAuth);

// Settings
router.get('/settings', (req, res) => {
  res.json(storageService.getAdminSettings());
});

router.post('/settings', (req, res) => {
  (async () => {
    try {
      await storageService.saveSettings(req.body);
      const next = storageService.getSettings();
      if ((next.retentionDays ?? 0) > 0 || (next.retentionMaxArticlesPerFeed ?? 0) > 0) {
        void storageService.cleanupArticles()
          .then(result => {
            logger.system(
              `Settings-triggered cleanup done | deletedByRetention=${result.deletedByRetention} deletedByMaxCount=${result.deletedByMaxCount}`
            );
          })
          .catch(error => logger.error('Settings-triggered cleanup failed', error));
      }
      res.json(storageService.getAdminSettings());
    } catch (error) {
      res.status(500).json({ error: 'Failed to save settings' });
    }
  })().catch(() => { });
});

router.get('/llm-usage', async (req, res) => {
  try {
    const daysRaw = String((req.query as any)?.days ?? '7').trim();
    const days = Math.min(90, Math.max(1, parseInt(daysRaw, 10) || 7));
    const rows = await storageService.getLLMUsageSummary(days);
    res.json({ rangeDays: days, rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load llm usage' });
  }
});

// Users
router.get('/users', async (req, res) => {
  res.json(await storageService.getUsers());
});

router.post('/users', async (req, res) => {
  try {
    const user = {
      ...req.body,
      id: req.body.id || Date.now().toString(),
      lastActive: new Date()
    };
    await storageService.saveUser(user);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save user' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const id = validateString(req.params.id, 'id', { required: true, maxLength: 255 });
    await storageService.deleteUser(id);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.get('/users/:id/feeds', async (req, res) => {
  try {
    const id = validateString(req.params.id, 'id', { required: true, maxLength: 255 });
    res.json(await storageService.getFeedsForUser(id));
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to load user feeds' });
  }
});

// Feeds
router.get('/feeds', async (req, res) => {
  res.json(await storageService.getFeeds());
});

router.post('/feeds', async (req, res) => {
  try {
    const nowIso = new Date().toISOString();
    const defaults = storageService.getSettings();
    const normalizedUrl = validateUrl(req.body?.url, 'url', {
      required: true,
      maxLength: 2048,
      stripTrailingSlash: true,
      allowRssHub: true,
    });
    const id = String(simpleHash(normalizedUrl));
    const refreshCronRaw = req.body?.refreshCron;
    const refreshCron =
      refreshCronRaw === undefined
        ? undefined
        : refreshCronRaw === null
          ? null
          : validateString(refreshCronRaw, 'refreshCron', { maxLength: 100 }) || null;
    const feed = {
      ...req.body,
      url: normalizedUrl,
      createdAt: req.body.createdAt || nowIso,
      updatedAt: nowIso,
      refreshIntervalSeconds: req.body.refreshIntervalSeconds ?? defaults.rssDefaultRefreshIntervalSeconds ?? 900,
      refreshCron,
      isPublic: req.body.isPublic === true,
      description: req.body.description || null,
    };
    await storageService.saveFeed(feed);

    // Fetch the real record to get the autoincrement ID
    const feeds = await storageService.getFeeds();
    const realFeed = feeds.find(f => f.url === normalizedUrl);
    res.json(realFeed || feed);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to save feed' });
  }
});

router.put('/feeds/:id', async (req, res) => {
  try {
    const id = validateString(req.params.id, 'id', { required: true, maxLength: 255 });
    const feeds = await storageService.getFeeds();
    const existing = feeds.find(f => f.id === id);
    if (!existing) return res.status(404).json({ error: 'Feed not found' });
    const nowIso = new Date().toISOString();
    const next = {
      ...existing,
      ...req.body,
      id: existing.id,
      updatedAt: nowIso,
      isPublic: req.body.isPublic ?? (existing as any).isPublic ?? false,
      description: req.body.description ?? (existing as any).description ?? null,
    };
    await storageService.saveFeed(next);
    res.json(next);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update feed' });
  }
});

router.delete('/feeds/:id', async (req, res) => {
  try {
    const id = validateString(req.params.id, 'id', { required: true, maxLength: 255 });
    await storageService.deleteFeed(id);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to delete feed' });
  }
});

router.get('/feeds/:id/users', async (req, res) => {
  try {
    const id = validateString(req.params.id, 'id', { required: true, maxLength: 255 });
    res.json(await storageService.getUsersForFeed(id));
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to load feed users' });
  }
});

router.get('/feeds/:id/articles', async (req, res) => {
  try {
    const id = validateString(req.params.id, 'id', { required: true, maxLength: 255 });
    const feeds = await storageService.getFeeds();
    const feed = feeds.find(f => f.id === id);
    if (!feed) return res.status(404).json({ error: 'Feed not found' });
    const limit = validateInt(req.query.limit, 'limit', { min: 1, max: 1000, defaultValue: 20 });
    const offset = validateInt(req.query.offset, 'offset', { min: 0, defaultValue: 0 });
    res.json(await storageService.getCachedArticlesForSource(feed.url, { limit, offset }));
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to load cached articles' });
  }
});

router.post('/feeds/:id/refresh', async (req, res) => {
  try {
    const id = validateString(req.params.id, 'id', { required: true, maxLength: 255 });
    const feeds = await storageService.getFeeds();
    const feed = feeds.find(f => f.id === id);
    if (!feed) return res.status(404).json({ error: 'Feed not found' });

    const settings = storageService.getSettings();
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
    res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/feeds/:id/data/clear', async (req, res) => {
  try {
    const id = validateString(req.params.id, 'id', { required: true, maxLength: 255 });
    const feeds = await storageService.getFeeds();
    const feed = feeds.find(f => f.id === id);
    if (!feed) return res.status(404).json({ error: 'Feed not found' });
    await storageService.clearSourceCachedData(feed.url);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to clear feed data' });
  }
});

router.get('/cache/images', (req, res) => {
  try {
    const limit = validateInt(req.query.limit, 'limit', { min: 1, max: 1000, defaultValue: 100 });
    const offset = validateInt(req.query.offset, 'offset', { min: 0, defaultValue: 0 });
    res.json(storageService.listCachedImages({ limit, offset }));
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to list cached images' });
  }
});

router.delete('/cache/images/:name', (req, res) => {
  try {
    const name = validateString(req.params.name, 'name', { required: true, maxLength: 255 });
    storageService.deleteCachedImage(name);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const users = (await storageService.getUsers()).length;
    const feeds = (await storageService.getFeeds()).length;
    const articleCache = await storageService.getArticleCacheStats();
    const imageCache = storageService.listCachedImages({ limit: 1, offset: 0 }).total;

    // New fields
    const dbSize = await storageService.getDatabaseSize();
    const imageCacheSize = storageService.getImageCacheTotalSize();
    const recentArticleCount = await storageService.getRecentArticleCount(24);

    res.json({
      users,
      feeds,
      articleCache,
      imageCache,
      storage: {
        dbSize,
        imageCacheSize,
        recentArticleCount
      },
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        loadAvg: [0, 0, 0] // process.loadavg() is not available on Windows usually, or use os.loadavg()
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load status' });
  }
});

router.get('/logs', (req, res) => {
  try {
    const limit = validateInt(req.query.limit, 'limit', { min: 1, max: 1000, defaultValue: 100 });
    res.json(logger.getLogs(limit));
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/maintenance/prune-articles', async (req, res) => {
  try {
    const days = validateInt(req.body.days, 'days', { min: 1, max: 3650, defaultValue: 30 });
    const count = await storageService.pruneArticles(days);
    res.json({ success: true, count, message: `Pruned ${count} articles older than ${days} days` });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to prune articles' });
  }
});

router.post('/maintenance/prune-images', (req, res) => {
  try {
    const days = validateInt(req.body.days, 'days', { min: 1, max: 3650, defaultValue: 30 });
    const result = storageService.pruneImages(days);
    res.json({ success: true, ...result, message: `Pruned ${result.count} images (${(result.size / 1024 / 1024).toFixed(2)}MB) older than ${days} days` });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to prune images' });
  }
});

router.post('/maintenance/cleanup', async (req, res) => {
  try {
    const result = await storageService.cleanupArticles();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cleanup articles' });
  }
});

// Maintenance
router.post('/cache/clear', async (req, res) => {
  try {
    await storageService.clearCache();
    res.json({ success: true, message: 'Image cache cleared' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

router.post('/data/clear', async (req, res) => {
  try {
    await storageService.clearData();
    res.json({ success: true, message: 'All data cleared' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear data' });
  }
});

router.post('/articles/clear', async (req, res) => {
  try {
    await storageService.clearArticles();
    res.json({ success: true, message: 'Articles cleared' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear articles' });
  }
});

export default router;
