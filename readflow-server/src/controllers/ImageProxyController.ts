import { Request, Response } from 'express';
import fetch from 'node-fetch';
import sharp from 'sharp';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dns from 'dns';
import net from 'net';
import { Transform } from 'stream';
import { logger } from '../utils/Logger';
import { storageService } from '../services/StorageService';

export class ImageProxyController {
  private static readonly rateWindowMs = 60_000;
  private static readonly ipRate = new Map<string, { window: number; count: number; lastSeenAt: number }>();

  private static isPrivateIp(ip: string): boolean {
    const v = net.isIP(ip);
    if (v === 4) {
      const parts = ip.split('.').map((p) => parseInt(p, 10));
      if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true;
      const [a, b] = parts;
      if (a === 10) return true;
      if (a === 127) return true;
      if (a === 0) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 100 && b >= 64 && b <= 127) return true;
      if (a >= 224) return true;
      return false;
    }
    if (v === 6) {
      const normalized = ip.toLowerCase();
      if (normalized === '::1' || normalized === '::') return true;
      if (normalized.startsWith('fe80:')) return true;
      if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
      return false;
    }
    return true;
  }

  private static async assertSafeRemoteUrl(urlStr: string): Promise<URL> {
    let urlObj: URL;
    try {
      urlObj = new URL(urlStr);
    } catch {
      throw new Error('Invalid url');
    }
    const protocol = urlObj.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') throw new Error('Unsupported url protocol');
    if (urlObj.username || urlObj.password) throw new Error('URL must not contain credentials');
    const hostname = urlObj.hostname;
    if (!hostname) throw new Error('Invalid url hostname');
    if (hostname === 'localhost') throw new Error('Blocked host');
    const ipType = net.isIP(hostname);
    if (ipType) {
      if (this.isPrivateIp(hostname)) throw new Error('Blocked private address');
      return urlObj;
    }
    const lookup = dns.promises.lookup(hostname, { all: true });
    const records = await Promise.race([
      lookup,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DNS lookup timeout')), 2000)),
    ]);
    for (const r of records) {
      if (this.isPrivateIp(String((r as any).address || ''))) {
        throw new Error('Blocked private address');
      }
    }
    return urlObj;
  }

  private static createByteLimitStream(maxBytes: number) {
    let total = 0;
    return new Transform({
      transform(chunk, _enc, cb) {
        total += (chunk as Buffer).length;
        if (total > maxBytes) {
          cb(new Error('Image too large'));
          return;
        }
        cb(null, chunk);
      }
    });
  }

  private static getClientIp(req: Request): string {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.trim()) {
      return xf.split(',')[0].trim();
    }
    return String((req as any).ip || (req as any).socket?.remoteAddress || '');
  }

  private static isRateLimited(req: Request, limitPerMin: number): boolean {
    if (limitPerMin <= 0) return false;
    const ip = this.getClientIp(req);
    if (!ip) return false;
    const now = Date.now();
    const window = Math.floor(now / this.rateWindowMs);
    const key = `${ip}:${window}`;
    const prev = this.ipRate.get(key);
    const nextCount = (prev?.count || 0) + 1;
    this.ipRate.set(key, { window, count: nextCount, lastSeenAt: now });

    if (this.ipRate.size > 20_000) {
      const pruneBefore = now - 5 * this.rateWindowMs;
      for (const [k, v] of this.ipRate.entries()) {
        if (v.lastSeenAt < pruneBefore) this.ipRate.delete(k);
      }
    }

    return nextCount > limitPerMin;
  }

  private static async fetchWithSafeRedirects(
    startUrl: string,
    init: any,
    maxHops: number
  ): Promise<{ response: any; finalUrl: string }> {
    let current = startUrl;
    for (let i = 0; i <= maxHops; i++) {
      await this.assertSafeRemoteUrl(current);
      const resp = await fetch(current, { ...init, redirect: 'manual' } as any);
      const status = resp?.status;
      const isRedirect = status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
      if (!isRedirect) return { response: resp, finalUrl: current };

      const loc = String(resp.headers?.get?.('location') || '').trim();
      try {
        (resp as any).body?.destroy?.();
      } catch {
      }
      if (!loc) return { response: resp, finalUrl: current };
      if (i >= maxHops) throw new Error('Too many redirects');
      current = new URL(loc, current).toString();
    }
    throw new Error('Too many redirects');
  }

  /**
   * 代理并处理图片
   * GET /api/image?url=...&w=...&q=...
   */
  static async proxyImage(req: Request, res: Response) {
    let imageUrl = String(req.query.url || '').trim();
    imageUrl = imageUrl.replace(/`/g, '').trim();
    while (
      (imageUrl.startsWith('"') && imageUrl.endsWith('"')) ||
      (imageUrl.startsWith("'") && imageUrl.endsWith("'"))
    ) {
      imageUrl = imageUrl.slice(1, -1).trim();
    }
    while (imageUrl.endsWith(']') || imageUrl.endsWith(')') || imageUrl.endsWith('>')) {
      imageUrl = imageUrl.slice(0, -1).trim();
    }
    const widthRaw = req.query.w ? parseInt(req.query.w as string) : null;
    const settings = storageService.getSettings();
    const transcodeEnabled = settings.imageTranscodeEnabled !== false;
    const rawRequested = req.query.raw === '1' || req.query.raw === 'true' || req.query.mode === 'raw';
    const raw = rawRequested || !transcodeEnabled;
    const requestedQRaw = req.query.q ? parseInt(req.query.q as string) : null;
    const requestedQ = Number.isFinite(requestedQRaw) ? requestedQRaw : null;
    const quality = requestedQ === 100 ? 100 : (settings.imageQuality || 80);
    const maxWidthRaw = parseInt(String(process.env.IMAGE_MAX_WIDTH || ''), 10);
    const maxWidth = Number.isFinite(maxWidthRaw) && maxWidthRaw > 0 ? maxWidthRaw : 2048;
    const width = widthRaw && widthRaw > 0 ? Math.min(widthRaw, maxWidth) : null;
    const maxBytesRaw = parseInt(String(process.env.IMAGE_MAX_BYTES || ''), 10);
    const maxBytes = Number.isFinite(maxBytesRaw) && maxBytesRaw > 0 ? maxBytesRaw : 25 * 1024 * 1024;
    const weservEnabled = (() => {
      const v = String(process.env.IMAGE_WESERV_FALLBACK_ENABLED || '').trim().toLowerCase();
      if (!v) return process.env.NODE_ENV !== 'production';
      return v === '1' || v === 'true';
    })();

    if (!imageUrl) {
      return res.status(400).send('Missing url parameter');
    }

    const cacheDir = path.join(process.cwd(), 'public', 'cache');
    const cacheFile = raw
      ? null
      : path.join(
          cacheDir,
          `${crypto.createHash('md5').update(`${imageUrl}-${width || 'orig'}-${quality}`).digest('hex')}.webp`
        );

    try {
      const controller = new AbortController();
      const timeoutMsRaw = parseInt(String(process.env.IMAGE_FETCH_TIMEOUT_MS || ''), 10);
      const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 15000;
      const timeoutId = setTimeout(() => {
        try { controller.abort(); } catch { }
      }, timeoutMs);
      let response: any | null = null;
      let transformer: any | null = null;
      let cacheHitStream: fs.ReadStream | null = null;
      let finished = false;

      const cleanup = () => {
        if (finished) return;
        finished = true;
        try {
          controller.abort();
        } catch {
        }
        try {
          clearTimeout(timeoutId);
        } catch {
        }
        try {
          (response as any)?.body?.destroy?.();
        } catch {
        }
        try {
          transformer?.destroy?.();
        } catch {
        }
        try {
          cacheHitStream?.destroy?.();
        } catch {
        }
      };

      res.on('close', cleanup);
      res.on('error', cleanup);

      // 1. 检查缓存
      if (cacheFile && fs.existsSync(cacheFile)) {
        // 检查文件是否完整（简单检查大小）
        const stats = fs.statSync(cacheFile);
        if (stats.size > 0) {
          res.setHeader('Content-Type', 'image/webp');
          res.setHeader('Cache-Control', 'public, max-age=31536000');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('X-Cache', 'HIT');
          if (requestedQ !== null) res.setHeader('X-ReadFlow-Image-RequestedQ', String(requestedQ));
          res.setHeader('X-ReadFlow-Image-Quality', String(quality));
          if (width && width > 0) res.setHeader('X-ReadFlow-Image-Width', String(width));
          res.setHeader('X-ReadFlow-Image-Mode', 'webp');
          const stream = fs.createReadStream(cacheFile);
          cacheHitStream = stream;
          stream.on('error', () => {
            if (!res.headersSent) res.status(500).send('Image cache read failed');
          });
          fs.promises.utimes(cacheFile, new Date(), new Date()).catch(() => { });
          stream.pipe(res);
          return;
        }
      }

      const rateLimitRaw = parseInt(String(process.env.IMAGE_RATE_LIMIT_PER_IP_PER_MIN || ''), 10);
      const rateLimit = Number.isFinite(rateLimitRaw) && rateLimitRaw > 0 ? rateLimitRaw : 0;
      if (ImageProxyController.isRateLimited(req, rateLimit)) {
        return res.status(429).send('Too many requests');
      }

      // 2. 获取远程图片
      // 伪造 Headers 以绕过简单的防盗链
      const userAgent =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

      const getReferers = (url: string): string[] => {
        try {
          const urlObj = new URL(url);
          const hostname = urlObj.hostname;
          if (hostname.includes('cnbetacdn.com')) {
            return ['https://www.cnbeta.com.tw/', 'https://m.cnbeta.com.tw/', 'https://www.cnbeta.com/'];
          }
          if (hostname.includes('sspai.com')) return ['https://sspai.com/'];
          if (hostname.includes('ifanr.com') || hostname.includes('ifanr.cn')) return ['https://www.ifanr.com/'];
          
          if (hostname.includes('qpic.cn') || hostname.includes('qlogo.cn')) return ['https://mp.weixin.qq.com/'];
          if (hostname.includes('zhimg.com')) return ['https://www.zhihu.com/'];
          if (hostname.includes('sinaimg.cn')) return ['https://weibo.com/'];
          if (hostname.includes('doubanio.com')) return ['https://www.douban.com/'];
          if (hostname.includes('jianshu.io')) return ['https://www.jianshu.com/'];
          if (hostname.includes('toutiaoimg.com')) return ['https://www.toutiao.com/'];
          if (hostname.includes('36krcdn.com')) return ['https://36kr.com/'];

          return [urlObj.origin];
        } catch {
          return [];
        }
      };

      const buildHeaders = (referer?: string): Record<string, string> => {
        const headers: Record<string, string> = {
          'User-Agent': userAgent,
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Sec-Fetch-Dest': 'image',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'cross-site',
        };
        if (referer) {
          headers['Referer'] = referer;
          try {
            headers['Origin'] = new URL(referer).origin;
          } catch {
          }
        }
        return headers;
      };

      const referers = getReferers(imageUrl);
      let lastStatus: number | null = null;
      let lastReferer = '';

      for (const referer of referers.length > 0 ? referers : ['']) {
        lastReferer = referer;
        const result = await ImageProxyController.fetchWithSafeRedirects(
          imageUrl,
          { headers: buildHeaders(referer), signal: controller.signal },
          3
        );
        response = result.response;
        if (response.ok) break;
        lastStatus = response.status;
        if (response.status !== 403 && response.status !== 401) break;
        try {
          (response as any).body?.destroy?.();
        } catch {
        }
      }

      if (weservEnabled && response && !response.ok && (lastStatus === 403 || lastStatus === 401)) {
        lastReferer = 'https://images.weserv.nl/';
        const fallbackUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}`;
        response = (await ImageProxyController.fetchWithSafeRedirects(
          fallbackUrl,
          { headers: buildHeaders(lastReferer), signal: controller.signal },
          2
        )).response;
      }

      if (!response.ok) {
        logger.warn(`Failed to fetch image: ${imageUrl}, status: ${response.status}, referer: ${lastReferer || '-'}`);
        return res.status(response.status).send(`Failed to fetch image`);
      }

      const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
      if (contentType) {
        const okImage = contentType.startsWith('image/');
        const likelyNotImage =
          contentType.startsWith('text/') ||
          contentType.includes('html') ||
          contentType.includes('json') ||
          contentType.includes('xml');
        if (!okImage && (!raw || likelyNotImage)) {
          return res.status(415).send('Unsupported media type');
        }
      }

      const contentLengthRaw = response.headers?.get?.('content-length');
      const contentLength = contentLengthRaw ? parseInt(String(contentLengthRaw), 10) : NaN;
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        return res.status(413).send('Image too large');
      }

      if (raw) {
        res.setHeader('Content-Type', response.headers?.get?.('content-type') || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Cache', 'BYPASS');
        if (requestedQ !== null) res.setHeader('X-ReadFlow-Image-RequestedQ', String(requestedQ));
        res.setHeader('X-ReadFlow-Image-Mode', 'raw');
        res.setHeader('X-ReadFlow-Image-Source-ContentType', response.headers?.get?.('content-type') || '');
        res.setHeader('X-ReadFlow-Image-Source-ContentLength', response.headers?.get?.('content-length') || '');
        const limiter = ImageProxyController.createByteLimitStream(maxBytes);
        limiter.on('error', () => {
          cleanup();
          if (!res.headersSent) res.status(413).send('Image too large');
        });
        response.body.pipe(limiter).pipe(res);
        return;
      }

      // 3. 设置响应头
      res.setHeader('Content-Type', 'image/webp'); // 统一转换为 WebP
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 强缓存 1 年
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Cache', 'MISS');
      if (requestedQ !== null) res.setHeader('X-ReadFlow-Image-RequestedQ', String(requestedQ));
      res.setHeader('X-ReadFlow-Image-Quality', String(quality));
      if (width && width > 0) res.setHeader('X-ReadFlow-Image-Width', String(width));
      res.setHeader('X-ReadFlow-Image-Mode', 'webp');
      res.setHeader('X-ReadFlow-Image-Source-ContentType', response.headers?.get?.('content-type') || '');
      res.setHeader('X-ReadFlow-Image-Source-ContentLength', response.headers?.get?.('content-length') || '');

      // 4. 图片处理管道
      transformer = sharp();

      // 调整尺寸 (如果指定)
      if (width && width > 0) {
        transformer = transformer.resize({ width, withoutEnlargement: true });
      }

      // 转换为 WebP 并压缩
      transformer = transformer.webp({ quality });

      // 5. 保存到缓存并响应
      // 使用 clone() 创建两个流：一个写入文件，一个响应给客户端
      // 注意：response.body 是 Node stream，只能消费一次。
      // sharp 实例也是流。
      
      // 正确做法：response.body -> sharp -> (file + res)
      // sharp 支持 .toFile() 返回 Promise，但我们想流式响应。
      // 我们可以使用 PassThrough 流或者 sharp 的 clone()。
      
      // 为了性能，我们先处理到 buffer (如果不大的话) 或者使用临时文件。
      // 考虑到内存，pipe 到文件，文件写入完成后再 pipe 给 res？太慢。
      // pipe 到 res 同时 pipe 到文件？
      // sharp pipeline:
      
      // 方法 A: response.body.pipe(transformer).pipe(res); 并同时 .toFile(cacheFile)
      // transformer.clone().toFile(cacheFile);
      
      // 确保目录存在 (StorageService 已经初始化，但为了保险)
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      // 开始处理
      const limiter = ImageProxyController.createByteLimitStream(maxBytes);
      limiter.on('error', () => {
        cleanup();
        if (!res.headersSent) res.status(413).send('Image too large');
      });
      transformer.on('error', () => {
        cleanup();
        if (!res.headersSent) res.status(415).send('Invalid image');
      });
      response.body.pipe(limiter).pipe(transformer);
      
      // 分支 1: 写入缓存 (异步)
      transformer.clone().toFile(cacheFile!).catch((err: any) => {
        logger.error(`Failed to write cache file ${cacheFile}:`, err);
        // 尝试删除可能损坏的文件
        if (cacheFile && fs.existsSync(cacheFile)) fs.unlinkSync(cacheFile);
      });

      // 分支 2: 响应客户端
      transformer.pipe(res);

    } catch (error) {
      logger.error('Image proxy error:', error);
      if (!res.headersSent) {
        res.status(500).send('Image proxy failed');
      }
    }
  }
}
