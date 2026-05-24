import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const storageService = {
    tryAcquireAdvisoryLock: vi.fn(async () => false),
    releaseAdvisoryLock: vi.fn(async () => undefined),
    forceReleaseAdvisoryLock: vi.fn(async () => undefined),
    getFeedsLight: vi.fn(async () => [
      {
        id: 'feed-1',
        url: 'https://example.com/feed.xml',
        name: 'Example Feed',
        category: 'General',
        lastRefreshAt: undefined,
        refreshIntervalSeconds: 60,
      },
    ]),
    getSettings: vi.fn(() => ({
      rssDefaultRefreshIntervalSeconds: 900,
      rssMaxItemsPerFetch: 20,
      imageQuality: 80,
    })),
    storeCanonicalArticlesForSource: vi.fn(async () => ({ upsertsCount: 1, latestBlockId: 42 })),
    updateFeedRefreshState: vi.fn(async () => undefined),
  };

  const rssParserService = {
    fetchAndParseArticles: vi.fn(async () => [
      {
        title: 'Hello',
        content: 'World',
        summary: 'World',
        url: 'https://example.com/article',
        publishedAt: new Date().toISOString(),
        sourceName: 'Example Feed',
        category: 'General',
        wordCount: 1,
        readingTime: 1,
        difficulty: 'easy',
      },
    ]),
  };

  return { storageService, rssParserService };
});

vi.mock('./StorageService', () => ({
  storageService: mocks.storageService,
}));

vi.mock('./RSSParserService', () => ({
  rssParserService: mocks.rssParserService,
}));

vi.mock('../utils/RSSUtils', () => ({
  getProxyUrl: (url: string) => url,
  needsProxy: () => false,
  proxyImages: (content: string) => content,
}));

vi.mock('../utils/Logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    system: vi.fn(),
  },
}));

import { rssFetchService } from './RssFetchService';

describe('RssFetchService refresh locking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rssFetchService.refreshRunning = false;
    rssFetchService.refreshingFeedIds.clear();
    (rssFetchService as any).lastSuccessfulRefreshAt = null;
  });

  it('refreshes due feeds without depending on a PostgreSQL session advisory lock', async () => {
    await rssFetchService.refreshAllFeedsOnce();

    expect(mocks.storageService.tryAcquireAdvisoryLock).not.toHaveBeenCalled();
    expect(mocks.rssParserService.fetchAndParseArticles).toHaveBeenCalledTimes(1);
    expect(mocks.storageService.storeCanonicalArticlesForSource).toHaveBeenCalledWith(
      'https://example.com/feed.xml',
      expect.any(Array)
    );
    expect(mocks.storageService.updateFeedRefreshState).toHaveBeenCalledWith(
      'feed-1',
      expect.objectContaining({ status: 'ok' })
    );
  });
});
