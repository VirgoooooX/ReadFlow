export interface Article {
  id?: number;
  title: string;
  titleCn?: string;
  content: string;
  summary: string;
  author?: string;
  publishedAt: string | Date; // JSON usually strings
  sourceId: number;
  sourceName: string;
  url: string;
  imageUrl?: string;
  imageCaption?: string;
  imageCredit?: string;
  videoUrl?: string;
  tags: string[];
  category: string;
  wordCount: number;
  readingTime: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  isRead: boolean;
  isFavorite: boolean;
  readAt?: string | Date;
  readProgress: number;
}

export interface RSSSource {
  id: number;
  sortOrder: number;
  name: string;
  url: string;
  category: string;
  contentType: 'text' | 'image_text';
  sourceMode?: 'direct' | 'proxy';
  isActive: boolean;
  lastFetchAt?: Date;
  errorCount: number;
  lastErrorMessage?: string;
  description?: string;
  updateFrequency?: number;
  article_count?: number;
  unread_count?: number;
  last_updated?: string;
  groupId: number | null;
  groupSortOrder?: number;
  iconUrl?: string;
  maxArticles?: number;
}

export interface FilterRule {
  id?: number;
  sourceId?: number;
  keyword: string;
  mode: 'include' | 'exclude';
  isRegex: boolean;
}
