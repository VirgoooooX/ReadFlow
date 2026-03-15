/**
 * Test for Task 3.7: Exception Handling in refreshAllFeedsOnce
 * 
 * Verifies that the outer try-catch-finally ensures:
 * 1. All exceptions are caught and logged
 * 2. Finally block always executes (lock released, flags reset)
 * 3. No exceptions are re-thrown (timer chain continues)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { storageService } from './StorageService';
import { RssFetchService } from './RssFetchService';

describe('Task 3.7: Exception Handling in refreshAllFeedsOnce', () => {
  let service: RssFetchService;

  beforeEach(() => {
    service = RssFetchService.getInstance();
    service.refreshRunning = false;
    service.refreshingFeedIds = new Set();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    service.refreshRunning = false;
    service.refreshingFeedIds = new Set();
  });

  it('should catch unexpected exceptions and not re-throw', async () => {
    // Setup: Lock acquired successfully, but getFeedsLight throws
    vi.spyOn(storageService, 'tryAcquireAdvisoryLock').mockResolvedValue(true);
    vi.spyOn(storageService, 'releaseAdvisoryLock').mockResolvedValue(undefined);
    vi.spyOn(storageService, 'getFeedsLight').mockRejectedValue(new Error('Unexpected database error'));

    // Execute: Should NOT throw despite the error
    await expect(service.refreshAllFeedsOnce()).resolves.not.toThrow();
  });

  it('should release lock even when unexpected exception occurs', async () => {
    let lockReleased = false;

    // Setup: Lock acquired, but getFeedsLight throws
    vi.spyOn(storageService, 'tryAcquireAdvisoryLock').mockResolvedValue(true);
    vi.spyOn(storageService, 'releaseAdvisoryLock').mockImplementation(async () => {
      lockReleased = true;
    });
    vi.spyOn(storageService, 'getFeedsLight').mockRejectedValue(new Error('Unexpected error'));

    // Execute
    await service.refreshAllFeedsOnce();

    // Verify: Lock was released despite error
    expect(lockReleased).toBe(true);
  });

  it('should reset refreshRunning flag even when unexpected exception occurs', async () => {
    // Setup: Lock acquired, but getFeedsLight throws
    vi.spyOn(storageService, 'tryAcquireAdvisoryLock').mockResolvedValue(true);
    vi.spyOn(storageService, 'releaseAdvisoryLock').mockResolvedValue(undefined);
    vi.spyOn(storageService, 'getFeedsLight').mockRejectedValue(new Error('Unexpected error'));

    // Execute
    await service.refreshAllFeedsOnce();

    // Verify: refreshRunning was reset to false
    expect(service.refreshRunning).toBe(false);
  });

  it('should log error at ERROR level when exception occurs', async () => {
    const loggerErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Setup: Lock acquired, but getFeedsLight throws
    vi.spyOn(storageService, 'tryAcquireAdvisoryLock').mockResolvedValue(true);
    vi.spyOn(storageService, 'releaseAdvisoryLock').mockResolvedValue(undefined);
    vi.spyOn(storageService, 'getFeedsLight').mockRejectedValue(new Error('Test error'));

    // Execute
    await service.refreshAllFeedsOnce();

    // Verify: Error was logged (logger uses console.error internally)
    expect(loggerErrorSpy).toHaveBeenCalled();
    
    loggerErrorSpy.mockRestore();
  });

  it('should preserve existing error handling for individual feed refresh', async () => {
    let feedErrorHandled = false;

    // Setup: Lock acquired, feeds available, but one feed throws
    vi.spyOn(storageService, 'tryAcquireAdvisoryLock').mockResolvedValue(true);
    vi.spyOn(storageService, 'releaseAdvisoryLock').mockResolvedValue(undefined);
    vi.spyOn(storageService, 'getFeedsLight').mockResolvedValue([
      {
        id: 'feed-1',
        url: 'https://example.com/feed',
        name: 'Test Feed',
        category: 'Test',
        refreshIntervalSeconds: 900,
        lastRefreshAt: new Date(0).toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);

    vi.spyOn(storageService, 'updateFeedRefreshState').mockImplementation(async (feedId, state) => {
      if (state.status === 'error') {
        feedErrorHandled = true;
      }
    });

    // Mock rssParserService to throw
    const rssParserService = await import('./RSSParserService');
    vi.spyOn(rssParserService.rssParserService, 'fetchAndParseArticles').mockRejectedValue(
      new Error('Feed fetch error')
    );

    // Execute
    await service.refreshAllFeedsOnce();

    // Verify: Individual feed error was handled (existing behavior preserved)
    expect(feedErrorHandled).toBe(true);
  });
});
