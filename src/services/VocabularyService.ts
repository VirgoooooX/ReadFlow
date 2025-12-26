import { DatabaseService } from '../database/DatabaseService';
import { VocabularyEntry, WordDefinition, AppError, ProxyModeConfig } from '../types';
import { DictionaryService } from './DictionaryService';
import { SettingsService } from './SettingsService';
import { logger } from './rss/RSSUtils';

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
        difficulty: this.calculateDifficulty(word, definition),
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
      );      // 查询刚插入的记录获取完整数据
      const inserted = await this.getWordEntry(vocabularyEntry.word);
      
      return inserted || {
        id: uniqueId,
        ...vocabularyEntry,
      };
    } catch (error) {
      logger.error('Error adding word to vocabulary:', error);
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
      logger.error('Error getting word entry:', error);
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
      logger.error('Error getting all words:', error);
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
      logger.error('Error searching words:', error);
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
      logger.error('Error getting words for review:', error);
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
      logger.error('Error recording review:', error);
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
      logger.error('Error updating notes:', error);
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
      logger.error('Error adding tag:', error);
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
      logger.error('Error removing tag:', error);
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
      logger.info(`✅ 已删除单词 ID: ${id}`);
    } catch (error) {
      logger.error('Error deleting word:', error);
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
      logger.error('Error getting study stats:', error);
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
      logger.error('Error getting all tags:', error);
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
      logger.error('Error exporting vocabulary:', error);
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
        logger.error(`Failed to import word: ${word}`, error);
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
      logger.error('Error getting word by ID:', error);
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
      const entry = await this.getWordById(id);
      if (!entry) {
        throw new Error('Word entry not found');
      }

      const updates: string[] = [];
      const params: any[] = [];

      // 【优化】只在 context 为空时才更新，避免覆盖已有的上下文
      if (context && !entry.context) {
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
      logger.error('Error updating word context:', error);
      throw error;
    }
  }

  private calculateDifficulty(word: string, definition?: WordDefinition): string {
    // 基于单词长度的简单难度计算
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
      logger.error('Error calculating study streak:', error);
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

  // ===================代理服务器同步相关方法===================

  /**
   * 同步到代理服务器（如果启用）
   */
  public async syncToProxyServer(): Promise<void> {
    const config = await SettingsService.getInstance().getProxyModeConfig();
    if (!config.enabled || !config.token) {
      return;
    }

    try {
      const startTime = Date.now();
      logger.info('\n' + '='.repeat(60));
      logger.info('[Vocabulary Sync] 🚀 开始同步生词本到代理服务器...');
      logger.info('='.repeat(60));

      // 1. Push: 上传本地修改
      const pushResult = await this.pushToServer(config);

      // 2. Pull: 拉取服务端更新，并获取服务端时间
      const pullResult = await this.pullFromServerAndGetTime(config);

      // 3. 更新最后同步时间（优先使用服务端时间）
      const syncTime = pullResult.serverTime || new Date().toISOString();
      await SettingsService.getInstance().saveProxyModeConfig({
        ...config,
        lastSyncTime: syncTime,
      });

      const duration = Date.now() - startTime;
      logger.info('-'.repeat(60));
      logger.info('[Vocabulary Sync] 📊 同步总结');
      logger.info(`[Vocabulary Sync] ⬆️  上传: ${pushResult.uploadedCount} 个单词`);
      logger.info(`[Vocabulary Sync] ⬇️  下载: ${pullResult.downloadedCount} 个单词`);
      logger.info(`[Vocabulary Sync] ⏱️  耗时: ${(duration / 1000).toFixed(2)}s`);
      logger.info(`[Vocabulary Sync] 🕐 最后同步: ${syncTime}`);
      logger.info('='.repeat(60) + '\n');
    } catch (error) {
      logger.error('[Vocabulary Sync] 💥 同步失败:', error);
      // 静默失败，不影响本地使用
    }
  }

  /**
   * Push: 上传本地修改的单词（包含完整的复习数据）
   */
  private async pushToServer(config: ProxyModeConfig): Promise<{ uploadedCount: number }> {
    const lastSync = config.lastSyncTime || '1970-01-01T00:00:00Z';

    // 获取本地修改的单词
    const modifiedWords = await this.databaseService.executeQuery(
      `SELECT * FROM vocabulary WHERE updated_at > ?`,
      [lastSync]
    );

    if (modifiedWords.length === 0) {
      logger.info('[Vocabulary Sync] ⚠️ 没有本地修改，跳过 Push');
      return { uploadedCount: 0 };
    }

    logger.info(`[Vocabulary Sync] ⬆️  准备上传 ${modifiedWords.length} 个单词`);

    // 转换时间戳为 ISO 字符串格式
    const convertToISO = (timestamp: any): string | null => {
      if (!timestamp) return null;
      if (typeof timestamp === 'string') return timestamp;
      // 处理秒级时间戳（SQLite 存储的是整数秒）
      if (typeof timestamp === 'number') {
        return new Date(timestamp * 1000).toISOString();
      }
      return null;
    };

    // 解析 JSON 字段
    const parseJSON = (value: any, defaultValue: any[] = []) => {
      if (!value) return defaultValue;
      if (Array.isArray(value)) return value;
      try {
        return typeof value === 'string' ? JSON.parse(value) : value;
      } catch {
        return defaultValue;
      }
    };

    const response = await fetch(`${config.serverUrl}/api/vocab/push`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        words: modifiedWords.map(w => ({
          // 基础信息
          word: w.word,
          definition: w.definition,
          translation: w.translation || null,
          example: w.example || null,
          context: w.context || null,
          
          // 来源信息
          sourceArticleId: w.source_article_id || null,
          sourceArticleTitle: w.source_article_title || null,
          articleId: w.article_id || null,
          
          // 学习进度数据（核心的SRS系统数据）
          reviewCount: w.review_count || 0,
          correctCount: w.correct_count || 0,
          masteryLevel: w.mastery_level || 0,
          
          // 复习时间戳（转换为 ISO 格式）
          nextReviewAt: convertToISO(w.next_review_at),
          lastReviewedAt: convertToISO(w.last_reviewed_at),
          lastReviewAt: convertToISO(w.last_review_at),
          
          // 分类和笔记
          difficulty: w.difficulty || 'medium',
          tags: parseJSON(w.tags, []),
          notes: w.notes || null,
          
          // 时间戳
          addedAt: convertToISO(w.added_at) || new Date().toISOString(),
          updatedAt: convertToISO(w.updated_at) || new Date().toISOString(),
          
          // 标记
          isDeleted: false,
        })),
      }),
    });

    const data = await response.json();
    const uploadedCount = data.synced || modifiedWords.length;
    logger.info(`[Vocabulary Sync] ✅ Push 完成，成功 ${uploadedCount}/${modifiedWords.length} 个单词`);
    
    return { uploadedCount };
  }

  /**
   * Pull: 拉取服务端更新，并返回服务端时间和下载数量
   */
  private async pullFromServerAndGetTime(config: ProxyModeConfig): Promise<{
    serverTime: string | null;
    downloadedCount: number;
  }> {
    const lastSync = config.lastSyncTime || '1970-01-01T00:00:00Z';
    let allServerWords: any[] = [];
    let hasMore = true;
    let loopCount = 0;
    let serverTime: string | null = null;
    const MAX_LOOPS = 10; // 防止死循环

    // 循环拉取直到没有更多数据
    while (hasMore && loopCount < MAX_LOOPS) {
      loopCount++;

      const response = await fetch(
        `${config.serverUrl}/api/vocab/pull?since=${encodeURIComponent(lastSync)}&limit=500`,
        { headers: { 'Authorization': `Bearer ${config.token}` } }
      );

      const data = await response.json();
      const serverWords = data.words || [];
      allServerWords.push(...serverWords);

      // 检查是否还有更多数据
      hasMore = data.has_more === true;

      // 保存服务端时间（使用最后一次的）
      if (data.server_time) {
        serverTime = data.server_time;
      }

      logger.info(`[Vocabulary Sync] ⬇️  拉取批次 ${loopCount}: ${serverWords.length} 个单词, has_more: ${hasMore}`);
    }

    if (allServerWords.length === 0) {
      logger.info('[Vocabulary Sync] ⚠️ 服务端没有更新，跳过 Pull');
      return { serverTime, downloadedCount: 0 };
    }

    logger.info(`[Vocabulary Sync] ⬇️  从服务端总共拉取 ${allServerWords.length} 个单词`);

    // Upsert 到本地数据库
    let upsertCount = 0;
    for (const word of allServerWords) {
      if (word.is_deleted) {
        // 删除单词
        const existing = await this.getWordEntry(word.word);
        if (existing && existing.id) {
          await this.deleteWord(existing.id);
          upsertCount++;
        }
      } else {
        await this.upsertWord(word);
        upsertCount++;
      }
    }

    logger.info(`[Vocabulary Sync] ✅ Pull 完成，处理 ${upsertCount}/${allServerWords.length} 个`);
    return { serverTime, downloadedCount: upsertCount };
  }

  /**
   * Upsert 单词（插入或更新）
   */
  private async upsertWord(word: any): Promise<void> {
    const existing = await this.getWordEntry(word.word);

    if (existing) {
      // 比较时间戳，更新的覆盖旧的
      const existingTime = new Date(existing.addedAt).getTime();
      const serverTime = new Date(word.updated_at).getTime();

      if (serverTime > existingTime) {
        await this.databaseService.executeStatement(
          `UPDATE vocabulary SET definition = ?, context = ?, updated_at = ? WHERE word = ?`,
          [word.translation, word.context, word.updated_at, word.word]
        );
        logger.info(`更新单词: ${word.word}`);
      }
    } else {
      // 插入新单词
      await this.addWord(word.word, word.context, undefined, word.translation);
      logger.info(`新增单词: ${word.word}`);
    }
  }

}

// 导出单例实例
export const vocabularyService = VocabularyService.getInstance();