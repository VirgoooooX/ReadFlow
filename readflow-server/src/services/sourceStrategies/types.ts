import { Article, RSSSource } from '../../types';

export interface StrategyMatchContext {
  source: RSSSource;
}

export interface ContentStrategyContext extends StrategyMatchContext {
  url: string;
  urlObj: URL;
  rawContent: string;
}

export interface DocumentStrategyContext extends StrategyMatchContext {
  url: string;
  urlObj: URL;
  document: Document;
  rawHtml: string;
  metaOut?: { author?: string; title?: string };
}

export interface ArticleStrategyContext extends StrategyMatchContext {
  url: string;
  urlObj: URL;
  resolveVideoUrl: (url: string) => Promise<string | null>;
}

export interface SourceParseStrategy {
  id: string;
  match(urlObj: URL, context: StrategyMatchContext): boolean;
  preserveRawContent?(context: ContentStrategyContext): boolean;
  shouldForceFullContent?(context: ContentStrategyContext): boolean;
  extractFromRssDescription?(context: ContentStrategyContext): string | null;
  extractFromDocument?(context: DocumentStrategyContext): string | null;
  beforeReadability?(context: DocumentStrategyContext): void;
  afterReadability?(content: string, context: DocumentStrategyContext): Promise<string | null> | string | null;
  normalizeTitle?(title: string, context: ContentStrategyContext): string;
  enrichArticle?(article: Omit<Article, 'id'>, context: ArticleStrategyContext): Promise<void> | void;
}
