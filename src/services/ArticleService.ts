import { DatabaseService } from '../database/DatabaseService';
import { Article, ReadingSettings } from '../types';
import { RSSService } from './RSSService';

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
        limit = 20,
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

      const results = await this.databaseService.executeQuery(
        `SELECT a.*, r.title as source_title, r.url as source_url 
         FROM articles a 
         LEFT JOIN rss_sources r ON a.rss_source_id = r.id 
         WHERE ${whereClause} 
         ORDER BY a.${sortBy} ${sortOrder} 
         LIMIT ? OFFSET ?`,
        params
      ).catch(() => []);

      return results.map(this.mapArticleRow);
    } catch (error) {
      console.error('Error getting articles:', error);
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
        console.error('Error getting article by ID:', err);
        return [];
      });

      if (results.length === 0) {
        return null;
      }

      return this.mapArticleRow(results[0]);
    } catch (error) {
      console.error('Error getting article by ID:', error);
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

      const results = await this.databaseService.executeQuery(
        `SELECT a.*, r.title as source_title, r.url as source_url 
         FROM articles a 
         LEFT JOIN rss_sources r ON a.rss_source_id = r.id 
         WHERE ${whereClause} 
         ORDER BY a.published_at DESC 
         LIMIT ? OFFSET ?`,
        params
      ).catch(() => []);

      return results.map(this.mapArticleRow);
    } catch (error) {
      console.error('Error searching articles:', error);
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
    } catch (error) {
      console.error('Error marking article as read:', error);
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
    } catch (error) {
      console.error('Error marking article as unread:', error);
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
      console.error('Error toggling favorite:', error);
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
      console.error('Error updating reading progress:', error);
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
      console.error('Error adding tag:', error);
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
      console.error('Error removing tag:', error);
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
      console.error('Error getting all tags:', error);
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
      
      const results = await this.databaseService.executeQuery(
        `SELECT a.*, r.title as source_title, r.url as source_url 
         FROM articles a 
         LEFT JOIN rss_sources r ON a.rss_source_id = r.id 
         WHERE a.tags LIKE ? 
         ORDER BY a.published_at DESC 
         LIMIT ? OFFSET ?`,
        [`%"${tag}"%`, limit, offset]
      );

      return results.map(this.mapArticleRow);
    } catch (error) {
      console.error('Error getting articles by tag:', error);
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
      const [totalResult, readResult, favoriteResult, wordsResult] = await Promise.all([
        this.databaseService.executeQuery('SELECT COUNT(*) as count FROM articles'),
        this.databaseService.executeQuery('SELECT COUNT(*) as count FROM articles WHERE is_read = 1'),
        this.databaseService.executeQuery('SELECT COUNT(*) as count FROM articles WHERE is_favorite = 1'),
        this.databaseService.executeQuery('SELECT SUM(word_count) as total, SUM(CASE WHEN is_read = 1 THEN word_count ELSE 0 END) as read FROM articles'),
      ]);

      const totalWords = wordsResult[0]?.total || 0;
      const readWords = wordsResult[0]?.read || 0;
      const averageReadingTime = readWords > 0 ? Math.round(readWords / 200) : 0; // 假设每分钟200词

      return {
        totalArticles: totalResult[0]?.count || 0,
        readArticles: readResult[0]?.count || 0,
        favoriteArticles: favoriteResult[0]?.count || 0,
        totalWords,
        readWords,
        averageReadingTime,
      };
    } catch (error) {
      console.error('Error getting reading stats:', error);
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
      console.error('Error deleting article:', error);
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
      console.error('Error deleting old articles:', error);
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
    
    // 【调试日志】记录image_url的实际值
    if (article.imageUrl) {
      console.log(`[mapArticleRow] 文章 "${article.title?.substring(0, 30)}..." 的 imageUrl: ${article.imageUrl}`);
    }
    
    return article;
  }

  /**
   * 修复数据库中的错误图片URL（多重file://前缀）
   */
  public async fixImageUrlPrefixes(): Promise<void> {
    try {
      await this.databaseService.initializeDatabase();
      
      // 获取所有有image_url的文章
      const articles = await this.databaseService.executeQuery(
        `SELECT id, image_url FROM articles WHERE image_url IS NOT NULL AND image_url != ''`
      );
      
      for (const article of articles) {
        let fixed = article.image_url;
        
        // 修复多重file://前缀
        // file://file://file:/// -> file:///
        // file://file:/// -> file:///
        fixed = fixed.replace(/file:\/\/+/g, 'file://');
        
        if (fixed !== article.image_url) {
          console.log(`[fixImageUrlPrefixes] 修复 ID ${article.id}:`);
          console.log(`  原始: ${article.image_url}`);
          console.log(`  修复: ${fixed}`);
          
          await this.databaseService.executeStatement(
            'UPDATE articles SET image_url = ? WHERE id = ?',
            [fixed, article.id]
          );
        }
      }
      
      console.log(`[fixImageUrlPrefixes] 数据库修复完成`);
    } catch (error) {
      console.error('Error fixing image URL prefixes:', error);
    }
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
      console.error('Error getting recently read articles:', error);
      return [];
    }
  }

  /**
   * 【新增】保存滚动位置
   */
  public async saveScrollPosition(id: number, scrollY: number): Promise<void> {
    try {
      await this.databaseService.initializeDatabase();
      await this.databaseService.executeStatement(
        'UPDATE articles SET scroll_position = ? WHERE id = ?',
        [Math.round(scrollY), id]
      );
    } catch (error) {
      console.error('Error saving scroll position:', error);
      throw error;
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
      console.error('Error getting scroll position:', error);
      return 0;
    }
  }

  /**
   * 获取正在阅读的文章
   */
  public async getCurrentlyReading(limit: number = 5): Promise<Article[]> {
    try {
      const results = await this.databaseService.executeQuery(
        `SELECT a.*, r.title as source_title, r.url as source_url 
         FROM articles a 
         LEFT JOIN rss_sources r ON a.rss_source_id = r.id 
         WHERE a.read_progress > 0 AND a.read_progress < 100
        ORDER BY a.read_progress DESC 
         LIMIT ?`,
        [limit]
      );

      return results.map(this.mapArticleRow);
    } catch (error) {
      console.error('Error getting currently reading articles:', error);
      return [];
    }
  }

  /**
   * 修复数据库中的错误图片URL
   * - 清除 file:// 开头的本地路径（代理模式下应使用服务器URL）
   * - 修复多重 file:// 前缀
   */
  public async fixImageUrlPrefixes(): Promise<void> {
    try {
      await this.databaseService.initializeDatabase();
      
      // 1. 清除所有 file:// 开头的图片URL（代理模式下的错误本地化）
      const localPathArticles = await this.databaseService.executeQuery(
        `SELECT id FROM articles WHERE image_url LIKE 'file://%'`
      );
      
      if (localPathArticles.length > 0) {
        console.log(`[fixImageUrlPrefixes] 清除 ${localPathArticles.length} 篇文章的本地图片路径`);
        await this.databaseService.executeStatement(
          `UPDATE articles SET image_url = NULL WHERE image_url LIKE 'file://%'`
        );
      }
      
      // 2. 修复内容中的 file:// 图片引用（替换为空图片）
      const contentArticles = await this.databaseService.executeQuery(
        `SELECT id, content FROM articles WHERE content LIKE '%file://%'`
      );
      
      if (contentArticles.length > 0) {
        console.log(`[fixImageUrlPrefixes] 修复 ${contentArticles.length} 篇文章内容中的本地图片路径`);
        for (const article of contentArticles) {
          // 将 file:// 开头的图片 src 替换为空（保留 img 标签但移除无效 src）
          const fixedContent = article.content.replace(
            /src="file:\/\/[^"]+"/g, 
            'src=""'
          );
          if (fixedContent !== article.content) {
            await this.databaseService.executeStatement(
              'UPDATE articles SET content = ? WHERE id = ?',
              [fixedContent, article.id]
            );
          }
        }
      }
      
      console.log(`[fixImageUrlPrefixes] 数据库修复完成`);
    } catch (error) {
      console.error('Error fixing image URL prefixes:', error);
    }
  }
}

// 导出单例实例
export const articleService = ArticleService.getInstance();
