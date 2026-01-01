import express from 'express';
import { rssParserService } from '../services/RSSParserService';
import { RSSSource, Article } from '../types';
import { storageService } from '../services/StorageService';
import { getProxyUrl, needsProxy, proxyImages } from '../utils/RSSUtils';
import { logger } from '../utils/Logger';
import fetch from 'node-fetch'; // For warm-up requests

const router = express.Router();

let refreshTimer: NodeJS.Timeout | null = null;
let refreshRunning = false;
const refreshingFeedIds = new Set<string>();

function coerceBool(val: unknown): boolean {
  if (val === true) return true;
  if (val === false) return false;
  if (typeof val !== 'string') return false;
  return val === '1' || val.toLowerCase() === 'true';
}

function applyProxyToArticle(
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

/**
 * Pre-warm images for a list of articles (background task)
 * Extracts first 2 images from latest 5 articles and requests them from local proxy
 */
async function warmUpImages(articles: Omit<Article, 'id'>[], baseUrl: string = 'http://localhost:3000') {
  if (!articles || articles.length === 0) return;
  
  const settings = storageService.getSettings();
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

  // Execute in background without awaiting
  (async () => {
    for (let i = 0; i < chunkParams.length; i += 3) {
      const chunk = chunkParams.slice(i, i + 3);
      await Promise.all(chunk.map(async (u: string) => {
        try {
          // Add raw=1 if using weserv, but here we call our own /api/image
          // The getProxyUrl already constructs correct URL with q=...
          await fetch(u, { timeout: 10000 });
        } catch (e) {
          // Ignore errors during warm up
        }
      }));
    }
    logger.info(`[Pre-warm] Completed for ${chunkParams.length} images`);
  })();
}

async function refreshAllFeedsOnce() {
  if (refreshRunning) return;
  refreshRunning = true;
  try {
    const feeds = await storageService.getFeeds();
    if (!feeds || feeds.length === 0) return;

    const now = Date.now();
    const settings = storageService.getSettings();
    const globalIntervalSeconds = settings.rssRefreshIntervalSeconds ?? 900;

    for (const feed of feeds) {
      if (!feed?.url) continue;
      try {
        const intervalSeconds = feed.refreshIntervalSeconds ?? globalIntervalSeconds;
        if (intervalSeconds <= 0) continue;

        const last = feed.lastRefreshAt ? Date.parse(feed.lastRefreshAt) : 0;
        if (last && now - last < intervalSeconds * 1000) continue;
        if (refreshingFeedIds.has(feed.id)) continue;
        refreshingFeedIds.add(feed.id);

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

        const startedAtIso = new Date().toISOString();
        const articles = await rssParserService.fetchAndParseArticles(source, [], undefined, true, settings.imageQuality ?? 80, false);
        const result = await storageService.storeCanonicalArticlesForSource(feed.url, articles);

        await storageService.updateFeedRefreshState(feed.id, { lastRefreshAt: startedAtIso, status: 'ok' });

        logger.info(`[RSS Refresh] ${feed.name || feed.url} ok upserts=${result.upsertsCount} latest=${result.latestBlockId}`);
        
        // 🔥 Trigger image pre-warming (local loopback)
        // Assume default port 3000 if env not set
        const port = process.env.PORT || 3000;
        warmUpImages(articles, `http://localhost:${port}`);

      } catch (error) {
        const atIso = new Date().toISOString();
        await storageService.updateFeedRefreshState(feed.id, {
          lastRefreshAt: atIso,
          status: 'error',
          error: (error as Error)?.message || String(error),
        });
        logger.error(`[RSS Refresh] Failed for ${feed.url}:`, error);
      } finally {
        refreshingFeedIds.delete(feed.id);
      }
    }
  } finally {
    refreshRunning = false;
  }
}

export function startRssAutoRefresh() {
  if (refreshTimer) return;
  refreshAllFeedsOnce().catch(() => {});
  refreshTimer = setInterval(() => {
    refreshAllFeedsOnce().catch(() => {});
  }, 15_000);
}

// GET /api/rss?url=...
router.get('/', async (req, res) => {
  try {
    const url = req.query.url as string;
    const imageCompression = req.query.imageCompression === 'true';
    const imageQuality = storageService.getSettings().imageQuality ?? 80;

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
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const articles = await rssParserService.fetchAndParseArticles(
      source, 
      [], 
      baseUrl, 
      imageCompression, 
      imageQuality
    );
    res.json(articles);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/sync', async (req, res) => {
  try {
    const url = req.query.url as string;
    const since = req.query.since ? parseInt(req.query.since as string) : 0;
    const maxBlocks = req.query.maxBlocks ? parseInt(req.query.maxBlocks as string) : 20;
    const imageCompression = coerceBool(req.query.imageCompression);
    const imageQuality = storageService.getSettings().imageQuality ?? 80;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const { latest, blocks } = await storageService.getSyncBlocksForSource(url, Number.isFinite(since) ? since : 0, Number.isFinite(maxBlocks) ? maxBlocks : 20);

    const mappedBlocks = blocks.map(b => ({
      id: b.id,
      createdAt: b.createdAt,
      upserts: b.upserts.map(a => applyProxyToArticle(a, baseUrl, imageCompression, imageQuality)),
    }));

    res.json({
      sourceUrl: url,
      latest,
      blocks: mappedBlocks,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/profile', async (req, res) => {
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
      feeds,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
});

router.post('/clientSync', async (req, res) => {
  try {
    const { user, settings, feeds } = req.body || {};
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

    const savedFeeds = Array.isArray(feeds) ? await storageService.upsertFeedsFromClient(savedUser.id, feeds) : [];

    res.json({ ok: true, user: savedUser, feeds: savedFeeds.length });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/rss/refresh?url=... - Trigger manual refresh
router.post('/refresh', async (req, res) => {
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
      maxArticles: settings.rssMaxArticlesPerFeed ?? 20,
    };

    const atIso = new Date().toISOString();
    const articles = await rssParserService.fetchAndParseArticles(source, [], undefined, true, settings.imageQuality ?? 80, false);
    const result = await storageService.storeCanonicalArticlesForSource(feed.url, articles);
    
    await storageService.updateFeedRefreshState(feed.id, { lastRefreshAt: atIso, status: 'ok' });
    
    logger.info(`[RSS Manual Refresh] ${feed.name || feed.url} ok upserts=${result.upsertsCount}`);
    
    // 🔥 Trigger image pre-warming
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    warmUpImages(articles, baseUrl);

    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('[RSS Manual Refresh] Failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/rss/syncState - Upload user article states (read/favorite)
router.post('/syncState', async (req, res) => {
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
router.get('/syncState', async (req, res) => {
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
router.post('/parse', async (req, res) => {
  try {
    const { source, filterRules } = req.body;
    if (!source || !source.url) {
      return res.status(400).json({ error: 'Source with URL is required' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const settings = storageService.getSettings();
    const articles = await rssParserService.fetchAndParseArticles(source, filterRules || [], baseUrl, true, settings.imageQuality ?? 80);
    res.json({ articles });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/rss/validate?url=...
router.get('/validate', async (req, res) => {
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
    res.json(configSync);
  } catch (error) {
    logger.error('[SyncConfig] GET failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/rss/sync/config
router.post('/sync/config', async (req, res) => {
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
      return res.status(409).json({ 
        error: 'Conflict: Server has newer config',
        serverUpdatedAt: serverConfigSyncUpdatedAt 
      });
    }

    await storageService.upsertUserFromClient({
      id: userId,
      config: { configSync: nextConfigSync }
    });

    logger.info(`[SyncConfig] Updated config for user ${userId}`);
    res.json({ success: true, updatedAt: nextConfigSync.updatedAt });
  } catch (error) {
    logger.error('[SyncConfig] POST failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
