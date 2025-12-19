import * as SQLite from 'expo-sqlite';
import { DatabaseConfig, AppError } from '../types';
import * as FileSystem from 'expo-file-system';

export class DatabaseService {
  private static instance: DatabaseService;
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  private readonly config: DatabaseConfig = {
    name: 'techflow.db',
    version: '1.0',
    displayName: 'TechFlow Database',
    size: 50 * 1024 * 1024, // 50MB
  };

  private constructor() { }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * 初始化数据库
   */
  public async initializeDatabase(): Promise<void> {
    // 如果已经在初始化，等待初始化完成
    if (this.initPromise) {
      return this.initPromise;
    }

    // 如果已经初始化完成，直接返回
    if (this.isInitialized && this.db) {
      return;
    }

    this.initPromise = this.doInitialize();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInitialize(): Promise<void> {
    try {
      console.log('🔧 开始初始化数据库...');

      // 初始化主数据库
      this.db = await SQLite.openDatabaseAsync(this.config.name);
      console.log('✅ 数据库打开成功:', this.config.name);

      // 创建表结构
      await this.createTables();
      console.log('✅ 表创建成功');

      // 执行数据库迁移
      await this.migrateDatabase();
      console.log('✅ 数据库迁移成功');

      this.isInitialized = true;
      console.log('✅ 数据库初始化完成');
    } catch (error) {
      console.error('❌ 数据库初始化失败:', error);
      this.isInitialized = false;
      this.db = null;
      throw new AppError({
        code: 'DB_INIT_ERROR',
        message: 'Failed to initialize database',
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 数据库迁移
   */
  private async migrateDatabase(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const tableInfo = await this.db.getAllAsync('PRAGMA table_info(rss_sources)');
      const hasContentType = tableInfo.some((column: any) => column.name === 'content_type');
      const hasUnreadCount = tableInfo.some((column: any) => column.name === 'unread_count');
      const hasErrorCount = tableInfo.some((column: any) => column.name === 'error_count');
      const hasSortOrder = tableInfo.some((column: any) => column.name === 'sort_order');

      if (!hasContentType) {
        console.log('Adding content_type column to rss_sources table...');
        await this.db.execAsync('ALTER TABLE rss_sources ADD COLUMN content_type TEXT DEFAULT "image_text"');

        // 更新现有数据的content_type
        await this.db.execAsync(`
          UPDATE rss_sources 
          SET content_type = CASE 
            WHEN url LIKE '%slashdot%' THEN 'text'
            ELSE 'image_text'
          END
        `);

        console.log('content_type column added successfully');
      }

      if (!hasUnreadCount) {
        console.log('Adding unread_count column to rss_sources table...');
        await this.db.execAsync('ALTER TABLE rss_sources ADD COLUMN unread_count INTEGER DEFAULT 0');
        console.log('unread_count column added successfully');
      }

      if (!hasErrorCount) {
        console.log('Adding error_count column to rss_sources table...');
        await this.db.execAsync('ALTER TABLE rss_sources ADD COLUMN error_count INTEGER DEFAULT 0');
        console.log('error_count column added successfully');
      }

      if (!hasSortOrder) {
        console.log('Adding sort_order column to rss_sources table...');
        await this.db.execAsync('ALTER TABLE rss_sources ADD COLUMN sort_order INTEGER DEFAULT 0');
        console.log('sort_order column added successfully');
      }

      // 【新增】检查articles表是否存在scroll_position列
      const articlesTableInfo = await this.db.getAllAsync('PRAGMA table_info(articles)');
      const hasScrollPosition = articlesTableInfo.some((column: any) => column.name === 'scroll_position');

      if (!hasScrollPosition) {
        console.log('Adding scroll_position column to articles table...');
        await this.db.execAsync('ALTER TABLE articles ADD COLUMN scroll_position INTEGER DEFAULT 0');
        console.log('scroll_position column added successfully');
      }

      // 检查vocabulary表是否存在缺失的字段
      const vocabularyTableInfo = await this.db.getAllAsync('PRAGMA table_info(vocabulary)');
      const hasNextReviewAt = vocabularyTableInfo.some((column: any) => column.name === 'next_review_at');
      const hasLastReviewedAt = vocabularyTableInfo.some((column: any) => column.name === 'last_reviewed_at');

      if (!hasNextReviewAt) {
        console.log('Adding next_review_at column to vocabulary table...');
        await this.db.execAsync('ALTER TABLE vocabulary ADD COLUMN next_review_at INTEGER');
        console.log('next_review_at column added successfully');
      }

      if (!hasLastReviewedAt) {
        console.log('Adding last_reviewed_at column to vocabulary table...');
        await this.db.execAsync('ALTER TABLE vocabulary ADD COLUMN last_reviewed_at INTEGER');
        console.log('last_reviewed_at column added successfully');
      }

      // 检查vocabulary表是否存在新增的字段
      const hasContext = vocabularyTableInfo.some((column: any) => column.name === 'context');
      const hasArticleId = vocabularyTableInfo.some((column: any) => column.name === 'article_id');
      const hasCorrectCount = vocabularyTableInfo.some((column: any) => column.name === 'correct_count');
      const hasDifficulty = vocabularyTableInfo.some((column: any) => column.name === 'difficulty');
      const hasNotes = vocabularyTableInfo.some((column: any) => column.name === 'notes');

      if (!hasContext) {
        console.log('Adding context column to vocabulary table...');
        await this.db.execAsync('ALTER TABLE vocabulary ADD COLUMN context TEXT');
        console.log('context column added successfully');
      }

      if (!hasArticleId) {
        console.log('Adding article_id column to vocabulary table...');
        await this.db.execAsync('ALTER TABLE vocabulary ADD COLUMN article_id INTEGER');
        console.log('article_id column added successfully');
      }

      if (!hasCorrectCount) {
        console.log('Adding correct_count column to vocabulary table...');
        await this.db.execAsync('ALTER TABLE vocabulary ADD COLUMN correct_count INTEGER DEFAULT 0');
        console.log('correct_count column added successfully');
      }

      if (!hasDifficulty) {
        console.log('Adding difficulty column to vocabulary table...');
        await this.db.execAsync('ALTER TABLE vocabulary ADD COLUMN difficulty TEXT DEFAULT "medium"');
        console.log('difficulty column added successfully');
      }

      if (!hasNotes) {
        console.log('Adding notes column to vocabulary table...');
        await this.db.execAsync('ALTER TABLE vocabulary ADD COLUMN notes TEXT DEFAULT ""');
        console.log('notes column added successfully');
      }

      // 清理旧数据：删除 id 为 NULL 或空字符串的单词记录
      try {
        console.log('Cleaning up invalid vocabulary entries with null/empty IDs...');
        await this.db.execAsync("DELETE FROM vocabulary WHERE id IS NULL OR id = ''");
        console.log('✅ Invalid vocabulary entries cleaned up successfully');
      } catch (cleanupError) {
        console.warn('Warning: Could not clean up invalid entries:', cleanupError);
      }
    } catch (error) {
      console.error('Database migration failed:', error);
      // 不抛出错误，让应用继续运行
    }
  }

  /**
   * 创建数据库表结构
   */
  private async createTables(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const tables = [
      // 文章表
      `CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        title_cn TEXT,
        content TEXT NOT NULL,
        summary TEXT NOT NULL,
        author TEXT,
        published_at INTEGER NOT NULL,
        rss_source_id INTEGER NOT NULL,
        source_name TEXT NOT NULL,
        url TEXT NOT NULL,
        guid TEXT,
        image_url TEXT,
        tags TEXT, -- JSON array
        category TEXT NOT NULL,
        word_count INTEGER NOT NULL,
        reading_time INTEGER NOT NULL,
        difficulty TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        is_favorite INTEGER DEFAULT 0,
        read_at INTEGER,
        read_progress INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (rss_source_id) REFERENCES rss_sources (id) ON DELETE CASCADE
      )`,

      // RSS源表
      `CREATE TABLE IF NOT EXISTS rss_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        content_type TEXT DEFAULT 'image_text',
        is_active INTEGER DEFAULT 1,
        last_updated TEXT,
        article_count INTEGER DEFAULT 0,
        update_frequency INTEGER DEFAULT 3600,
        language TEXT,
        favicon TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )`,

      // 单词本表
      `CREATE TABLE IF NOT EXISTS vocabulary (
        id TEXT PRIMARY KEY,
        word TEXT NOT NULL,
        definition TEXT NOT NULL,
        translation TEXT,
        example TEXT,
        source_article_id TEXT,
        source_article_title TEXT,
        added_at INTEGER NOT NULL,
        review_count INTEGER DEFAULT 0,
        last_review_at INTEGER,
        last_reviewed_at INTEGER,
        next_review_at INTEGER,
        mastery_level INTEGER DEFAULT 0,
        tags TEXT, -- JSON array
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )`,

      // 用户设置表
      `CREATE TABLE IF NOT EXISTS user_preferences (
        id INTEGER PRIMARY KEY,
        reading_settings TEXT NOT NULL, -- JSON
        translation_provider TEXT DEFAULT 'google',
        enable_auto_translation INTEGER DEFAULT 0,
        enable_title_translation INTEGER DEFAULT 1,
        max_concurrent_translations INTEGER DEFAULT 5,
        translation_timeout INTEGER DEFAULT 5000,
        default_category TEXT DEFAULT 'technology',
        enable_notifications INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )`,

      // 阅读历史表
      `CREATE TABLE IF NOT EXISTS reading_history (
        id TEXT PRIMARY KEY,
        article_id TEXT NOT NULL,
        read_at INTEGER NOT NULL,
        reading_time INTEGER NOT NULL, -- 秒
        progress INTEGER NOT NULL, -- 0-100
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )`,

      // 词典缓存表 - 存储LLM查询结果
      `CREATE TABLE IF NOT EXISTS dictionary_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT NOT NULL,
        base_word TEXT,
        word_form TEXT,
        phonetic TEXT,
        definitions TEXT NOT NULL,
        source TEXT DEFAULT 'llm',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )`,

      // 翻译缓存表 - 存储整句翻译结果
      `CREATE TABLE IF NOT EXISTS translation_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_text TEXT NOT NULL,
        translated_text TEXT NOT NULL,
        source_lang TEXT DEFAULT 'en',
        target_lang TEXT DEFAULT 'zh',
        source TEXT DEFAULT 'llm',
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )`,

      // LLM使用统计表
      `CREATE TABLE IF NOT EXISTS llm_usage_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_type TEXT NOT NULL,
        tokens_used INTEGER DEFAULT 0,
        provider TEXT,
        model TEXT,
        success INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )`,
    ];

    // 创建索引
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_articles_rss_source_id ON articles(rss_source_id)',
      'CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category)',
      'CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at)',
      'CREATE INDEX IF NOT EXISTS idx_articles_is_read ON articles(is_read)',
      'CREATE INDEX IF NOT EXISTS idx_articles_is_favorite ON articles(is_favorite)',
      'CREATE INDEX IF NOT EXISTS idx_vocabulary_word ON vocabulary(word)',
      'CREATE INDEX IF NOT EXISTS idx_vocabulary_added_at ON vocabulary(added_at)',
      'CREATE INDEX IF NOT EXISTS idx_reading_history_article_id ON reading_history(article_id)',
      'CREATE INDEX IF NOT EXISTS idx_dictionary_cache_word ON dictionary_cache(word)',
      'CREATE INDEX IF NOT EXISTS idx_dictionary_cache_base_word ON dictionary_cache(base_word)',
      'CREATE INDEX IF NOT EXISTS idx_translation_cache_text ON translation_cache(original_text)',
      'CREATE INDEX IF NOT EXISTS idx_llm_usage_stats_type ON llm_usage_stats(request_type)',
      'CREATE INDEX IF NOT EXISTS idx_llm_usage_stats_created ON llm_usage_stats(created_at)',
    ];

    // 执行创建表语句
    for (const tableSQL of tables) {
      await this.db.execAsync(tableSQL);
    }

    // 执行创建索引语句
    for (const indexSQL of indexes) {
      await this.db.execAsync(indexSQL);
    }

    console.log('Database tables created successfully');
  }

  /**
   * 插入默认RSS源数据
   */
  private async insertSampleRSSData(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // 检查是RSS源是否存在
      const existingSources = await this.db.getAllAsync('SELECT COUNT(*) as count FROM rss_sources');
      if (existingSources && Array.isArray(existingSources) && existingSources.length > 0) {
        const row = existingSources[0] as any;
        if (row.count > 0) {
          console.log('RSS sources already exist, skipping sample data insertion');
          return;
        }
      }

      // 使用事务来防止数据库锁定
      await this.db.execAsync('BEGIN TRANSACTION');

      // 插入指定的默认RSS源
      const defaultSources = [
        {
          url: 'http://rss.slashdot.org/Slashdot/slashdot',
          title: 'Slashdot',
          description: 'News for nerds, stuff that matters',
          category: '技术',
          content_type: 'text',
          is_active: 1,
          last_updated: new Date().toISOString(),
          article_count: 0,
          update_frequency: 3600,
          language: 'en',
          favicon: null,
        },
        {
          url: 'rsshub://techcrunch/news',
          title: 'TechCrunch News',
          description: 'Technology news and startup information via RSSHub',
          category: '新闻',
          content_type: 'image_text',
          is_active: 1,
          last_updated: new Date().toISOString(),
          article_count: 0,
          update_frequency: 1800,
          language: 'en',
          favicon: null,
        },
        {
          url: 'https://www.engadget.com/rss.xml',
          title: 'Engadget',
          description: 'Engadget is a web magazine with obsessive daily coverage of everything new in gadgets and consumer electronics',
          category: '科技',
          content_type: 'image_text',
          is_active: 1,
          last_updated: new Date().toISOString(),
          article_count: 0,
          update_frequency: 3600,
          language: 'en',
          favicon: null,
        },
      ];

      for (const source of defaultSources) {
        await this.db.runAsync(
          `INSERT INTO rss_sources (url, title, description, category, content_type, is_active, last_updated, 
           article_count, update_frequency, language, favicon) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            source.url,
            source.title,
            source.description,
            source.category,
            source.content_type,
            source.is_active,
            source.last_updated,
            source.article_count,
            source.update_frequency,
            source.language,
            source.favicon,
          ]
        );
      }

      console.log('Default RSS sources inserted successfully');

      // 提交事务
      await this.db.execAsync('COMMIT');
    } catch (error) {
      // 回滚事务
      try {
        await this.db.execAsync('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
      console.error('Error inserting default RSS data:', error);
      // 不抛出错误，因为这不是关键功能
    }
  }

  /**
   * 获取用户偏好设置
   */
  public async getUserPreferences(): Promise<{
    readingSettings: any;
    translationProvider: string;
    enableAutoTranslation: boolean;
    enableTitleTranslation: boolean;
    maxConcurrentTranslations: number;
    translationTimeout: number;
    defaultCategory: string;
    enableNotifications: boolean;
  } | null> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const result: any = await this.db.getAllAsync(
        'SELECT * FROM user_preferences WHERE id = 1'
      );

      if (result && result.length > 0) {
        return {
          readingSettings: JSON.parse(result[0].reading_settings),
          translationProvider: result[0].translation_provider,
          enableAutoTranslation: result[0].enable_auto_translation === 1,
          enableTitleTranslation: result[0].enable_title_translation === 1,
          maxConcurrentTranslations: result[0].max_concurrent_translations,
          translationTimeout: result[0].translation_timeout,
          defaultCategory: result[0].default_category,
          enableNotifications: result[0].enable_notifications === 1,
        };
      }

      return null;
    } catch (error) {
      console.error('Error getting user preferences:', error);
      throw error;
    }
  }

  /**
   * 保存用户偏好设置
   */
  public async saveUserPreferences(preferences: {
    readingSettings?: any;
    translationProvider?: string;
    enableAutoTranslation?: boolean;
    enableTitleTranslation?: boolean;
    maxConcurrentTranslations?: number;
    translationTimeout?: number;
    defaultCategory?: string;
    enableNotifications?: boolean;
  }): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const existing = await this.getUserPreferences();
      const now = Math.floor(Date.now() / 1000);

      if (existing) {
        // 更新现有记录
        await this.db.runAsync(
          `UPDATE user_preferences SET 
           reading_settings = ?,
           translation_provider = ?,
           enable_auto_translation = ?,
           enable_title_translation = ?,
           max_concurrent_translations = ?,
           translation_timeout = ?,
           default_category = ?,
           enable_notifications = ?,
           updated_at = ?
           WHERE id = 1`,
          [
            JSON.stringify(preferences.readingSettings || existing.readingSettings),
            preferences.translationProvider || existing.translationProvider,
            preferences.enableAutoTranslation !== undefined ? (preferences.enableAutoTranslation ? 1 : 0) : (existing.enableAutoTranslation ? 1 : 0),
            preferences.enableTitleTranslation !== undefined ? (preferences.enableTitleTranslation ? 1 : 0) : (existing.enableTitleTranslation ? 1 : 0),
            preferences.maxConcurrentTranslations || existing.maxConcurrentTranslations,
            preferences.translationTimeout || existing.translationTimeout,
            preferences.defaultCategory || existing.defaultCategory,
            preferences.enableNotifications !== undefined ? (preferences.enableNotifications ? 1 : 0) : (existing.enableNotifications ? 1 : 0),
            now
          ]
        );
      } else {
        // 插入新记录
        await this.db.runAsync(
          `INSERT INTO user_preferences (
            id, reading_settings, translation_provider, enable_auto_translation,
            enable_title_translation, max_concurrent_translations, translation_timeout,
            default_category, enable_notifications, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            1,
            JSON.stringify(preferences.readingSettings || {}),
            preferences.translationProvider || 'google',
            preferences.enableAutoTranslation ? 1 : 0,
            preferences.enableTitleTranslation !== undefined ? (preferences.enableTitleTranslation ? 1 : 0) : 1,
            preferences.maxConcurrentTranslations || 5,
            preferences.translationTimeout || 5000,
            preferences.defaultCategory || 'technology',
            preferences.enableNotifications !== undefined ? (preferences.enableNotifications ? 1 : 0) : 1,
            now,
            now
          ]
        );
      }
    } catch (error) {
      console.error('Error saving user preferences:', error);
      throw error;
    }
  }

  /**
   * 执行SQL查询
   */
  public async executeQuery(sql: string, params: any[] = []): Promise<any[]> {
    // 确保数据库已初始化
    await this.ensureInitialized();

    try {
      if (!this.db) {
        console.error('❌ 数据库未初始化，状态:', this.getStatus());
        throw new Error('Database not available');
      }
      const result = await this.db.getAllAsync(sql, params);
      return result;
    } catch (error) {
      console.error('SQL Query Error:', error);
      console.error('SQL:', sql);
      console.error('Params:', params);
      console.error('数据库状态:', this.getStatus());
      throw error;
    }
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized || !this.db) {
      await this.initializeDatabase();
    }
  }

  /**
   * 执行SQL语句（无返回结果）
   */
  public async executeStatement(sql: string, params: any[] = []): Promise<void> {
    await this.ensureInitialized();

    try {
      if (!this.db) {
        throw new Error('Database not available');
      }
      await this.db.runAsync(sql, params);
    } catch (error) {
      console.error('SQL Statement Error:', error);
      console.error('SQL:', sql);
      console.error('Params:', params);
      throw error;
    }
  }

  /**
   * 执行INSERT语句并返回插入的ID
   */
  public async executeInsert(sql: string, params: any[] = []): Promise<{ insertId: number; changes: number }> {
    await this.ensureInitialized();

    try {
      if (!this.db) {
        throw new Error('Database not available');
      }
      const result = await this.db.runAsync(sql, params);
      return {
        insertId: result.lastInsertRowId,
        changes: result.changes
      };
    } catch (error) {
      console.error('SQL Insert Error:', error);
      console.error('SQL:', sql);
      console.error('Params:', params);
      throw error;
    }
  }

  /**
   * 开始事务
   */
  public async beginTransaction(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    await this.db.execAsync('BEGIN TRANSACTION');
  }

  /**
   * 提交事务
   */
  public async commitTransaction(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    await this.db.execAsync('COMMIT');
  }

  /**
   * 回滚事务
   */
  public async rollbackTransaction(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    await this.db.execAsync('ROLLBACK');
  }

  /**
   * 关闭数据库连接
   */
  public async closeDatabase(): Promise<void> {
    try {
      if (this.db) {
        await this.db.closeAsync();
        this.db = null;
      }
      this.isInitialized = false;
      console.log('Database connections closed');
    } catch (error) {
      console.error('Error closing database:', error);
    }
  }

  /**
   * 获取数据库状态
   */
  public getStatus(): { isInitialized: boolean; hasMainDb: boolean } {
    return {
      isInitialized: this.isInitialized,
      hasMainDb: this.db !== null,
    };
  }

  /**
   * 重置数据库（删除并重新创建）
   */
  public async resetDatabase(): Promise<void> {
    try {
      // 关闭现有连接
      await this.closeDatabase();

      const dbPath = `${FileSystem.documentDirectory}SQLite/${this.config.name}`;
      const dbInfo = await FileSystem.getInfoAsync(dbPath);
      if (dbInfo.exists) {
        await FileSystem.deleteAsync(dbPath);
        console.log('Database file deleted');
      }

      // 重新初始化
      await this.initializeDatabase();
      console.log('Database reset successfully');
    } catch (error) {
      console.error('Error resetting database:', error);
      throw error;
    }
  }
}

// 导出单例实例
export const databaseService = DatabaseService.getInstance();