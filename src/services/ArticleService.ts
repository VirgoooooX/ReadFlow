import { DatabaseService } from '../database/DatabaseService';
import { Article, ReadingSettings } from '../types';
import cacheEventEmitter from './CacheEventEmitter';
import { logger } from './rss/RSSUtils';

export class ArticleService {
  private static instance: ArticleService;
  private databaseService: DatabaseService;

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
  }

  public static getInstance(): ArticleService {
    if (!ArticleService.instance) {
      ArticleService.instance = new ArticleService();
    }
    return ArticleService.instance;
  }

  /**
   * 【新增】获取"公平"的初始聚合流：每个源取前 N 条
   * 目标：解决首页被更新频率高的源霸屏的问题
   * 返回值：所有源合并的按发布时间排序的文章数组（未分页）
   */
  public async getInitialFairFeed(limitPerSource: number = 10): Promise<Article[]> {
    try {
      await this.databaseService.initializeDatabase();

      // 1. 获取所有活跃的 RSS 源 ID
      const sourcesResult = await this.databaseService.executeQuery(
        'SELECT id FROM rss_sources WHERE 1=1'
      );
      
      if (!sourcesResult || sourcesResult.length === 0) {
        return [];
      }

      const sources = sourcesResult as any[];
      
      // 2. 性能保护：如果源超过 50 个，每个源只取 5 条，防止数据量过大
      const safeLimit = sources.length > 50 ? 5 : limitPerSource;
      
      // 3. 关键优化：改用"应用层聚合"而非 SQL UNION ALL
      // 原因：SQLite 对 UNION ALL 的限制多，改在 JS 做排序更灵活且性能也不差
      const allArticles: Article[] = [];
      
      // 优化：不查询 content 字段，减少内存占用
      const columns = 'a.id, a.title, a.title_cn, a.summary, a.author, a.published_at, a.rss_source_id, a.source_name, a.url, a.image_url, a.image_caption, a.image_credit, a.tags, a.category, a.word_count, a.reading_time, a.difficulty, a.is_read, a.is_favorite, a.read_at, a.read_progress';

      // 逐个源查询（利用 Promise.all 并行查询）
      const queries = sources.map(source =>
        this.databaseService.executeQuery(
          `SELECT ${columns}, r.title as source_title, r.url as source_url 
           FROM articles a 
           LEFT JOIN rss_sources r ON a.rss_source_id = r.id 
           WHERE a.rss_source_id = ${source.id} 
           ORDER BY a.published_at DESC
           LIMIT ${safeLimit}`
        )
      );
      
      const results = await Promise.all(queries);
      
      // 合并所有结果
      results.forEach(sourceArticles => {
        sourceArticles.forEach((row: any) => {
          allArticles.push(this.mapArticleRow(row));
        });
      });
      
      // 4. 在应用层做最终排序（性能优异，且避免 SQL 语法限制）
      allArticles.sort((a, b) => 
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
      
      return allArticles;
    } catch (error) {
      logger.error('Error getting initial fair feed:', error);
      return [];
    }
  }

  /**
   * 获取文章列表
   */
  public async getArticles(options: {
    limit?: number;
    offset?: number;
    rssSourceId?: number;
    isRead?: boolean;
    isFavorite?: boolean;
    difficulty?: string;
    sortBy?: 'published_at' | 'title' | 'word_count';
    sortOrder?: 'ASC' | 'DESC';
  } = {}): Promise<Article[]> {
    try {
      // 确保数据库已初始化
      await this.databaseService.initializeDatabase();
      
      const {
        limit = 10,
        offset = 0,
        rssSourceId,
        isRead,
        isFavorite,
        difficulty,
        sortBy = 'published_at',
        sortOrder = 'DESC',
      } = options;

      let whereClause = '1=1';
      const params: any[] = [];

      if (rssSourceId !== undefined) {
        whereClause += ' AND rss_source_id = ?';
        params.push(rssSourceId);
      }

      if (isRead !== undefined) {
        whereClause += ' AND is_read = ?';
        params.push(isRead ? 1 : 0);
      }

      if (isFavorite !== undefined) {
        whereClause += ' AND is_favorite = ?';
        params.push(isFavorite ? 1 : 0);
      }

      if (difficulty) {
        whereClause += ' AND difficulty = ?';
        params.push(difficulty);
      }

      params.push(limit, offset);

      // 优化：不查询 content 字段
      const columns = 'a.id, a.title, a.title_cn, a.summary, a.author, a.published_at, a.rss_source_id, a.source_name, a.url, a.image_url, a.image_caption, a.image_credit, a.tags, a.category, a.word_count, a.reading_time, a.difficulty, a.is_read, a.is_favorite, a.read_at, a.read_progress';

      const results = await this.databaseService.executeQuery(
        `SELECT ${columns}, r.title as source_title, r.url as source_url 
         FROM articles a 
         LEFT JOIN rss_sources r ON a.rss_source_id = r.id 
         WHERE ${whereClause} 
         ORDER BY a.${sortBy} ${sortOrder} 
         LIMIT ? OFFSET ?`,
        params
      ).catch(() => []);

      return results.map(this.mapArticleRow);
    } catch (error) {
      logger.error('Error getting articles:', error);
      return [];
    }
  }

  /**
   * 根据ID获取文章
   */
  public async getArticleById(id: number): Promise<Article | null> {
    try {
      // 确保数据库已初始化
      await this.databaseService.initializeDatabase();
      
      const results = await this.databaseService.executeQuery(
        `SELECT a.*, r.title as source_title, r.url as source_url 
         FROM articles a 
         LEFT JOIN rss_sources r ON a.rss_source_id = r.id 
         WHERE a.id = ?`,
        [id]
      ).catch((err) => {
        logger.error('Error getting article by ID:', err);
        return [];
      });

      if (results.length === 0) {
        return null;
      }

      return this.mapArticleRow(results[0]);
    } catch (error) {
      logger.error('Error getting article by ID:', error);
      return null;
    }
  }

  /**
   * 搜索文章
   */
  public async searchArticles(query: string, options: {
    limit?: number;
    offset?: number;
    rssSourceId?: number;
  } = {}): Promise<Article[]> {
    try {
      await this.databaseService.initializeDatabase();
      
      const { limit = 20, offset = 0, rssSourceId } = options;
      
      let whereClause = '(a.title LIKE ? OR a.content LIKE ? OR a.summary LIKE ?)';
      const params: any[] = [`%${query}%`, `%${query}%`, `%${query}%`];

      if (rssSourceId !== undefined) {
        whereClause += ' AND a.rss_source_id = ?';
        params.push(rssSourceId);
      }

      params.push(limit, offset);

      // 优化：不查询 content 字段
      const columns = 'a.id, a.title, a.title_cn, a.summary, a.author, a.published_at, a.rss_source_id, a.source_name, a.url, a.image_url, a.image_caption, a.image_credit, a.tags, a.category, a.word_count, a.reading_time, a.difficulty, a.is_read, a.is_favorite, a.read_at, a.read_progress';

      const results = await this.databaseService.executeQuery(
        `SELECT ${columns}, r.title as source_title, r.url as source_url 
         FROM articles a 
         LEFT JOIN rss_sources r ON a.rss_source_id = r.id 
         WHERE ${whereClause} 
         ORDER BY a.published_at DESC 
         LIMIT ? OFFSET ?`,
        params
      ).catch(() => []);

      return results.map(this.mapArticleRow);
    } catch (error) {
      logger.error('Error searching articles:', error);
      return [];
    }
  }

  /**
   * 标记文章为已读
   */
  public async markAsRead(id: number, progress: number = 100): Promise<void> {
    try {
      await this.databaseService.initializeDatabase();
      await this.databaseService.executeStatement(
        'UPDATE articles SET is_read = 1, read_progress = ?, read_at = ? WHERE id = ?',
        [progress, new Date().toISOString(), id]
      );
      
      // 获取文章的源ID，并更新该源的未读数量
      const article = await this.getArticleById(id);
      if (article) {
        // 🔥 发送文章已读事件，供 UI 乐观更新
        cacheEventEmitter.emit({ 
          type: 'articleRead', 
          articleId: id,
          sourceId: article.sourceId 
        });

        if (article.sourceId) {
          await this.updateSourceStats(article.sourceId, { reason: 'markRead' });
        }
      }
    } catch (error) {
      logger.error('Error marking article as read:', error);
    }
  }

  /**
   * 标记所有（或指定源）文章为已读
   */
  public async markAllAsRead(sourceId?: number): Promise<void> {
    try {
      await this.databaseService.initializeDatabase();
      
      let query = 'UPDATE articles SET is_read = 1, read_progress = 100, read_at = ? WHERE is_read = 0';
      const params: any[] = [new Date().toISOString()];
      
      if (sourceId !== undefined) {
        query += ' AND rss_source_id = ?';
        params.push(sourceId);
      }
      
      await this.databaseService.executeStatement(query, params);
      
      if (sourceId !== undefined) {
        await this.updateSourceStats(sourceId, { reason: 'markAllRead' });
        cacheEventEmitter.clearSourceArticles(sourceId);
      } else {
        // 更新所有源的统计为 0
        await this.databaseService.executeStatement('UPDATE rss_sources SET unread_count = 0');
        cacheEventEmitter.updateRSSStats(); // 全局刷新，不需要 reason，反正都要刷
        cacheEventEmitter.clearArticles();
      }
    } catch (error) {
      logger.error('Error marking all as read:', error);
    }
  }
  
  /**
   * 更新 RSS 源统计信息 (已读计数)
   */
  private async updateSourceStats(sourceId: number, options: { reason?: string } = {}): Promise<void> {
    try {
      const unreadCountResult = await this.databaseService.executeQuery(
        'SELECT COUNT(*) as count FROM articles WHERE rss_source_id = ? AND is_read = 0',
        [sourceId]
      );
      const unreadCount = unreadCountResult[0]?.count || 0;
      
      await this.databaseService.executeStatement(
        'UPDATE rss_sources SET unread_count = ? WHERE id = ?',
        [unreadCount, sourceId]
      );
      
      // 🔥 发射事件通知 RSS 源统计已更新，触发 UI 刷新
      // 附带 reason，供监听者（如 HomeScreen）决定是否需要重载列表
      cacheEventEmitter.emit({ 
        type: 'updateRSSStats', 
        reason: options.reason,
        sourceId 
      });
    } catch (error) {
      logger.error('Error updating source stats:', error);
    }
  }

  /**
   * 标记文章为未读
   */
  public async markAsUnread(id: number): Promise<void> {
    try {
      await this.databaseService.initializeDatabase();
      await this.databaseService.executeStatement(
        'UPDATE articles SET is_read = 0, read_progress = 0, read_at = NULL WHERE id = ?',
        [id]
      );
      
      // 获取文章的源ID，并更新该源的未读数量
      const article = await this.getArticleById(id);
      if (article && article.sourceId) {
        await this.updateSourceStats(article.sourceId, { reason: 'markUnread' });
      }
    } catch (error) {
      logger.error('Error marking article as unread:', error);
    }
  }

  /**
   * 切换收藏状态
   */
  public async toggleFavorite(id: number): Promise<boolean> {
    try {
      await this.databaseService.initializeDatabase();
      const article = await this.getArticleById(id);
      if (!article) {
        return false;
      }

      const newFavoriteStatus = !article.isFavorite;
      
      await this.databaseService.executeStatement(
        'UPDATE articles SET is_favorite = ? WHERE id = ?',
        [newFavoriteStatus ? 1 : 0, id]
      );

      return newFavoriteStatus;
    } catch (error) {
      logger.error('Error toggling favorite:', error);
      return false;
    }
  }

  /**
   * 更新阅读进度
   */
  public async updateReadingProgress(id: number, progress: number): Promise<void> {
    try {
      await this.databaseService.initializeDatabase();
      const clampedProgress = Math.max(0, Math.min(100, progress));
      
      await this.databaseService.executeStatement(
        'UPDATE articles SET read_progress = ? WHERE id = ?',
        [clampedProgress, id]
      );

      // 如果进度达到100%，自动标记为已读
      if (clampedProgress >= 100) {
        await this.markAsRead(id, clampedProgress);
      }
    } catch (error) {
      logger.error('Error updating reading progress:', error);
    }
  }

  /**
   * 添加标签
   */
  public async addTag(id: number, tag: string): Promise<void> {
    try {
      await this.databaseService.initializeDatabase();
      const article = await this.getArticleById(id);
      if (!article) {
        return;
      }

      const tags = [...article.tags];
      if (!tags.includes(tag)) {
        tags.push(tag);
        
        await this.databaseService.executeStatement(
          'UPDATE articles SET tags = ? WHERE id = ?',
          [JSON.stringify(tags), id]
        );
      }
    } catch (error) {
      logger.error('Error adding tag:', error);
    }
  }

  /**
   * 移除标签
   */
  public async removeTag(id: number, tag: string): Promise<void> {
    try {
      await this.databaseService.initializeDatabase();
      const article = await this.getArticleById(id);
      if (!article) {
        return;
      }

      const tags = article.tags.filter(t => t !== tag);
      
      await this.databaseService.executeStatement(
        'UPDATE articles SET tags = ? WHERE id = ?',
        [JSON.stringify(tags), id]
      );
    } catch (error) {
      logger.error('Error removing tag:', error);
    }
  }

  /**
   * 获取所有标签
   */
  public async getAllTags(): Promise<string[]> {
    try {
      const results = await this.databaseService.executeQuery(
        'SELECT DISTINCT tags FROM articles WHERE tags IS NOT NULL AND tags != "[]"'
      );

      const allTags = new Set<string>();
      
      results.forEach(row => {
        try {
          const tags = JSON.parse(row.tags);
          if (Array.isArray(tags)) {
            tags.forEach(tag => allTags.add(tag));
          }
        } catch (error) {
          // 忽略解析错误
        }
      });

      return Array.from(allTags).sort();
    } catch (error) {
      logger.error('Error getting all tags:', error);
      return [];
    }
  }

  /**
   * 根据标签获取文章
   */
  public async getArticlesByTag(tag: string, options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<Article[]> {
    try {
      const { limit = 20, offset = 0 } = options;
      
      // 优化：不查询 content 字段
      const columns = 'a.id, a.title, a.title_cn, a.summary, a.author, a.published_at, a.rss_source_id, a.source_name, a.url, a.image_url, a.image_caption, a.image_credit, a.tags, a.category, a.word_count, a.reading_time, a.difficulty, a.is_read, a.is_favorite, a.read_at, a.read_progress';

      const results = await this.databaseService.executeQuery(
        `SELECT ${columns}, r.title as source_title, r.url as source_url 
         FROM articles a 
         LEFT JOIN rss_sources r ON a.rss_source_id = r.id 
         WHERE a.tags LIKE ? 
         ORDER BY a.published_at DESC 
         LIMIT ? OFFSET ?`,
        [`%"${tag}"%`, limit, offset]
      );

      return results.map(this.mapArticleRow);
    } catch (error) {
      logger.error('Error getting articles by tag:', error);
      return [];
    }
  }

  /**
   * 获取阅读统计
   */
  public async getReadingStats(): Promise<{
    totalArticles: number;
    readArticles: number;
    favoriteArticles: number;
    totalWords: number;
    readWords: number;
    averageReadingTime: number;
  }> {
    try {
      // 确保数据库已初始化
      await this.databaseService.initializeDatabase();
      
      // 使用单个查询获取所有统计数据，避免多个并行查询导致连接冲突
      const result = await this.databaseService.executeQuery(
        `SELECT 
          COUNT(*) as total_count,
          SUM(CASE WHEN is_read = 1 THEN 1 ELSE 0 END) as read_count,
          SUM(CASE WHEN is_favorite = 1 THEN 1 ELSE 0 END) as favorite_count,
          SUM(word_count) as total_words,
          SUM(CASE WHEN is_read = 1 THEN word_count ELSE 0 END) as read_words
         FROM articles`
      );

      if (result.length === 0) {
        return {
          totalArticles: 0,
          readArticles: 0,
          favoriteArticles: 0,
          totalWords: 0,
          readWords: 0,
          averageReadingTime: 0,
        };
      }

      const row = result[0];
      const totalWords = row.total_words || 0;
      const readWords = row.read_words || 0;
      const averageReadingTime = readWords > 0 ? Math.round(readWords / 200) : 0;

      return {
        totalArticles: row.total_count || 0,
        readArticles: row.read_count || 0,
        favoriteArticles: row.favorite_count || 0,
        totalWords,
        readWords,
        averageReadingTime,
      };
    } catch (error) {
      logger.error('Error getting reading stats:', error);
      return {
        totalArticles: 0,
        readArticles: 0,
        favoriteArticles: 0,
        totalWords: 0,
        readWords: 0,
        averageReadingTime: 0,
      };
    }
  }

  /**
   * 删除文章
   */
  public async deleteArticle(id: number): Promise<void> {
    try {
      await this.databaseService.initializeDatabase();
      await this.databaseService.executeStatement(
        'DELETE FROM articles WHERE id = ?',
        [id]
      );
    } catch (error) {
      logger.error('Error deleting article:', error);
    }
  }

  /**
   * 批量删除旧文章
   */
  public async deleteOldArticles(daysOld: number = 30): Promise<number> {
    try {
      await this.databaseService.initializeDatabase();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      const result = await this.databaseService.executeInsert(
        'DELETE FROM articles WHERE published_at < ? AND is_favorite = 0',
        [cutoffDate.toISOString()]
      );
      
      return result.changes || 0;
    } catch (error) {
      logger.error('Error deleting old articles:', error);
      return 0;
    }
  }

  /**
   * 映射数据库行到Article对象
   */
  private mapArticleRow(row: any): Article {
    const article: Article = {
      id: row.id,
      title: row.title,
      titleCn: row.title_cn,
      content: row.content,
      summary: row.summary,
      author: row.author,
      publishedAt: new Date(row.published_at), // 数据库存储的是ISO字符串
      sourceId: row.rss_source_id,
      sourceName: row.source_name,
      url: row.url,
      imageUrl: row.image_url,
      imageCaption: row.image_caption || undefined,
      imageCredit: row.image_credit || undefined,
      tags: row.tags ? JSON.parse(row.tags) : [],
      category: row.category,
      wordCount: row.word_count,
      readingTime: row.reading_time,
      difficulty: row.difficulty,
      isRead: row.is_read === 1,
      isFavorite: row.is_favorite === 1,
      readAt: row.read_at ? new Date(row.read_at) : undefined,
      readProgress: row.read_progress,
    };
    
    return article;
  }



  /**
   * 获取最近阅读的文章
   */
  public async getRecentlyRead(limit: number = 10): Promise<Article[]> {
    try {
      const results = await this.databaseService.executeQuery(
        `SELECT a.*, r.title as source_title, r.url as source_url 
         FROM articles a 
         LEFT JOIN rss_sources r ON a.rss_source_id = r.id 
         WHERE a.is_read = 1 AND a.read_at IS NOT NULL 
         ORDER BY a.read_at DESC 
         LIMIT ?`,
        [limit]
      );

      return results.map(this.mapArticleRow);
    } catch (error) {
      logger.error('Error getting recently read articles:', error);
      return [];
    }
  }

  /**
   * 【新增】保存滚动位置 - 静默执行，失败不重试
   * 滚动位置不是关键数据，失败不影响用户体验
   */
  public async saveScrollPosition(id: number, scrollY: number): Promise<void> {
    try {
      await this.databaseService.initializeDatabase();
      await this.databaseService.executeStatement(
        'UPDATE articles SET scroll_position = ? WHERE id = ?',
        [Math.round(scrollY), id]
      );
    } catch (error: any) {
      // 静默失败：滚动位置不是关键数据，不值得重试或报错
      // 只在非数据库锁定错误时记录，避免日志刷屏
      const isDbLocked = error?.message?.includes('database is locked') ||
                        error?.toString?.()?.includes('database is locked');
      if (!isDbLocked) {
        logger.warn(`[ScrollPosition] Failed to save for article ${id}:`, error);
      }
    }
  }

  /**
   * 【新增】获取保存的滚动位置
   */
  public async getScrollPosition(id: number): Promise<number> {
    try {
      await this.databaseService.initializeDatabase();
      const results = await this.databaseService.executeQuery(
        'SELECT scroll_position FROM articles WHERE id = ?',
        [id]
      );
      
      if (results.length === 0) {
        return 0;
      }
      
      return results[0].scroll_position || 0;
    } catch (error) {
      logger.error('Error getting scroll position:', error);
      return 0;
    }
  }

  /**
   * 获取正在阅读的文章
   */
  public async getCurrentlyReading(limit: number = 5): Promise<Article[]> {
    try {
      // 优化：不查询 content 字段
      const columns = 'a.id, a.title, a.title_cn, a.summary, a.author, a.published_at, a.rss_source_id, a.source_name, a.url, a.image_url, a.image_caption, a.image_credit, a.tags, a.category, a.word_count, a.reading_time, a.difficulty, a.is_read, a.is_favorite, a.read_at, a.read_progress';

      const results = await this.databaseService.executeQuery(
        `SELECT ${columns}, r.title as source_title, r.url as source_url 
         FROM articles a 
         LEFT JOIN rss_sources r ON a.rss_source_id = r.id 
         WHERE a.read_progress > 0 AND a.read_progress < 100
        ORDER BY a.read_progress DESC 
         LIMIT ?`,
        [limit]
      );

      return results.map(this.mapArticleRow);
    } catch (error) {
      logger.error('Error getting currently reading articles:', error);
      return [];
    }
  }


}

// 导出单例实例
export const articleService = ArticleService.getInstance();
