import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import rssRoutes from './routes/rss';
import vocabRoutes from './routes/vocabulary';
import imageRoutes from './routes/image';
import adminRoutes from './routes/admin';
import authRoutes, { verifyToken } from './routes/auth';
import { logger } from './utils/Logger';
import { startRssAutoRefresh } from './routes/rss';
import { storageService } from './services/StorageService';

// Set timezone to Asia/Shanghai (UTC+8)
process.env.TZ = 'Asia/Shanghai';

{
  const cacheMemoryMbRaw = process.env.SHARP_CACHE_MEMORY_MB;
  const cacheMemoryMb = Number.isFinite(cacheMemoryMbRaw as any)
    ? Number(cacheMemoryMbRaw)
    : parseInt(String(cacheMemoryMbRaw || ''), 10);
  const effectiveCacheMemoryMb = Number.isFinite(cacheMemoryMb) ? Math.max(0, cacheMemoryMb) : 64;

  const concurrencyRaw = process.env.SHARP_CONCURRENCY;
  const concurrency = Number.isFinite(concurrencyRaw as any)
    ? Number(concurrencyRaw)
    : parseInt(String(concurrencyRaw || ''), 10);
  const effectiveConcurrency = Number.isFinite(concurrency) ? Math.max(1, concurrency) : 2;

  sharp.cache({ memory: effectiveCacheMemoryMb, files: 0, items: 200 });
  sharp.concurrency(effectiveConcurrency);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'))); // Serve public files

// Logger middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    
    // Skip health checks from logging to reduce noise
    if (req.url === '/health' && res.statusCode === 200) return;

    const isImage = req.originalUrl.startsWith('/api/image');
    
    if (isImage) {
      const cache = res.getHeader('X-Cache') || 'MISS';
      const contentType = res.getHeader('Content-Type') || 'unknown';
      const size = res.getHeader('Content-Length') || 0;
      const imageUrl = req.query.url || 'unknown';
      logger.request(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} (${durationMs}ms) [${cache}, ${contentType}, ${size}B, url=${imageUrl}]`);
      return;
    }

    logger.request(`${req.method} ${req.url} ${res.statusCode} (${durationMs}ms)`);
  });
  next();
});

// Meta Endpoint (Public) - For client capability detection
app.get('/api/meta', (req, res) => {
  let pkg: any = null;
  try {
    const pkgPath = path.join(__dirname, '../package.json');
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    pkg = null;
  }

  const envVersion =
    (process.env.SERVER_VERSION || process.env.APP_VERSION || process.env.VERSION || '').trim();
  const envBuild =
    (process.env.SERVER_BUILD || process.env.BUILD_NUMBER || process.env.BUILD_ID || '').trim();
  const envBuiltAt =
    (process.env.SERVER_BUILD_TIME || process.env.BUILD_TIME || process.env.BUILT_AT || '').trim();
  const envChangelogRaw =
    (process.env.SERVER_CHANGELOG || process.env.CHANGELOG || '').trim();

  let changelog: string[] = [];
  if (envChangelogRaw) {
    try {
      const parsed = JSON.parse(envChangelogRaw);
      if (Array.isArray(parsed)) {
        changelog = parsed.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim());
      }
    } catch {
      changelog = envChangelogRaw
        .split('\n')
        .map((v: string) => v.trim())
        .filter(Boolean);
    }
  } else if (pkg && Array.isArray(pkg.changelog)) {
    changelog = pkg.changelog.filter((v: any) => typeof v === 'string' && v.trim()).map((v: string) => v.trim());
  }

  const serverInfo = {
    name: typeof pkg?.name === 'string' ? pkg.name : 'readflow-server',
    version: envVersion || (typeof pkg?.version === 'string' ? pkg.version : 'unknown'),
    build: envBuild || null,
    builtAt: envBuiltAt || null,
    changelog,
  };

  const serverToken = process.env.SERVER_TOKEN;
  const requiresServerAccessKey = !!serverToken;
  let accessKeyValid: boolean | undefined = undefined;

  // If client sent a token, validate it to give feedback
  if (requiresServerAccessKey && req.headers['x-server-token']) {
    accessKeyValid = req.headers['x-server-token'] === serverToken;
  }

  res.json({
    ok: true,
    version: serverInfo.version,
    server: serverInfo,
    requiresServerAccessKey,
    accessKeyValid,
  });
});

// Server Token Middleware (Access Control)
const serverTokenMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!process.env.SERVER_TOKEN) {
    return next(); // No token configured, allow all
  }

  const token = req.headers['x-server-token'];
  if (token !== process.env.SERVER_TOKEN) {
    logger.warn(`[Access Control] Blocked request from ${req.ip} - Invalid Server Token`);
    return res.status(403).json({ error: 'Forbidden: Invalid or missing Server Token' });
  }
  next();
};

// Auth Middleware
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  const serverToken = process.env.SERVER_TOKEN;

  if (!authHeader) {
    // Check x-server-token as fallback
    if (serverToken && req.headers['x-server-token'] === serverToken) {
      (req as any).user = { id: 'admin' };
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split(' ')[1]; // Bearer <token>
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token format' });
  }

  // 1. Try Server Token
  if (serverToken && token === serverToken) {
    (req as any).user = { id: 'admin' };
    return next();
  }

  // 2. Try JWT
  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  // Attach user info to request if needed
  (req as any).user = { id: userId };
  next();
};

// Routes
app.use('/api/rss', authMiddleware, rssRoutes); // Protect RSS routes
app.use('/api/vocab', authMiddleware, vocabRoutes); // Protect Vocabulary routes
app.use('/api/image', imageRoutes); // Images might need to be public or protected depending on requirement. Usually public for <img> tags.
app.use('/api/admin', adminRoutes); // Admin should be protected too, but maybe separately or with same middleware?
// Let's protect Admin too for consistency with "Force Cloud Auth"
// app.use('/api/admin', authMiddleware, adminRoutes); 
// Note: Admin UI might not send Bearer token easily if it's a simple HTML. 
// For now, let's strictly protect /api/rss as requested for sync.

app.use('/api/auth', serverTokenMiddleware, authRoutes); // Auth routes protected by Server Token if set

app.get('/health', serverTokenMiddleware, (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Admin UI route (if accessing directly via /admin)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

async function start(): Promise<void> {
  await storageService.init();

  app.listen(PORT, () => {
    logger.system(`Server running on port ${PORT}`);
    startRssAutoRefresh();

    setTimeout(logServerStatus, 5000);
    setInterval(logServerStatus, 60 * 60 * 1000);

    let lastCleanupAt = 0;
    let cleanupRunning = false;
    const runCleanupIfDue = async () => {
      if (cleanupRunning) return;
      const settings = storageService.getSettings();
      const hours = settings.cleanupIntervalHours ?? 24;
      const intervalMs = Math.max(1, hours) * 60 * 60 * 1000;
      const now = Date.now();
      if (now - lastCleanupAt < intervalMs) return;
      cleanupRunning = true;
      try {
        const result = await storageService.cleanupArticles();
        lastCleanupAt = Date.now();
        const imageResult = await storageService.cleanupImageCache();
        const imageMb = Math.round(imageResult.remainingBytes / 1024 / 1024);
        logger.system(
          `Cleanup done | deletedByRetention=${result.deletedByRetention} deletedByMaxCount=${result.deletedByMaxCount} deletedImageByAge=${imageResult.deletedByAge} deletedImageByCap=${imageResult.deletedByCap} imageCacheFiles=${imageResult.remainingFiles} imageCacheSize=${imageMb}MB`
        );
      } catch (e) {
        logger.error('Cleanup failed', e);
      } finally {
        cleanupRunning = false;
      }
    };

    setTimeout(() => {
      runCleanupIfDue().catch(() => {});
    }, 30_000);

    setInterval(() => {
      runCleanupIfDue().catch(() => {});
    }, 60_000);
  });
}

start().catch(error => {
  logger.error('Server start failed:', error);
});

async function logServerStatus() {
  try {
    const mem = process.memoryUsage();
    const rssMb = Math.round(mem.rss / 1024 / 1024);
    const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
    const externalMb = Math.round(mem.external / 1024 / 1024);
    const arrayBuffersMb = Math.round(mem.arrayBuffers / 1024 / 1024);
    const uptime = Math.floor(process.uptime());
    const uptimeH = Math.floor(uptime / 3600);
    const uptimeM = Math.floor((uptime % 3600) / 60);
    
    const users = (await storageService.getUsers()).length;
    const feeds = (await storageService.getFeedsLight()).length;
    
    logger.system(
      `Status Update | Memory: rss=${rssMb}MB heap=${heapUsedMb}/${heapTotalMb}MB ext=${externalMb}MB ab=${arrayBuffersMb}MB | Uptime: ${uptimeH}h ${uptimeM}m | Users: ${users} | Feeds: ${feeds}`
    );
  } catch (e) {
    logger.error('Failed to log status', e);
  }
}
