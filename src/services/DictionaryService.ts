import { DatabaseService } from '../database/DatabaseService';
import { WordDefinition, DictionaryCacheEntry } from '../types';
import { logger } from './rss/RSSUtils';
import { stripHtmlTags } from '../utils/stringUtils';
import { cloudConfigService } from './CloudConfigService';
import AuthService from './AuthService';
/**
 * 词典服务 - 使用LLM查询单词释义，并缓存到本地数据库
 * 支持词形识别（如 running -> run）
 */
export class DictionaryService {
  private static instance: DictionaryService;
  private databaseService: DatabaseService;

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
  }

  public static getInstance(): DictionaryService {
    if (!DictionaryService.instance) {
      DictionaryService.instance = new DictionaryService();
    }
    return DictionaryService.instance;
  }

  /**
   * 查询单词定义（优先本地缓存，后备LLM）
   */
  public async lookupWord(word: string, context?: string): Promise<WordDefinition | null> {
    try {
      const searchWord = word.toLowerCase().trim();
      
      // 1. 首先尝试从本地缓存查询
      const cachedResult = await this.getCachedDefinition(searchWord);
      if (cachedResult) {
        logger.info(`✅ 从缓存获取单词: ${searchWord}`);
        return cachedResult;
      }

      // 2. 本地缓存没有，调用服务端查询
      logger.info(`🔍 调用服务端查询单词: ${searchWord}`);
      const llmResult = await this.queryLLM(searchWord, context);
      
      if (llmResult) {
        // 3. 将LLM结果存入本地缓存
        await this.cacheDefinition(llmResult);
        
        // 4. 如果有原始单词且与当前词不同，也缓存原始单词
        if (llmResult.baseWord && llmResult.baseWord !== searchWord) {
          await this.cacheBaseWord(llmResult);
        }
        
        return llmResult;
      }

      return null;
    } catch (error) {
      logger.error('Error looking up word:', error);
      throw new Error(`Failed to lookup word: ${word}`);
    }
  }

  /**
   * 从本地缓存获取单词定义
   */
  private async getCachedDefinition(word: string): Promise<WordDefinition | null> {
    try {
      const results = await this.databaseService.executeQuery(
        'SELECT * FROM dictionary_cache WHERE word = ? LIMIT 1',
        [word]
      );

      if (results.length > 0) {
        return this.mapCacheRowToDefinition(results[0]);
      }

      return null;
    } catch (error) {
      logger.error('Error getting cached definition:', error);
      return null;
    }
  }

  /**
   * 缓存单词定义
   */
  private async cacheDefinition(definition: WordDefinition): Promise<void> {
    try {
      // 【优化】统一使用 ISO 字符串，与 VocabularyService 保持一致
      const now = new Date().toISOString(); 
      
      // 【优化】入库前清理 HTML 标签
      const cleanDefinition = this.cleanDefinitionHtml(definition);
      
      const definitionsJson = JSON.stringify({
        definitions: cleanDefinition.definitions,
        baseWordDefinitions: cleanDefinition.baseWordDefinitions
      });

      // 检查是否已存在
      const existing = await this.databaseService.executeQuery(
        'SELECT id FROM dictionary_cache WHERE word = ?',
        [cleanDefinition.word]
      );

      if (existing.length > 0) {
        // 更新现有记录
        await this.databaseService.executeStatement(
          `UPDATE dictionary_cache SET 
           base_word = ?, word_form = ?, phonetic = ?, definitions = ?, updated_at = ?
           WHERE word = ?`,
          [cleanDefinition.baseWord || null, cleanDefinition.wordForm || null, cleanDefinition.phonetic || null, definitionsJson, now, cleanDefinition.word]
        );
      } else {
        // 插入新记录
        await this.databaseService.executeStatement(
          `INSERT INTO dictionary_cache (word, base_word, word_form, phonetic, definitions, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [cleanDefinition.word, cleanDefinition.baseWord || null, cleanDefinition.wordForm || null, cleanDefinition.phonetic || null, definitionsJson, 'llm', now, now]
        );
      }
      
      logger.info(`💾 已缓存单词: ${cleanDefinition.word}`);
    } catch (error) {
      logger.error('Error caching definition:', error);
    }
  }
  /**
   * 缓存原始单词（当查询的是变形词时）
   */
  private async cacheBaseWord(definition: WordDefinition): Promise<void> {
    if (!definition.baseWord || !definition.baseWordDefinitions) return;

    try {
      const baseWord = definition.baseWord.toLowerCase();
      
      // 检查原始单词是否已缓存
      const existing = await this.databaseService.executeQuery(
        'SELECT id FROM dictionary_cache WHERE word = ?',
        [baseWord]
      );

      if (existing.length === 0) {
        // 【优化】统一使用 ISO 字符串，与 VocabularyService 保持一致
        const now = new Date().toISOString();
        const cleanDefinition = this.cleanDefinitionHtml(definition);
        const definitionsJson = JSON.stringify({
          definitions: cleanDefinition.baseWordDefinitions
        });

        await this.databaseService.executeStatement(
          `INSERT INTO dictionary_cache (word, base_word, word_form, phonetic, definitions, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [baseWord, null, null, cleanDefinition.phonetic || null, definitionsJson, 'llm', now, now]
        );
        
        logger.info(`💾 已缓存原始单词: ${baseWord}`);
      }
    } catch (error) {
      logger.error('Error caching base word:', error);
    }
  }

  // 【新增】递归清理定义中的 HTML
  private cleanDefinitionHtml(def: WordDefinition): WordDefinition {
    const clean = (str?: string) => str ? stripHtmlTags(str) : str;
  
    return {
      ...def,
      // 清理直接属性
      word: clean(def.word) || '',
      context: clean(def.context),
    
      // 清理定义数组
      definitions: (def.definitions || []).map(d => ({
        ...d,
        definition: clean(d.definition) || '',
        translation: clean(d.translation),
        example: clean(d.example)
      })),
    
      // 清理原形定义
      baseWordDefinitions: (def.baseWordDefinitions || []).map(d => ({
        ...d,
        definition: clean(d.definition) || '',
        translation: clean(d.translation)
      }))
    };
  }

  /**
   * 调用LLM查询单词
   */
  private async queryLLM(word: string, context?: string): Promise<WordDefinition | null> {
    try {
      const config = await cloudConfigService.getConfig();
      if (!config.serverUrl) return null;
      const serverUrl = config.serverUrl.replace(/\/$/, '');

      const token = AuthService.getAuthToken() || config.auth?.accessToken;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (config.serverAccessKey) {
        headers['x-server-token'] = config.serverAccessKey;
        headers['x-server-access-key'] = config.serverAccessKey;
      }

      const resp = await fetch(`${serverUrl}/api/llm/dict`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ word, context }),
      });

      if (!resp.ok) return null;
      const data = await resp.json().catch(() => null);
      const result = data?.result;
      if (!result || typeof result !== 'object') return null;

      const modelVersion = typeof data?.modelVersion === 'string' ? data.modelVersion : '';
      const sep = modelVersion.indexOf(':');
      const provider = sep >= 0 ? modelVersion.slice(0, sep) : 'server';
      const model = sep >= 0 ? modelVersion.slice(sep + 1) : modelVersion;
      await this.logUsage('dictionary', provider, model || 'unknown');

      return {
        word: result.word || word,
        baseWord: result.baseWord || undefined,
        wordForm: result.wordForm || undefined,
        phonetic: result.phonetic || undefined,
        definitions: Array.isArray(result.definitions) ? result.definitions : [],
        baseWordDefinitions: Array.isArray(result.baseWordDefinitions) ? result.baseWordDefinitions : undefined,
        source: 'llm',
      };
    } catch (error) {
      logger.error('Error querying LLM:', error);
      await this.logUsage('dictionary', 'server', 'unknown', false);
      return null;
    }
  }

  /**
   * 将缓存行映射为WordDefinition
   */
  public mapCacheRowToDefinition(row: any): WordDefinition {
    const parsedDefinitions = JSON.parse(row.definitions);
    
    return {
      word: row.word,
      baseWord: row.base_word || undefined,
      wordForm: row.word_form || undefined,
      phonetic: row.phonetic || undefined,
      definitions: parsedDefinitions.definitions || [],
      baseWordDefinitions: parsedDefinitions.baseWordDefinitions || undefined,
      source: 'cache',
    };
  }

  /**
   * 获取单词建议（从缓存中搜索）
   */
  public async getSuggestions(prefix: string, limit: number = 10): Promise<string[]> {
    try {
      const searchPrefix = prefix.toLowerCase().trim();
      
      if (searchPrefix.length < 2) {
        return [];
      }
      
      const results = await this.databaseService.executeQuery(
        'SELECT DISTINCT word FROM dictionary_cache WHERE word LIKE ? ORDER BY LENGTH(word) LIMIT ?',
        [`${searchPrefix}%`, limit]
      );
      
      return results.map(row => row.word);
    } catch (error) {
      logger.error('Error getting suggestions:', error);
      return [];
    }
  }

  /**
   * 检查单词是否已缓存
   */
  public async wordExists(word: string): Promise<boolean> {
    try {
      const results = await this.databaseService.executeQuery(
        'SELECT 1 FROM dictionary_cache WHERE word = ? LIMIT 1',
        [word.toLowerCase().trim()]
      );
      return results.length > 0;
    } catch (error) {
      logger.error('Error checking word existence:', error);
      return false;
    }
  }

  /**
   * 获取缓存统计信息
   */
  public async getCacheStats(): Promise<{ totalWords: number; lastUpdated?: Date }> {
    try {
      const countResult = await this.databaseService.executeQuery(
        'SELECT COUNT(*) as count FROM dictionary_cache'
      );
      
      const lastResult = await this.databaseService.executeQuery(
        'SELECT MAX(updated_at) as last_updated FROM dictionary_cache'
      );
      
      return {
        totalWords: countResult[0]?.count || 0,
        lastUpdated: lastResult[0]?.last_updated ? new Date(lastResult[0].last_updated) : undefined,
      };
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      return { totalWords: 0 };
    }
  }

  /**
   * 记录LLM使用统计
   * 【优化】统一使用 ISO 字符串时间格式
   */
  private async logUsage(
    requestType: string,
    provider: string,
    model: string,
    success: boolean = true
  ): Promise<void> {
    try {
      // 【优化】统一使用 ISO 字符串格式，与其他时间字段保持一致
      const now = new Date().toISOString();
      await this.databaseService.executeStatement(
        `INSERT INTO llm_usage_stats (request_type, provider, model, success, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [requestType, provider, model, success ? 1 : 0, now]
      );
    } catch (error) {
      logger.error('Error logging usage:', error);
    }
  }

  /**
   * 清除所有缓存
   */
  public async clearCache(): Promise<void> {
    try {
      await this.databaseService.executeStatement('DELETE FROM dictionary_cache');
      logger.info('词典缓存已清除');
    } catch (error) {
      logger.error('Error clearing cache:', error);
    }
  }
}

// 导出单例实例
export const dictionaryService = DictionaryService.getInstance();
