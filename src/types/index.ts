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
  imageCaption?: string;   // 封面图片说明（来自 figcaption、alt 或 media:description）
  imageCredit?: string;    // 封面图片来源/版权（如 "Reuters"）
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
  sortOrder: number; // 用于自定义排序
  name: string;
  url: string;
  category: string;
  contentType: 'text' | 'image_text'; // RSS源内容类型：纯文本或多媒体(图文视频)
  sourceMode?: 'direct' | 'proxy'; // RSS源获取模式：direct(直连) | proxy(代理服务器)
  isActive: boolean;
  lastFetchAt?: Date;
  errorCount: number;
  description?: string;
  updateFrequency?: number;
  article_count?: number;
  unread_count?: number;
  last_updated?: string;
  
  // 📁 分组相关字段
  groupId: number | null;        // 所属分组 ID（null = 未分组）
  groupSortOrder?: number;       // 在分组内的排序
  
  // 🌐 图标相关字段
  iconUrl?: string;              // RSS源图标URL（本地缓存或网络URL）
  
  maxArticles?: number;          // 最大文章保留数量
}

// 📁 RSS分组类型
export interface RSSGroup {
  id: number;
  name: string;
  icon?: string;                 // MaterialIcon name 或 emoji
  color?: string;                // Hex 值，如 #3B82F6
  sortOrder: number;
  createdAt: number;             // 时间戳（毫秒）
  updatedAt: number;
  
  // 📊 统计字段（由 Service 层聚合查询填充）
  sourceCount?: number;          // SQL COUNT 填充
  unreadCount?: number;          // SQL SUM 填充
}

// 🆚️ 虚拟分组（前端概念）
export const VIRTUAL_GROUPS = {
  ALL: { id: -1, name: '全部' },
  UNCATEGORIZED: { id: 0, name: '默认' },  // 对应 groupId = NULL
} as const;

// 词典相关类型
export interface WordDefinition {
  word: string;              // 当前词形
  context?: string;          // 出现语境
  baseWord?: string;         // 原始单词（如 running -> run）
  wordForm?: string;         // 词形说明（如 "过去式", "现在分词"）
  phonetic?: string;
  definitions: {
    partOfSpeech: string;    // 词性
    definition: string;      // 英文释义
    example?: string;        // 例句
    synonyms?: string[];     // 同义词
    translation?: string;    // 中文翻译
  }[];
  baseWordDefinitions?: {    // 原始单词的释义
    partOfSpeech: string;
    definition: string;
    translation?: string;
  }[];
  source: 'llm' | 'cache';   // 来源：LLM或本地缓存
}

// 词典缓存条目
export interface DictionaryCacheEntry {
  id?: number;
  word: string;              // 查询的单词
  baseWord?: string;         // 原始单词
  wordForm?: string;         // 词形说明
  phonetic?: string;         // 音标
  definitions: string;       // JSON字符串存储释义
  source: string;            // 来源
  createdAt?: Date;
  updatedAt?: Date;
}

// 单词本类型
export interface VocabularyEntry {
  id?: number;
  word: string;
  definition?: WordDefinition | string;
  translation?: string;
  example?: string;
  context?: string;
  articleId?: number;
  sourceArticleId?: number;
  sourceArticleTitle?: string;
  addedAt: Date;
  reviewCount: number;
  correctCount?: number;
  lastReviewAt?: Date;
  lastReviewedAt?: Date;
  nextReviewAt?: Date;
  masteryLevel: number;    // 0-5 掌握程度
  difficulty?: string;
  tags: string[];
  notes?: string;
}

// 阅读设置类型
export interface ReadingSettings {
  fontSize: number;        // 12-24
  lineHeight: number;      // 1.2-2.0
  theme: 'light' | 'dark' | 'sepia';
  fontFamily: string;
  backgroundColor: string; // 背景颜色
  textColor: string;       // 文字颜色
  highlightColor: string;  // 高亮颜色
  margin: number;          // 页边距
  autoScroll: boolean;
  scrollSpeed: number;
  showTranslation: boolean;
  translationPosition: 'top' | 'bottom' | 'inline';
  enableTTS: boolean;
  ttsSpeed: number;
  ttsVoice: string;
  wordClickAction: 'translate' | 'copy' | 'none';
  showProgress: boolean;
  nightMode: boolean;
  sepia: boolean;
  brightness: number;
  showAllTab: boolean;     // 是否显示"全部"标签
  autoRefreshInterval: number; // 后台自动刷新间隔（分钟），0表示关闭自动刷新
  autoMarkReadOnScroll?: boolean; // 列表滚动自动标记已读
}

export interface AppSettings {
  language: string;
  theme: 'light' | 'dark' | 'system' | 'sepia';
  notifications: {
    enabled: boolean;
    newArticles: boolean;
    vocabularyReview: boolean;
    dailyGoal: boolean;
    sound: boolean;
    vibration: boolean;
  };
  sync: {
    enabled: boolean;
    autoSync: boolean;
    syncInterval: number;
    wifiOnly: boolean;
    proxyMode?: boolean;  // 是否使用代理服务器模式
  };
  privacy: {
    analytics: boolean;
    crashReporting: boolean;
    dataCollection: boolean;
  };
  performance: {
    cacheSize: number;
    preloadImages: boolean;
    offlineMode: boolean;
    backgroundSync: boolean;
  };
  accessibility: {
    highContrast: boolean;
    largeText: boolean;
    reduceMotion: boolean;
    screenReader: boolean;
  };
  backup: {
    autoBackup: boolean;
    backupInterval: number;
    includeImages: boolean;
    cloudProvider: string;
  };
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

// RSS启动刷新配置
export interface RSSStartupSettings {
  enabled: boolean;
  sourceIds: number[]; // 需要刷新的源ID列表
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

// 单个代理服务器配置
export interface ProxyServer {
  id: string;                 // 唯一标识符
  name: string;               // 自定义名称
  serverUrl: string;          // 服务器地址，如 http://192.168.1.100:8080
  token?: string;             // 认证 Token
  createdAt: string;          // 创建时间
  updatedAt: string;          // 更新时间
  lastTestResult?: 'success' | 'fail';  // 最后测试结果
  lastTestTime?: string;      // 最后测试时间
}

// 多代理服务器配置
export interface ProxyServersConfig {
  servers: ProxyServer[];     // 服务器列表
  activeServerId: string | null;  // 当前激活的服务器 ID
}

// 代理服务器配置类型（保留兼容旧版本）
export interface ProxyModeConfig {
  enabled: boolean;           // 是否启用代理模式
  serverUrl: string;          // 服务器地址，如 http://192.168.1.100:8080
  serverPassword: string;     // 部署密码
  token?: string;             // 登录后获得的 Token
  userId?: number;            // 用户 ID
  lastSyncTime?: string;      // 最后同步时间
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
export class AppError extends Error {
  code: string;
  details?: any;
  timestamp: Date;

  constructor(data: {
    code: string;
    message: string;
    details?: any;
    timestamp: Date;
  }) {
    super(data.message);
    this.code = data.code;
    this.details = data.details;
    this.timestamp = data.timestamp;
    this.name = 'AppError';
  }
}
