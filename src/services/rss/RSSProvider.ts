import { RSSSource, Article } from '../../types';

export interface FeedInfo {
  title?: string;
  description?: string;
  isValid: boolean;
}

export interface IRSSProvider {
  /**
   * Fetch articles from a source
   */
  fetchArticles(source: RSSSource): Promise<Article[]>;

  /**
   * Validate a feed URL
   */
  validateFeed(url: string): Promise<FeedInfo>;
}
