import { DatabaseService } from '../database/DatabaseService';
import { LocalDictionaryEntry, WordDefinition, AppError } from '../types';

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
   * 查询单词定义（优先本地词典，后备LLM）
   */
  public async lookupWord(word: string, context?: string): Promise<WordDefinition | null> {
    try {
      // 1. 首先尝试本地词典查询
      const localResult = await this.searchLocal(word);
      
      if (localResult.length > 0) {
        return this.formatLocalResult(localResult[0]);
      }

      // 2. 尝试词形变化查询
      const stemResult = await this.searchByStem(word);
      if (stemResult.length > 0) {
        return this.formatLocalResult(stemResult[0]);
      }

      // 3. 如果本地词典没有找到，返回null（后续可以集成LLM查询）
      console.log(`Word '${word}' not found in local dictionary`);
      return null;
      
    } catch (error) {
      console.error('Error looking up word:', error);
      throw new AppError({
        code: 'DICTIONARY_LOOKUP_ERROR',
        message: `Failed to lookup word: ${word}`,
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 本地词典搜索
   */
  public async searchLocal(word: string): Promise<LocalDictionaryEntry[]> {
    try {
      const searchWord = word.toLowerCase().trim();
      
      // 精确匹配查询
      const exactMatch = await this.databaseService.queryDictionary(
        'SELECT * FROM stardict WHERE word = ? OR sw = ? LIMIT 1',
        [word, searchWord]
      );
      
      if (exactMatch.length > 0) {
        return exactMatch.map(this.mapDictionaryRow);
      }

      // 前缀匹配查询（用于自动完成）
      const prefixMatch = await this.databaseService.queryDictionary(
        'SELECT * FROM stardict WHERE sw LIKE ? LIMIT 10',
        [`${searchWord}%`]
      );
      
      return prefixMatch.map(this.mapDictionaryRow);
      
    } catch (error) {
      console.error('Error searching local dictionary:', error);
      return [];
    }
  }

  /**
   * 通过词干搜索（处理词形变化）
   */
  private async searchByStem(word: string): Promise<LocalDictionaryEntry[]> {
    try {
      const searchWord = word.toLowerCase().trim();
      
      // 查找包含该词形变化的词条
      const stemResults = await this.databaseService.queryDictionary(
        'SELECT * FROM stardict WHERE exchange LIKE ? LIMIT 5',
        [`%${searchWord}%`]
      );
      
      // 过滤出真正匹配的词形变化
      const filteredResults = stemResults.filter(row => {
        if (!row.exchange) return false;
        
        const exchanges = row.exchange.split('/');
        return exchanges.some(exchange => {
          const parts = exchange.split(':');
          return parts.length > 1 && parts[1].split(',').includes(searchWord);
        });
      });
      
      return filteredResults.map(this.mapDictionaryRow);
      
    } catch (error) {
      console.error('Error searching by stem:', error);
      return [];
    }
  }

  /**
   * 获取单词建议（自动完成）
   */
  public async getSuggestions(prefix: string, limit: number = 10): Promise<string[]> {
    try {
      const searchPrefix = prefix.toLowerCase().trim();
      
      if (searchPrefix.length < 2) {
        return [];
      }
      
      const results = await this.databaseService.queryDictionary(
        'SELECT word FROM stardict WHERE sw LIKE ? ORDER BY LENGTH(word) LIMIT ?',
        [`${searchPrefix}%`, limit]
      );
      
      return results.map(row => row.word);
      
    } catch (error) {
      console.error('Error getting suggestions:', error);
      return [];
    }
  }

  /**
   * 批量查询单词
   */
  public async batchLookup(words: string[]): Promise<Map<string, WordDefinition | null>> {
    const results = new Map<string, WordDefinition | null>();
    
    // 并发查询，但限制并发数量
    const batchSize = 5;
    for (let i = 0; i < words.length; i += batchSize) {
      const batch = words.slice(i, i + batchSize);
      const promises = batch.map(async word => {
        const definition = await this.lookupWord(word);
        return { word, definition };
      });
      
      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ word, definition }) => {
        results.set(word, definition);
      });
    }
    
    return results;
  }

  /**
   * 检查单词是否存在于词典中
   */
  public async wordExists(word: string): Promise<boolean> {
    try {
      const results = await this.searchLocal(word);
      return results.length > 0;
    } catch (error) {
      console.error('Error checking word existence:', error);
      return false;
    }
  }

  /**
   * 获取词典统计信息
   */
  public async getDictionaryStats(): Promise<{ totalWords: number; lastUpdated?: Date }> {
    try {
      const countResult = await this.databaseService.queryDictionary(
        'SELECT COUNT(*) as count FROM stardict'
      );
      
      return {
        totalWords: countResult[0]?.count || 0,
        lastUpdated: undefined, // 可以从数据库元信息获取
      };
    } catch (error) {
      console.error('Error getting dictionary stats:', error);
      return { totalWords: 0 };
    }
  }

  /**
   * 映射数据库行到LocalDictionaryEntry
   */
  private mapDictionaryRow(row: any): LocalDictionaryEntry {
    return {
      id: row.id,
      word: row.word,
      sw: row.sw,
      phonetic: row.phonetic,
      definition: row.definition,
      translation: row.translation,
      pos: row.pos,
      exchange: row.exchange,
    };
  }

  /**
   * 格式化本地查询结果为WordDefinition
   */
  private formatLocalResult(entry: LocalDictionaryEntry): WordDefinition {
    const definitions = [];
    
    // 解析词性和释义
    if (entry.definition || entry.translation) {
      definitions.push({
        partOfSpeech: entry.pos || 'unknown',
        definition: entry.definition || '',
        translation: entry.translation,
        example: undefined,
        synonyms: undefined,
      });
    }
    
    return {
      word: entry.word,
      phonetic: entry.phonetic,
      definitions,
      source: 'local',
    };
  }

  /**
   * 解析词形变化信息
   */
  private parseExchange(exchange: string): { [key: string]: string[] } {
    const result: { [key: string]: string[] } = {};
    
    if (!exchange) return result;
    
    const parts = exchange.split('/');
    parts.forEach(part => {
      const [type, forms] = part.split(':');
      if (type && forms) {
        result[type] = forms.split(',');
      }
    });
    
    return result;
  }

  /**
   * 获取单词的词形变化
   */
  public async getWordForms(word: string): Promise<{ [key: string]: string[] }> {
    try {
      const results = await this.searchLocal(word);
      if (results.length > 0 && results[0].exchange) {
        return this.parseExchange(results[0].exchange);
      }
      return {};
    } catch (error) {
      console.error('Error getting word forms:', error);
      return {};
    }
  }
}

// 导出单例实例
export const dictionaryService = DictionaryService.getInstance();