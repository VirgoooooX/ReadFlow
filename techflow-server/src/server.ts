import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import rssRoutes from './routes/rss';
import imageRoutes from './routes/image';
import adminRoutes from './routes/admin';
import authRoutes, { verifyToken } from './routes/auth';
import { logger } from './utils/Logger';
import { startRssAutoRefresh } from './routes/rss';

dotenv.config();

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
    const isImage = req.originalUrl === '/api/image' || req.originalUrl.startsWith('/api/image?') || req.originalUrl.startsWith('/api/image/');
    if (isImage) {
      const contentType = res.getHeader('Content-Type') || '';
      const cache = res.getHeader('X-Cache') || '';
      const quality = res.getHeader('X-TechFlow-Image-Quality') || '';
      const requestedQ = res.getHeader('X-TechFlow-Image-RequestedQ') || '';
      const mode = res.getHeader('X-TechFlow-Image-Mode') || '';
      logger.info(`${req.method} ${req.url} -> ${res.statusCode} (${durationMs}ms) ct=${contentType} cache=${cache} mode=${mode} q=${quality} rq=${requestedQ}`);
      return;
    }

    logger.info(`${req.method} ${req.url} -> ${res.statusCode} (${durationMs}ms)`);
  });
  next();
});

// Auth Middleware
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    // Optional: Allow some public endpoints if needed, but for now we enforce it on applied routes
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split(' ')[1]; // Bearer <token>
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token format' });
  }

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
app.use('/api/image', imageRoutes); // Images might need to be public or protected depending on requirement. Usually public for <img> tags.
app.use('/api/admin', adminRoutes); // Admin should be protected too, but maybe separately or with same middleware?
// Let's protect Admin too for consistency with "Force Cloud Auth"
// app.use('/api/admin', authMiddleware, adminRoutes); 
// Note: Admin UI might not send Bearer token easily if it's a simple HTML. 
// For now, let's strictly protect /api/rss as requested for sync.

app.use('/api/auth', authRoutes); // Public auth routes

app.get('/health', (req, res) => {
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

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  startRssAutoRefresh();
});
