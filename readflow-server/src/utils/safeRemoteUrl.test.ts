import { describe, expect, it } from 'vitest';
import { assertSafeRemoteUrl, isPrivateIp } from './safeRemoteUrl';

describe('safeRemoteUrl', () => {
  it('identifies private and special-use addresses', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIp('93.184.216.34')).toBe(false);
  });

  it('rejects unsafe remote URLs before network fetches', async () => {
    await expect(assertSafeRemoteUrl('file:///etc/passwd')).rejects.toThrow('Unsupported url protocol');
    await expect(assertSafeRemoteUrl('http://user:pass@example.com/feed.xml')).rejects.toThrow('URL must not contain credentials');
    await expect(assertSafeRemoteUrl('http://localhost/feed.xml')).rejects.toThrow('Blocked host');
    await expect(assertSafeRemoteUrl('http://127.0.0.1/feed.xml')).rejects.toThrow('Blocked private address');
    await expect(assertSafeRemoteUrl('http://[::1]/feed.xml')).rejects.toThrow('Blocked private address');
  });

  it('allows explicit private-network opt-out for trusted internal tests', async () => {
    const url = await assertSafeRemoteUrl('http://127.0.0.1/feed.xml', { allowPrivateNetwork: true });
    expect(url.hostname).toBe('127.0.0.1');
  });
});
