import { Request, Response } from 'express';
import fetch from 'node-fetch';
import sharp from 'sharp';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/Logger';
import { storageService } from '../services/StorageService';

export class ImageProxyController {
  /**
   * 代理并处理图片
   * GET /api/image?url=...&w=...&q=...
   */
  static async proxyImage(req: Request, res: Response) {
    const imageUrl = req.query.url as string;
    const width = req.query.w ? parseInt(req.query.w as string) : null;
    const raw = req.query.raw === '1' || req.query.raw === 'true' || req.query.mode === 'raw';
    
    const settings = storageService.getSettings();
    const requestedQRaw = req.query.q ? parseInt(req.query.q as string) : null;
    const requestedQ = Number.isFinite(requestedQRaw) ? requestedQRaw : null;
    const quality = requestedQ === 100 ? 100 : (settings.imageQuality || 80);

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
          stream.pipe(res);
          return;
        }
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
        response = await fetch(imageUrl, { headers: buildHeaders(referer), signal: controller.signal } as any);
        if (response.ok) break;
        lastStatus = response.status;
        if (response.status !== 403 && response.status !== 401) break;
        try {
          (response as any).body?.destroy?.();
        } catch {
        }
      }

      if (response && !response.ok && (lastStatus === 403 || lastStatus === 401)) {
        lastReferer = 'https://images.weserv.nl/';
        const fallbackUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}`;
        response = await fetch(fallbackUrl, { headers: buildHeaders(lastReferer), signal: controller.signal } as any);
      }

      if (!response.ok) {
        logger.warn(`Failed to fetch image: ${imageUrl}, status: ${response.status}, referer: ${lastReferer || '-'}`);
        return res.status(response.status).send(`Failed to fetch image`);
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
        response.body.pipe(res);
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
      response.body.pipe(transformer);
      
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
