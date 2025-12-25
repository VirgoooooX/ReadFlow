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

      // 设置 PRAGMA 配置
      await this.configurePragma();

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
   * 配置数据库 PRAGMA 设置
   */
  private async configurePragma(): Promise<void> {
    if (!this.db) return;

    // 【关键】busy_timeout 必须设置，多次重试
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.db.execAsync('PRAGMA busy_timeout = 10000;'); // 10秒超时
        console.log('✅ busy_timeout 已设置 (10s)');
        break;
      } catch (e) {
        if (attempt < 2) {
          console.warn(`⚠️ busy_timeout 设置失败，重试中... (${attempt + 1}/3)`);
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          console.warn('⚠️ busy_timeout 设置失败，使用默认值');
        }
      }
    }

    // 【可选】其他优化，失败不影响正常使用
    try {
      await this.db.execAsync('PRAGMA journal_mode = WAL;');
      await this.db.execAsync('PRAGMA synchronous = NORMAL;');
      await this.db.execAsync('PRAGMA cache_size = -10000;');
      console.log('✅ 数据库性能优化已应用');
    } catch (e) {
      console.warn('⚠️ 部分性能优化未应用');
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
      console.log('📁 开始数据库迁移...');
      
      // 获取 rss_sources 表信息
      let tableInfo: any[] = [];
      try {
        tableInfo = await this.db.getAllAsync('PRAGMA table_info(rss_sources)');
      } catch (e) {
        console.warn('Warning: Could not get rss_sources table info:', e);
        return;
      }

      // 逐个添加缺失的列,每个操作都有独立的 try-catch
      const columnsToAdd = [
        { name: 'content_type', sql: 'ALTER TABLE rss_sources ADD COLUMN content_type TEXT DEFAULT "image_text"' },
        { name: 'unread_count', sql: 'ALTER TABLE rss_sources ADD COLUMN unread_count INTEGER DEFAULT 0' },
        { name: 'error_count', sql: 'ALTER TABLE rss_sources ADD COLUMN error_count INTEGER DEFAULT 0' },
        { name: 'sort_order', sql: 'ALTER TABLE rss_sources ADD COLUMN sort_order INTEGER DEFAULT 0' },
        { name: 'source_mode', sql: 'ALTER TABLE rss_sources ADD COLUMN source_mode TEXT DEFAULT "direct"' },
        { name: 'group_id', sql: 'ALTER TABLE rss_sources ADD COLUMN group_id INTEGER' },
        { name: 'group_sort_order', sql: 'ALTER TABLE rss_sources ADD COLUMN group_sort_order INTEGER DEFAULT 0' },
        { name: 'max_articles', sql: 'ALTER TABLE rss_sources ADD COLUMN max_articles INTEGER DEFAULT 20' },
      ];

      for (const column of columnsToAdd) {
        const hasColumn = tableInfo.some((col: any) => col.name === column.name);
        if (!hasColumn) {
          try {
            console.log(`Adding ${column.name} column to rss_sources table...`);
            await this.db.execAsync(column.sql);
            console.log(`✅ ${column.name} column added successfully`);
          } catch (error) {
            console.warn(`⚠️ Could not add ${column.name} column:`, error);
          }
        }
      }

      // 处理 articles 表
      let articlesTableInfo: any[] = [];
      try {
        articlesTableInfo = await this.db.getAllAsync('PRAGMA table_info(articles)');
      } catch (e) {
        console.warn('Warning: Could not get articles table info:', e);
      }

      const articleColumnsToAdd = [
        { name: 'scroll_position', sql: 'ALTER TABLE articles ADD COLUMN scroll_position INTEGER DEFAULT 0' },
        { name: 'image_caption', sql: 'ALTER TABLE articles ADD COLUMN image_caption TEXT' },
        { name: 'image_credit', sql: 'ALTER TABLE articles ADD COLUMN image_credit TEXT' },
      ];

      for (const column of articleColumnsToAdd) {
        const hasColumn = articlesTableInfo.some((col: any) => col.name === column.name);
        if (!hasColumn) {
          try {
            console.log(`Adding ${column.name} column to articles table...`);
            await this.db.execAsync(column.sql);
            console.log(`✅ ${column.name} column added successfully`);
          } catch (error) {
            console.warn(`⚠️ Could not add ${column.name} column to articles:`, error);
          }
        }
      }

      // 处理 vocabulary 表
      let vocabularyTableInfo: any[] = [];
      try {
        vocabularyTableInfo = await this.db.getAllAsync('PRAGMA table_info(vocabulary)');
      } catch (e) {
        console.warn('Warning: Could not get vocabulary table info:', e);
      }

      const vocabColumnsToAdd = [
        { name: 'next_review_at', sql: 'ALTER TABLE vocabulary ADD COLUMN next_review_at INTEGER' },
        { name: 'last_reviewed_at', sql: 'ALTER TABLE vocabulary ADD COLUMN last_reviewed_at INTEGER' },
        { name: 'context', sql: 'ALTER TABLE vocabulary ADD COLUMN context TEXT' },
        { name: 'article_id', sql: 'ALTER TABLE vocabulary ADD COLUMN article_id INTEGER' },
        { name: 'correct_count', sql: 'ALTER TABLE vocabulary ADD COLUMN correct_count INTEGER DEFAULT 0' },
        { name: 'difficulty', sql: 'ALTER TABLE vocabulary ADD COLUMN difficulty TEXT DEFAULT "medium"' },
        { name: 'notes', sql: 'ALTER TABLE vocabulary ADD COLUMN notes TEXT DEFAULT ""' },
      ];

      for (const column of vocabColumnsToAdd) {
        const hasColumn = vocabularyTableInfo.some((col: any) => col.name === column.name);
        if (!hasColumn) {
          try {
            console.log(`Adding ${column.name} column to vocabulary table...`);
            await this.db.execAsync(column.sql);
            console.log(`✅ ${column.name} column added successfully`);
          } catch (error) {
            console.warn(`⚠️ Could not add ${column.name} column to vocabulary:`, error);
          }
        }
      }

      // 清理无效数据
      try {
        console.log('Cleaning up invalid vocabulary entries...');
        await this.db.execAsync("DELETE FROM vocabulary WHERE id IS NULL OR id = ''");
        console.log('✅ Invalid vocabulary entries cleaned up');
      } catch (error) {
        console.warn('⚠️ Could not clean up vocabulary entries:', error);
      }

      console.log('✅ 数据库迁移完成');

      // 🔗 创建 group_id 索引(在迁移完成后)
      try {
        await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_rss_sources_group_id ON rss_sources(group_id)');
        console.log('✅ group_id 索引创建成功');
      } catch (error) {
        console.warn('⚠️ Could not create group_id index:', error);
      }
    } catch (error) {
      console.error('❌ 数据库迁移异常:', error);
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

      // 📁 RSS分组表
      `CREATE TABLE IF NOT EXISTS rss_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,

      // 🔥 过滤规则定义表 (支持全局/指定源)
      `CREATE TABLE IF NOT EXISTS filter_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL,
        is_regex INTEGER DEFAULT 0,
        mode TEXT DEFAULT 'exclude',
        scope TEXT DEFAULT 'specific',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // 🔗 规则与源的绑定表 (多对多)
      `CREATE TABLE IF NOT EXISTS filter_bindings (
        rule_id INTEGER,
        rss_source_id INTEGER,
        PRIMARY KEY (rule_id, rss_source_id),
        FOREIGN KEY(rule_id) REFERENCES filter_rules(id) ON DELETE CASCADE,
        FOREIGN KEY(rss_source_id) REFERENCES rss_sources(id) ON DELETE CASCADE
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
      'CREATE INDEX IF NOT EXISTS idx_rss_groups_sort_order ON rss_groups(sort_order)',
      'CREATE INDEX IF NOT EXISTS idx_filter_rules_scope ON filter_rules(scope)',
      'CREATE INDEX IF NOT EXISTS idx_filter_bindings_rule_id ON filter_bindings(rule_id)',
      'CREATE INDEX IF NOT EXISTS idx_filter_bindings_source_id ON filter_bindings(rss_source_id)',
      // 注意: idx_rss_sources_group_id 移动到 migrateDatabase() 中创建,
      // 因为 group_id 列是通过迁移添加的,此时可能不存在
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

  // =================== 过滤规则管理 ===================

  /**
   * 🔥 获取某源生效的所有规则 (全局 + 绑定给该源的规则)
   */
  public async getEffectiveRules(sourceId: number): Promise<any[]> {
    await this.ensureInitialized();
    
    const sql = `
      SELECT * FROM filter_rules 
      WHERE scope = 'global' 
      OR id IN (
        SELECT rule_id FROM filter_bindings WHERE rss_source_id = ?
      )
      ORDER BY id DESC
    `;
    
    return await this.executeQuery(sql, [sourceId]);
  }

  /**
   * 获取所有规则 (用于管理界面)
   */
  public async getAllRules(): Promise<any[]> {
    await this.ensureInitialized();
    return await this.executeQuery('SELECT * FROM filter_rules ORDER BY id DESC');
  }

  /**
   * 获取规则的绑定源列表
   */
  public async getRuleBindings(ruleId: number): Promise<number[]> {
    await this.ensureInitialized();
    const results = await this.executeQuery(
      'SELECT rss_source_id FROM filter_bindings WHERE rule_id = ?',
      [ruleId]
    );
    return results.map((row: any) => row.rss_source_id);
  }

  /**
   * 新增规则 (带绑定逻辑)
   */
  public async createRule(
    keyword: string,
    isRegex: boolean,
    mode: 'include' | 'exclude',
    scope: 'global' | 'specific',
    targetSourceIds: number[] = []
  ): Promise<number> {
    await this.ensureInitialized();

    if (!this.db) {
      throw new Error('Database not available');
    }

    try {
      // 1. 插入规则
      const result = await this.executeInsert(
        'INSERT INTO filter_rules (keyword, is_regex, mode, scope) VALUES (?, ?, ?, ?)',
        [keyword, isRegex ? 1 : 0, mode, scope]
      );
      
      const ruleId = result.insertId;

      // 2. 如果是特定源，插入绑定关系
      if (scope === 'specific' && targetSourceIds.length > 0) {
        for (const sourceId of targetSourceIds) {
          await this.executeStatement(
            'INSERT INTO filter_bindings (rule_id, rss_source_id) VALUES (?, ?)',
            [ruleId, sourceId]
          );
        }
      }

      console.log(`✅ 规则创建成功: ID=${ruleId}, scope=${scope}, 绑定源数=${targetSourceIds.length}`);
      return ruleId;
    } catch (error) {
      console.error('Error creating rule:', error);
      throw error;
    }
  }

  /**
   * 删除规则 (bindings 会自动级联删除)
   */
  public async deleteRule(ruleId: number): Promise<void> {
    await this.ensureInitialized();
    await this.executeStatement('DELETE FROM filter_rules WHERE id = ?', [ruleId]);
    console.log(`✅ 规则已删除: ID=${ruleId}`);
  }

  /**
   * 更新规则
   */
  public async updateRule(
    ruleId: number,
    keyword: string,
    isRegex: boolean,
    mode: 'include' | 'exclude',
    scope: 'global' | 'specific',
    targetSourceIds: number[] = []
  ): Promise<void> {
    await this.ensureInitialized();

    try {
      // 1. 更新规则
      await this.executeStatement(
        'UPDATE filter_rules SET keyword = ?, is_regex = ?, mode = ?, scope = ? WHERE id = ?',
        [keyword, isRegex ? 1 : 0, mode, scope, ruleId]
      );

      // 2. 删除旧的绑定
      await this.executeStatement('DELETE FROM filter_bindings WHERE rule_id = ?', [ruleId]);

      // 3. 重新绑定
      if (scope === 'specific' && targetSourceIds.length > 0) {
        for (const sourceId of targetSourceIds) {
          await this.executeStatement(
            'INSERT INTO filter_bindings (rule_id, rss_source_id) VALUES (?, ?)',
            [ruleId, sourceId]
          );
        }
      }

      console.log(`✅ 规则更新成功: ID=${ruleId}`);
    } catch (error) {
      console.error('Error updating rule:', error);
      throw error;
    }
  }
}

// 导出单例实例
export const databaseService = DatabaseService.getInstance();