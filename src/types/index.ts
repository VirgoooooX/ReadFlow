// 核心类型定义

// 文章相关类型
export interface Article {
  id: number;
  title: string;
  titleCn?: string;        // 中文标题（翻译后）
  content: string;
  summary: string;
  author?: string;
  publishedAt: Date;
  sourceId: number;
  sourceName: string;
  url: string;
  imageUrl?: string;
  tags: string[];
  category: string;
  wordCount: number;
  readingTime: number;     // 预估阅读时间（分钟）
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  isRead: boolean;
  isFavorite: boolean;
  readAt?: Date;
  readProgress: number;    // 0-100
}

// RSS源类型
export interface RSSSource {
  id: number;
  name: string;
  url: string;
  category: string;
  contentType: 'text' | 'image_text'; // RSS源内容类型：纯文本或图文
  isActive: boolean;
  lastFetchAt?: Date;
  errorCount: number;
  description?: string;
  updateFrequency?: number;
  article_count?: number;
  unread_count?: number;
  last_updated?: string;
}

// 词典相关类型
export interface LocalDictionaryEntry {
  id: number;
  word: string;              // 单词
  sw: string;                // 搜索词（小写，用于索引）
  phonetic?: string;         // 音标
  definition?: string;       // 英文释义
  translation?: string;      // 中文翻译
  pos?: string;              // 词性
  exchange?: string;         // 词形变化（复数、过去式等）
}

export interface WordDefinition {
  word: string;
  phonetic?: string;
  definitions: {
    partOfSpeech: string;    // 词性
    definition: string;      // 释义
    example?: string;        // 例句
    synonyms?: string[];     // 同义词
    translation?: string;    // 中文翻译
  }[];
  source: 'local' | 'llm' | 'online';
}

// 单词本类型
export interface VocabularyEntry {
  id: string;
  word: string;
  definition: string;
  translation?: string;
  example?: string;
  sourceArticleId?: number;
  sourceArticleTitle?: string;
  addedAt: Date;
  reviewCount: number;
  lastReviewAt?: Date;
  masteryLevel: number;    // 0-5 掌握程度
  tags: string[];
}

// 阅读设置类型
export interface ReadingSettings {
  fontSize: number;        // 12-24
  lineHeight: number;      // 1.2-2.0
  theme: 'light' | 'dark' | 'sepia';
  fontFamily: string;
  margin: number;          // 页边距
  autoScroll: boolean;
  scrollSpeed: number;
}

// 用户偏好设置
export interface UserPreferences {
  readingSettings: ReadingSettings;
  translationProvider: 'google' | 'baidu' | 'youdao';
  enableAutoTranslation: boolean;
  enableTitleTranslation: boolean;
  maxConcurrentTranslations: number;
  translationTimeout: number;
  defaultCategory: string;
  enableNotifications: boolean;
}

// 刷新配置
export interface RefreshConfig {
  enableTitleTranslation: boolean;
  translationProvider: 'google' | 'baidu' | 'youdao';
  maxConcurrentTranslations: number;
  translationTimeout: number;
}

// 文章加载状态
export interface ArticleLoadingState {
  isLoading: boolean;
  isTranslating: boolean;
  translationProgress: number;
  lastRefreshTime: Date;
  articlesCount: number;
  translatedCount: number;
  error?: string;
}

// 导航相关类型
export type RootStackParamList = {
  Home: undefined;
  Reading: { articleId: string };
  Settings: undefined;
  Vocabulary: undefined;
  RSS: undefined;
};

export type BottomTabParamList = {
  Home: undefined;
  Vocabulary: undefined;
  RSS: undefined;
  Settings: undefined;
};

// 主题相关类型
export interface ThemeColors {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  background: string;
  onBackground: string;
  outline: string;
  outlineVariant: string;
}

export interface Theme {
  colors: ThemeColors;
  typography: {
    displayLarge: TextStyle;
    displayMedium: TextStyle;
    displaySmall: TextStyle;
    headlineLarge: TextStyle;
    headlineMedium: TextStyle;
    headlineSmall: TextStyle;
    titleLarge: TextStyle;
    titleMedium: TextStyle;
    titleSmall: TextStyle;
    bodyLarge: TextStyle;
    bodyMedium: TextStyle;
    bodySmall: TextStyle;
    labelLarge: TextStyle;
    labelMedium: TextStyle;
    labelSmall: TextStyle;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
    xxxl: number;
  };
  borderRadius: {
    none: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    full: number;
  };
}

// React Native TextStyle 类型导入
import { TextStyle } from 'react-native';

// 数据库相关类型
export interface DatabaseConfig {
  name: string;
  version: string;
  displayName: string;
  size: number;
}

// API响应类型
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 搜索相关类型
export interface SearchFilters {
  category?: string;
  source?: string;
  difficulty?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  isRead?: boolean;
  isFavorite?: boolean;
}

export interface SearchResult {
  articles: Article[];
  totalCount: number;
  hasMore: boolean;
}

// 统计相关类型
export interface ReadingStats {
  totalArticlesRead: number;
  totalWordsRead: number;
  totalReadingTime: number; // 分钟
  averageReadingSpeed: number; // 词/分钟
  vocabularySize: number;
  streakDays: number;
  lastReadDate?: Date;
}

// 错误类型
export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
}