import express from 'express';
import { storageService } from '../services/StorageService';
import { logger } from '../utils/Logger';
import { rssParserService } from '../services/RSSParserService';
import { RSSSource } from '../types';
import { simpleHash } from '../utils/RSSUtils';

const router = express.Router();

function normalizeUrl(url: string): string {
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

// Auth Middleware
const requireAdminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const settings = storageService.getSettings();
  const password = settings.adminPassword || 'admin';
  const authHeader = req.headers['x-admin-token'];
  
  if (authHeader === password) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Login Route (Public)
router.post('/login', (req, res) => {
  const { password } = req.body;
  const settings = storageService.getSettings();
  const currentPassword = settings.adminPassword || 'admin';
  
  if (password === currentPassword) {
    res.json({ success: true, token: currentPassword });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Protect all other routes
router.use(requireAdminAuth);

// Settings
router.get('/settings', (req, res) => {
  res.json(storageService.getSettings());
});

router.post('/settings', (req, res) => {
  try {
    storageService.saveSettings(req.body);
    res.json(storageService.getSettings());
  } catch (error) {
    res.status(500).json({ error: 'Failed to save settings' });
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
    await storageService.deleteUser(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.get('/users/:id/feeds', async (req, res) => {
  try {
    res.json(await storageService.getFeedsForUser(req.params.id));
  } catch (error) {
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
    const normalizedUrl = normalizeUrl(req.body?.url);
    if (!normalizedUrl) return res.status(400).json({ error: 'Feed url is required' });
    const id = String(simpleHash(normalizedUrl));
    const feed = {
      ...req.body,
      id,
      url: normalizedUrl,
      createdAt: req.body.createdAt || nowIso,
      updatedAt: nowIso,
      refreshIntervalSeconds: req.body.refreshIntervalSeconds ?? defaults.rssRefreshIntervalSeconds ?? 900,
    };
    await storageService.saveFeed(feed);
    res.json(feed);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save feed' });
  }
});

router.put('/feeds/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const feeds = await storageService.getFeeds();
    const existing = feeds.find(f => f.id === id);
    if (!existing) return res.status(404).json({ error: 'Feed not found' });
    const nowIso = new Date().toISOString();
    const next = {
      ...existing,
      ...req.body,
      id: existing.id,
      updatedAt: nowIso,
    };
    await storageService.saveFeed(next);
    res.json(next);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update feed' });
  }
});

router.delete('/feeds/:id', async (req, res) => {
  try {
    await storageService.deleteFeed(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete feed' });
  }
});

router.get('/feeds/:id/users', async (req, res) => {
  try {
    res.json(await storageService.getUsersForFeed(req.params.id));
  } catch (error) {
    res.status(500).json({ error: 'Failed to load feed users' });
  }
});

router.get('/feeds/:id/articles', async (req, res) => {
  try {
    const id = req.params.id;
    const feeds = await storageService.getFeeds();
    const feed = feeds.find(f => f.id === id);
    if (!feed) return res.status(404).json({ error: 'Feed not found' });
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    res.json(await storageService.getCachedArticlesForSource(feed.url, { limit, offset }));
  } catch (error) {
    res.status(500).json({ error: 'Failed to load cached articles' });
  }
});

router.post('/feeds/:id/refresh', async (req, res) => {
  try {
    const id = req.params.id;
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
      maxArticles: settings.rssMaxArticlesPerFeed ?? 20,
    };

    const atIso = new Date().toISOString();
    const articles = await rssParserService.fetchAndParseArticles(source, [], undefined, true, settings.imageQuality ?? 80, false);
    const result = await storageService.storeCanonicalArticlesForSource(feed.url, articles);
    await storageService.updateFeedRefreshState(feed.id, { lastRefreshAt: atIso, status: 'ok' });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/feeds/:id/data/clear', async (req, res) => {
  try {
    const id = req.params.id;
    const feeds = await storageService.getFeeds();
    const feed = feeds.find(f => f.id === id);
    if (!feed) return res.status(404).json({ error: 'Feed not found' });
    await storageService.clearSourceCachedData(feed.url);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear feed data' });
  }
});

router.get('/cache/images', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    res.json(storageService.listCachedImages({ limit, offset }));
  } catch (error) {
    res.status(500).json({ error: 'Failed to list cached images' });
  }
});

router.delete('/cache/images/:name', (req, res) => {
  try {
    storageService.deleteCachedImage(req.params.name);
    res.json({ success: true });
  } catch (error) {
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
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
  res.json(logger.getLogs(limit));
});

router.post('/maintenance/prune-articles', async (req, res) => {
  try {
    const days = parseInt(req.body.days || '30');
    const count = await storageService.pruneArticles(days);
    res.json({ success: true, count, message: `Pruned ${count} articles older than ${days} days` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to prune articles' });
  }
});

router.post('/maintenance/prune-images', (req, res) => {
  try {
    const days = parseInt(req.body.days || '30');
    const result = storageService.pruneImages(days);
    res.json({ success: true, ...result, message: `Pruned ${result.count} images (${(result.size/1024/1024).toFixed(2)}MB) older than ${days} days` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to prune images' });
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
