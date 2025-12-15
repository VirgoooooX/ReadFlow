import { DatabaseService } from '../database/DatabaseService';
import { VocabularyEntry, WordDefinition, AppError } from '../types';
import { DictionaryService } from './DictionaryService';

export class VocabularyService {
  private static instance: VocabularyService;
  private databaseService: DatabaseService;
  private dictionaryService: DictionaryService;

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
    this.dictionaryService = DictionaryService.getInstance();
  }

  public static getInstance(): VocabularyService {
    if (!VocabularyService.instance) {
      VocabularyService.instance = new VocabularyService();
    }
    return VocabularyService.instance;
  }

  /**
   * 添加单词到单词本
   */
  public async addWord(
    word: string,
    context?: string,
    articleId?: number,
    definition?: WordDefinition
  ): Promise<VocabularyEntry> {
    try {
      // 检查单词是否已存在
      const existing = await this.getWordEntry(word);
      if (existing) {
        // 如果已存在，更新上下文和文章关联
        return await this.updateWordContext(existing.id!, context, articleId);
      }

      // 如果没有提供定义，尝试从词典获取
      if (!definition) {
        definition = await this.dictionaryService.lookupWord(word, context) || undefined;
      }

      const vocabularyEntry: Omit<VocabularyEntry, 'id'> = {
        word: word.toLowerCase().trim(),
        definition,
        context,
        articleId,
        addedAt: new Date(),
        reviewCount: 0,
        correctCount: 0,
        lastReviewedAt: undefined,
        nextReviewAt: this.calculateNextReview(new Date(), 0),
        masteryLevel: 0,
        difficulty: this.calculateDifficulty(word),
        tags: [],
        notes: '',
      };

      // 生成唯一ID（基于timestamp和随机数，转换为数字）
      const uniqueId = Math.floor(Date.now() + Math.random() * 10000);

      await this.databaseService.executeStatement(
        `INSERT INTO vocabulary (
          id, word, definition, context, article_id, added_at, review_count, 
          correct_count, last_reviewed_at, next_review_at, mastery_level, 
          difficulty, tags, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(uniqueId),
          vocabularyEntry.word,
          vocabularyEntry.definition ? JSON.stringify(vocabularyEntry.definition) : null,
          vocabularyEntry.context || null,
          vocabularyEntry.articleId || null,
          vocabularyEntry.addedAt.toISOString(),
          vocabularyEntry.reviewCount,
          vocabularyEntry.correctCount,
          vocabularyEntry.lastReviewedAt?.toISOString() || null,
          vocabularyEntry.nextReviewAt?.toISOString() || new Date().toISOString(),
          vocabularyEntry.masteryLevel,
          vocabularyEntry.difficulty,
          JSON.stringify(vocabularyEntry.tags),
          vocabularyEntry.notes || '',
        ]
      );

      // 查询刚插入的记录获取完整数据
      const inserted = await this.getWordEntry(vocabularyEntry.word);
      
      return inserted || {
        id: uniqueId,
        ...vocabularyEntry,
      };
    } catch (error) {
      console.error('Error adding word to vocabulary:', error);
      throw new Error(`Failed to add word: ${word}`);
    }
  }

  /**
   * 获取单词条目
   */
  public async getWordEntry(word: string): Promise<VocabularyEntry | null> {
    try {
      const results = await this.databaseService.executeQuery(
        'SELECT * FROM vocabulary WHERE word = ?',
        [word.toLowerCase().trim()]
      );

      if (results.length === 0) {
        return null;
      }

      return this.mapVocabularyRow(results[0]);
    } catch (error) {
      console.error('Error getting word entry:', error);
      return null;
    }
  }

  /**
   * 获取所有单词
   */
  public async getAllWords(options: {
    limit?: number;
    offset?: number;
    sortBy?: 'added_at' | 'word' | 'mastery_level' | 'next_review_at';
    sortOrder?: 'ASC' | 'DESC';
    masteryLevel?: number;
    difficulty?: string;
    tag?: string;
  } = {}): Promise<VocabularyEntry[]> {
    try {
      const {
        limit = 50,
        offset = 0,
        sortBy = 'added_at',
        sortOrder = 'DESC',
        masteryLevel,
        difficulty,
        tag,
      } = options;

      let whereClause = '1=1';
      const params: any[] = [];

      if (masteryLevel !== undefined) {
        whereClause += ' AND mastery_level = ?';
        params.push(masteryLevel);
      }

      if (difficulty) {
        whereClause += ' AND difficulty = ?';
        params.push(difficulty);
      }

      if (tag) {
        whereClause += ' AND tags LIKE ?';
        params.push(`%"${tag}"%`);
      }

      params.push(limit, offset);

      const results = await this.databaseService.executeQuery(
        `SELECT * FROM vocabulary 
         WHERE ${whereClause} 
         ORDER BY ${sortBy} ${sortOrder} 
         LIMIT ? OFFSET ?`,
        params
      );

      return results.map(this.mapVocabularyRow);
    } catch (error) {
      console.error('Error getting all words:', error);
      return [];
    }
  }

  /**
   * 搜索单词
   */
  public async searchWords(query: string, limit: number = 20): Promise<VocabularyEntry[]> {
    try {
      const results = await this.databaseService.executeQuery(
        `SELECT * FROM vocabulary 
         WHERE word LIKE ? OR context LIKE ? OR notes LIKE ? 
         ORDER BY word ASC 
         LIMIT ?`,
        [`%${query}%`, `%${query}%`, `%${query}%`, limit]
      );

      return results.map(this.mapVocabularyRow);
    } catch (error) {
      console.error('Error searching words:', error);
      return [];
    }
  }

  /**
   * 获取需要复习的单词
   */
  public async getWordsForReview(limit: number = 20): Promise<VocabularyEntry[]> {
    try {
      const now = new Date().toISOString();
      
      const results = await this.databaseService.executeQuery(
        `SELECT * FROM vocabulary 
         WHERE next_review_at <= ? AND mastery_level < 5 
         ORDER BY next_review_at ASC 
         LIMIT ?`,
        [now, limit]
      );

      return results.map(this.mapVocabularyRow);
    } catch (error) {
      console.error('Error getting words for review:', error);
      return [];
    }
  }

  /**
   * 记录复习结果
   */
  public async recordReview(id: number, isCorrect: boolean): Promise<VocabularyEntry> {
    try {
      const entry = await this.getWordById(id);
      if (!entry) {
        throw new Error('Word entry not found');
      }

      const now = new Date();
      const newReviewCount = entry.reviewCount + 1;
      const newCorrectCount = (entry.correctCount || 0) + (isCorrect ? 1 : 0);
      
      // 计算新的掌握程度
      const newMasteryLevel = this.calculateMasteryLevel(
        newReviewCount,
        newCorrectCount,
        entry.masteryLevel,
        isCorrect
      );

      // 计算下次复习时间
      const nextReviewAt = this.calculateNextReview(now, newMasteryLevel);

      await this.databaseService.executeStatement(
        `UPDATE vocabulary SET 
         review_count = ?, correct_count = ?, last_reviewed_at = ?, 
         next_review_at = ?, mastery_level = ? 
         WHERE id = ?`,
        [
          newReviewCount,
          newCorrectCount,
          now.toISOString(),
          nextReviewAt.toISOString(),
          newMasteryLevel,
          id,
        ]
      );

      // 返回更新后的条目
      const updatedEntry = await this.getWordById(id);
      return updatedEntry!;
    } catch (error) {
      console.error('Error recording review:', error);
      throw new Error('Failed to record review');
    }
  }

  /**
   * 更新单词笔记
   */
  public async updateNotes(id: number, notes: string): Promise<void> {
    try {
      await this.databaseService.executeStatement(
        'UPDATE vocabulary SET notes = ? WHERE id = ?',
        [notes, id]
      );
    } catch (error) {
      console.error('Error updating notes:', error);
      throw new Error('Failed to update notes');
    }
  }

  /**
   * 添加标签
   */
  public async addTag(id: number, tag: string): Promise<void> {
    try {
      const entry = await this.getWordById(id);
      if (!entry) {
        throw new Error('Word entry not found');
      }

      const tags = [...entry.tags];
      if (!tags.includes(tag)) {
        tags.push(tag);
        
        await this.databaseService.executeStatement(
          'UPDATE vocabulary SET tags = ? WHERE id = ?',
          [JSON.stringify(tags), id]
        );
      }
    } catch (error) {
      console.error('Error adding tag:', error);
      throw new Error('Failed to add tag');
    }
  }

  /**
   * 移除标签
   */
  public async removeTag(id: number, tag: string): Promise<void> {
    try {
      const entry = await this.getWordById(id);
      if (!entry) {
        throw new Error('Word entry not found');
      }

      const tags = entry.tags.filter(t => t !== tag);
      
      await this.databaseService.executeStatement(
        'UPDATE vocabulary SET tags = ? WHERE id = ?',
        [JSON.stringify(tags), id]
      );
    } catch (error) {
      console.error('Error removing tag:', error);
      throw new Error('Failed to remove tag');
    }
  }

  /**
   * 删除单词
   */
  public async deleteWord(id: number): Promise<void> {
    try {
      await this.databaseService.executeStatement(
        'DELETE FROM vocabulary WHERE id = ?',
        [id]
      );
      console.log(`✅ 已删除单词 ID: ${id}`);
    } catch (error) {
      console.error('Error deleting word:', error);
      throw new Error('Failed to delete word');
    }
  }

  /**
   * 获取学习统计
   */
  public async getStudyStats(): Promise<{
    totalWords: number;
    masteredWords: number;
    wordsForReview: number;
    averageMastery: number;
    studyStreak: number;
    totalReviews: number;
  }> {
    try {
      const [totalResult, masteredResult, reviewResult, avgResult, streakResult] = await Promise.all([
        this.databaseService.executeQuery('SELECT COUNT(*) as count FROM vocabulary'),
        this.databaseService.executeQuery('SELECT COUNT(*) as count FROM vocabulary WHERE mastery_level >= 5'),
        this.databaseService.executeQuery('SELECT COUNT(*) as count FROM vocabulary WHERE next_review_at <= ?', [new Date().toISOString()]),
        this.databaseService.executeQuery('SELECT AVG(mastery_level) as avg FROM vocabulary'),
        this.calculateStudyStreak(),
      ]);

      const totalReviewsResult = await this.databaseService.executeQuery(
        'SELECT SUM(review_count) as total FROM vocabulary'
      );

      return {
        totalWords: totalResult[0]?.count || 0,
        masteredWords: masteredResult[0]?.count || 0,
        wordsForReview: reviewResult[0]?.count || 0,
        averageMastery: Math.round((avgResult[0]?.avg || 0) * 10) / 10,
        studyStreak: streakResult,
        totalReviews: totalReviewsResult[0]?.total || 0,
      };
    } catch (error) {
      console.error('Error getting study stats:', error);
      return {
        totalWords: 0,
        masteredWords: 0,
        wordsForReview: 0,
        averageMastery: 0,
        studyStreak: 0,
        totalReviews: 0,
      };
    }
  }

  /**
   * 获取所有标签
   */
  public async getAllTags(): Promise<string[]> {
    try {
      const results = await this.databaseService.executeQuery(
        'SELECT DISTINCT tags FROM vocabulary WHERE tags IS NOT NULL AND tags != "[]"'
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
   * 导出单词本
   */
  public async exportVocabulary(): Promise<VocabularyEntry[]> {
    try {
      const results = await this.databaseService.executeQuery(
        'SELECT * FROM vocabulary ORDER BY added_at DESC'
      );

      return results.map(this.mapVocabularyRow);
    } catch (error) {
      console.error('Error exporting vocabulary:', error);
      return [];
    }
  }

  /**
   * 批量导入单词
   */
  public async importWords(words: string[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const word of words) {
      try {
        await this.addWord(word.trim());
        success++;
      } catch (error) {
        console.error(`Failed to import word: ${word}`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  // 公开辅助方法

  /**
   * 通过ID获取单词
   */
  public async getWordById(id: number): Promise<VocabularyEntry | null> {
    try {
      const results = await this.databaseService.executeQuery(
        'SELECT * FROM vocabulary WHERE id = ?',
        [id]
      );

      if (results.length === 0) {
        return null;
      }

      return this.mapVocabularyRow(results[0]);
    } catch (error) {
      console.error('Error getting word by ID:', error);
      return null;
    }
  }

  // 私有辅助方法

  private async updateWordContext(
    id: number,
    context?: string,
    articleId?: number
  ): Promise<VocabularyEntry> {
    try {
      const updates: string[] = [];
      const params: any[] = [];

      if (context) {
        updates.push('context = ?');
        params.push(context);
      }

      if (articleId) {
        updates.push('article_id = ?');
        params.push(articleId);
      }

      if (updates.length > 0) {
        params.push(id);
        await this.databaseService.executeStatement(
          `UPDATE vocabulary SET ${updates.join(', ')} WHERE id = ?`,
          params
        );
      }

      const updatedEntry = await this.getWordById(id);
      return updatedEntry!;
    } catch (error) {
      console.error('Error updating word context:', error);
      throw error;
    }
  }

  private calculateDifficulty(word: string): string {
    // 简单的难度计算：基于单词长度和常见程度
    if (word.length <= 4) return 'easy';
    if (word.length <= 7) return 'medium';
    return 'hard';
  }

  private calculateMasteryLevel(
    reviewCount: number,
    correctCount: number,
    currentLevel: number,
    isCorrect: boolean
  ): number {
    const accuracy = reviewCount > 0 ? correctCount / reviewCount : 0;
    
    if (isCorrect) {
      // 答对了，可能提升等级
      if (accuracy >= 0.8 && reviewCount >= 3) {
        return Math.min(5, currentLevel + 1);
      }
      return currentLevel;
    } else {
      // 答错了，降低等级
      return Math.max(0, currentLevel - 1);
    }
  }

  private calculateNextReview(lastReview: Date, masteryLevel: number): Date {
    const intervals = [1, 3, 7, 14, 30, 90]; // 天数
    const intervalDays = intervals[Math.min(masteryLevel, intervals.length - 1)];
    
    const nextReview = new Date(lastReview);
    nextReview.setDate(nextReview.getDate() + intervalDays);
    
    return nextReview;
  }

  private async calculateStudyStreak(): Promise<number> {
    try {
      // 计算连续学习天数
      const results = await this.databaseService.executeQuery(
        `SELECT DATE(last_reviewed_at) as review_date 
         FROM vocabulary 
         WHERE last_reviewed_at IS NOT NULL 
         GROUP BY DATE(last_reviewed_at) 
         ORDER BY review_date DESC`
      );

      if (results.length === 0) return 0;

      let streak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < results.length; i++) {
        const reviewDate = new Date(results[i].review_date);
        const expectedDate = new Date(today);
        expectedDate.setDate(expectedDate.getDate() - i);

        if (reviewDate.getTime() === expectedDate.getTime()) {
          streak++;
        } else {
          break;
        }
      }

      return streak;
    } catch (error) {
      console.error('Error calculating study streak:', error);
      return 0;
    }
  }

  private mapVocabularyRow(row: any): VocabularyEntry {
    return {
      id: row.id,
      word: row.word,
      definition: row.definition ? JSON.parse(row.definition) : undefined,
      context: row.context,
      articleId: row.article_id,
      addedAt: new Date(row.added_at),
      reviewCount: row.review_count,
      correctCount: row.correct_count,
      lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at) : undefined,
      nextReviewAt: new Date(row.next_review_at),
      masteryLevel: row.mastery_level,
      difficulty: row.difficulty,
      tags: row.tags ? JSON.parse(row.tags) : [],
      notes: row.notes,
    };
  }
}

// 导出单例实例
export const vocabularyService = VocabularyService.getInstance();