import { RSSSource, Article, FetchArticlesWithStatsResult } from '../../types';

export interface FeedInfo {
  title?: string;
  description?: string;
  language?: string;
  url?: string;
  isValid?: boolean;
}

export interface IRSSProvider {
  /**
   * Fetch articles from a source
   */
  fetchArticlesWithStats(source: RSSSource, options?: { triggerRefresh?: boolean }): Promise<FetchArticlesWithStatsResult>;
  getPublicFeeds?(): Promise<any[]>;

  /**
   * Validate a feed URL
   */
  validateFeed(url: string): Promise<FeedInfo>;
}
