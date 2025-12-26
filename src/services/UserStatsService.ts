import { DatabaseService } from '../database/DatabaseService';
import { ArticleService } from './ArticleService';
import { VocabularyService } from './VocabularyService';
import { RSSService } from './rss';
import { logger } from './rss/RSSUtils';

export interface UserStats {
  articlesRead: number;
  vocabularyWords: number;
  rssSources: number;
  studyDays: number;
  readingTime: number; // 总阅读时间（分钟）
  totalArticles: number;
  favoriteArticles: number;
  activeRssSources: number;
}

export class UserStatsService {
  private static instance: UserStatsService;
  private databaseService: DatabaseService;
  private articleService: ArticleService;
  private vocabularyService: VocabularyService;
  private rssService: RSSService;

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
    this.articleService = ArticleService.getInstance();
    this.vocabularyService = VocabularyService.getInstance();
    this.rssService = RSSService.getInstance();
  }

  public static getInstance(): UserStatsService {
    if (!UserStatsService.instance) {
      UserStatsService.instance = new UserStatsService();
    }
    return UserStatsService.instance;
  }

  /**
   * 获取用户统计数据
   */
  public async getUserStats(): Promise<UserStats> {
    try {
      // 并行获取各种统计数据
      const [
        readingStats,
        rssSources,
        activeRssSources,
        studyDays
      ] = await Promise.all([
        this.articleService.getReadingStats(),
        this.rssService.getAllRSSSources(),
        this.rssService.getActiveRSSSources(),
        this.calculateStudyDays()
      ]);

      // 获取词汇统计数据
      const vocabularyStats = await this.vocabularyService.getStudyStats();

      return {
        articlesRead: readingStats.readArticles,
        vocabularyWords: vocabularyStats.totalWords,
        rssSources: rssSources.length,
        studyDays: studyDays,
        readingTime: readingStats.averageReadingTime,
        totalArticles: readingStats.totalArticles,
        favoriteArticles: readingStats.favoriteArticles,
        activeRssSources: activeRssSources.length,
      };
    } catch (error) {
      logger.error('Error getting user stats:', error);
      // 返回默认值
      return {
        articlesRead: 0,
        vocabularyWords: 0,
        rssSources: 0,
        studyDays: 0,
        readingTime: 0,
        totalArticles: 0,
        favoriteArticles: 0,
        activeRssSources: 0,
      };
    }
  }

  /**
   * 计算学习天数（基于第一篇文章阅读时间到现在）
   */
  private async calculateStudyDays(): Promise<number> {
    try {
      // 确保数据库已初始化
      await this.databaseService.initializeDatabase();
      
      const result = await this.databaseService.executeQuery(
        'SELECT MIN(read_at) as first_read FROM articles WHERE is_read = 1 AND read_at IS NOT NULL'
      ).catch(() => []);
      
      if (result.length > 0 && result[0].first_read) {
        const firstReadDate = new Date(result[0].first_read);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - firstReadDate.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }
      
      return 0;
    } catch (error) {
      logger.error('Error calculating study days:', error);
      return 0;
    }
  }

  /**
   * 获取本周阅读统计
   */
  public async getWeeklyStats(): Promise<{
    articlesReadThisWeek: number;
    wordsAddedThisWeek: number;
    readingTimeThisWeek: number;
  }> {
    try {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      
      const weekStartISO = weekStart.toISOString();

      // 合并查询以避免多个並行查询接这u冲突
      const [articlesResult, vocabularyResult, readingTimeResult] = await Promise.all([
        this.databaseService.executeQuery(
          'SELECT COUNT(*) as count FROM articles WHERE is_read = 1 AND read_at >= ?',
          [weekStartISO]
        ).catch(() => [{ count: 0 }]),
        this.databaseService.executeQuery(
          'SELECT COUNT(*) as count FROM vocabulary WHERE added_at >= ?',
          [weekStart.getTime()]
        ).catch(() => [{ count: 0 }]),
        this.databaseService.executeQuery(
          'SELECT SUM(word_count) as total_words FROM articles WHERE is_read = 1 AND read_at >= ?',
          [weekStartISO]
        ).catch(() => [{ total_words: 0 }])
      ]);

      const totalWords = readingTimeResult[0]?.total_words || 0;
      const readingTimeMinutes = totalWords > 0 ? Math.round(totalWords / 200) : 0; // 假设每分钟200词

      return {
        articlesReadThisWeek: articlesResult[0]?.count || 0,
        wordsAddedThisWeek: vocabularyResult[0]?.count || 0,
        readingTimeThisWeek: readingTimeMinutes,
      };
    } catch (error) {
      logger.error('Error getting weekly stats:', error);
      return {
        articlesReadThisWeek: 0,
        wordsAddedThisWeek: 0,
        readingTimeThisWeek: 0,
      };
    }
  }

  /**
   * 获取最近7天的阅读趨势
   */
  public async getReadingTrend(): Promise<Array<{ date: string; articles: number; words: number }>> {
    try {
      const results = [];
      const today = new Date();
        
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
          
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
          
        const dateISO = date.toISOString();
        const nextDateISO = nextDate.toISOString();
          
        // 也添加错误处理以保悒串串调用不会存帯
        try {
          const [articlesResult, wordsResult] = await Promise.all([
            this.databaseService.executeQuery(
              'SELECT COUNT(*) as count FROM articles WHERE is_read = 1 AND read_at >= ? AND read_at < ?',
              [dateISO, nextDateISO]
            ).catch(() => [{ count: 0 }]),
            this.databaseService.executeQuery(
              'SELECT COUNT(*) as count FROM vocabulary WHERE added_at >= ? AND added_at < ?',
              [date.getTime(), nextDate.getTime()]
            ).catch(() => [{ count: 0 }])
          ]);
            
          results.push({
            date: date.toISOString().split('T')[0],
            articles: articlesResult[0]?.count || 0,
            words: wordsResult[0]?.count || 0,
          });
        } catch (dayError) {
          // 不中止鐐取整个趨势数据，仅记录错误
          logger.error(`Error processing date ${dateISO}:`, dayError);
          results.push({
            date: date.toISOString().split('T')[0],
            articles: 0,
            words: 0,
          });
        }
      }
        
      return results;
    } catch (error) {
      logger.error('Error getting reading trend:', error);
      return [];
    }
  }
}

export const userStatsService = UserStatsService.getInstance();