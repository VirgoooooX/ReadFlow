// 数据库服务
export { DatabaseService } from '../database/DatabaseService';

// 词典服务
export { DictionaryService, dictionaryService } from './DictionaryService';

// RSS服务
export { RSSService, rssService } from './RSSService';

// 文章服务
export { ArticleService, articleService } from './ArticleService';

// 单词本服务
export { VocabularyService, vocabularyService } from './VocabularyService';

// 设置服务
export { SettingsService, settingsService } from './SettingsService';

// 服务类型定义
export type {
  DatabaseService as IDatabaseService,
  DictionaryService as IDictionaryService,
  RSSService as IRSSService,
  ArticleService as IArticleService,
  VocabularyService as IVocabularyService,
  SettingsService as ISettingsService,
} from '../types';