import dns from 'dns';
import net from 'net';

export interface SafeRemoteUrlOptions {
  allowPrivateNetwork?: boolean;
  dnsTimeoutMs?: number;
}

export function isPrivateIp(ip: string): boolean {
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
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice('::ffff:'.length);
      if (net.isIP(mapped) === 4) return isPrivateIp(mapped);
    }
    if (normalized.startsWith('fe80:')) return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    return false;
  }

  return true;
}

export async function assertSafeRemoteUrl(urlStr: string, options: SafeRemoteUrlOptions = {}): Promise<URL> {
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

  if (options.allowPrivateNetwork) return urlObj;

  const hostnameLower = hostname.toLowerCase();
  if (hostnameLower === 'localhost' || hostnameLower.endsWith('.localhost')) {
    throw new Error('Blocked host');
  }

  const ipType = net.isIP(hostname);
  if (ipType) {
    if (isPrivateIp(hostname)) throw new Error('Blocked private address');
    return urlObj;
  }

  const dnsTimeoutMs = Math.max(500, options.dnsTimeoutMs ?? 2000);
  const records = await Promise.race([
    dns.promises.lookup(hostname, { all: true }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DNS lookup timeout')), dnsTimeoutMs)),
  ]);

  for (const r of records) {
    if (isPrivateIp(String((r as any).address || ''))) {
      throw new Error('Blocked private address');
    }
  }

  return urlObj;
}
