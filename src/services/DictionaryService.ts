import { DatabaseService } from '../database/DatabaseService';
import { WordDefinition, DictionaryCacheEntry } from '../types';
import { SettingsService } from './SettingsService';
import { logger } from './rss/RSSUtils';
import { stripHtmlTags } from '../utils/stringUtils';
/**
 * 词典服务 - 使用LLM查询单词释义，并缓存到本地数据库
 * 支持词形识别（如 running -> run）
 */
export class DictionaryService {
  private static instance: DictionaryService;
  private databaseService: DatabaseService;
  private settingsService: SettingsService;

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
    this.settingsService = SettingsService.getInstance();
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

      // 2. 本地缓存没有，调用LLM查询
      logger.info(`🔍 调用LLM查询单词: ${searchWord}`);
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
      const llmSettings = await this.settingsService.getLLMSettings();
      
      if (!llmSettings?.apiKey) {
        logger.warn('LLM API key not configured');
        return null;
      }

      const prompt = this.buildPrompt(word, context);
      
      // 根据提供商构建请求
      const response = await this.callLLMAPI(llmSettings, prompt);
      
      if (response) {
        // 记录使用统计
        await this.logUsage('dictionary', llmSettings.provider, llmSettings.model);
        return this.parseLLMResponse(response, word);
      }

      return null;
    } catch (error) {
      logger.error('Error querying LLM:', error);
      // 记录失败统计
      const llmSettings = await this.settingsService.getLLMSettings();
      if (llmSettings) {
        await this.logUsage('dictionary', llmSettings.provider, llmSettings.model, false);
      }
      return null;
    }
  }

  /**
   * 构建查询提示词
   */
  private buildPrompt(word: string, context?: string): string {
    let prompt = `请分析英语单词 “${word}”`;
    
    if (context) {
      prompt += `，它在以下句子中出现：“${context}”`;
    }
    
    prompt += `

请用JSON格式返回，包含以下字段：
{
  "word": "当前单词",
  "baseWord": "原始形式（如果当前是变形词，否则为null）",
  "wordForm": "词形说明（如'过去式','现在分词','复数'等，如果是原形则为null）",
  "phonetic": "音标",
  "definitions": [
    {
      "partOfSpeech": "词性",
      "definition": "英文释义",
      "translation": "中文翻译",
      "example": "例句"
    }
  ],
  "baseWordDefinitions": [
    {
      "partOfSpeech": "词性",
      "definition": "原始单词的英文释义",
      "translation": "中文翻译"
    }
  ]
}

注意：
1. 如果单词是变形词（如 running, went, dogs），请提供原始单词（run, go, dog）及其释义
2. 如果单词已经是原形，baseWord和wordForm为null，baseWordDefinitions为空数组
3. 【重要】仅返回JSON，不要其他说明文字`;

    return prompt;
  }

  /**
   * 调用LLM API
   */
  private async callLLMAPI(settings: any, prompt: string): Promise<string | null> {
    try {
      const { provider, apiKey, baseUrl, model, customModelName, temperature, maxTokens } = settings;
      
      let apiEndpoint = baseUrl || 'https://api.openai.com/v1';
      let actualModel = customModelName || model || 'gpt-3.5-turbo';
      
      // 根据提供商调整请求格式
      if (provider === 'anthropic') {
        return await this.callAnthropicAPI(apiEndpoint, apiKey, actualModel, prompt, temperature, maxTokens);
      } else {
        // OpenAI 兼容格式（包括OpenAI、本地模型、自定义API）
        return await this.callOpenAICompatibleAPI(apiEndpoint, apiKey, actualModel, prompt, temperature, maxTokens);
      }
    } catch (error) {
      logger.error('Error calling LLM API:', error);
      return null;
    }
  }

  /**
   * 调用OpenAI兼容API
   */
  private async callOpenAICompatibleAPI(
    baseUrl: string, 
    apiKey: string, 
    model: string, 
    prompt: string,
    temperature: number = 0.3,
    maxTokens: number = 1024
  ): Promise<string | null> {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是一个英语词典助手，专门帮助用户查询单词释义。请始终用JSON格式回复。' },
          { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  }

  /**
   * 调用Anthropic API
   */
  private async callAnthropicAPI(
    baseUrl: string,
    apiKey: string,
    model: string,
    prompt: string,
    temperature: number = 0.3,
    maxTokens: number = 1024
  ): Promise<string | null> {
    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature,
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || null;
  }

  /**
   * 解析LLM响应
   * 【优化】增强 JSON 解析容错性，支持 Markdown 代码块
   */
  private parseLLMResponse(response: string, originalWord: string): WordDefinition | null {
    try {
      // 1. 清理 Markdown 代码块标记（支持 ```json ... ``` 格式）
      let cleanJson = response
        .replace(/```json\s*/g, '') // 移除 ```json
        .replace(/```\s*/g, '')     // 移除 ```
        .trim();
    
      // 2. 尝试提取 JSON 对象（查找第一个 { 和最后一个 }）
      const firstBrace = cleanJson.indexOf('{');
      const lastBrace = cleanJson.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
      }
    
      // 3. 尝试解析 JSON
      const parsed = JSON.parse(cleanJson);
      
      // 4. 验证必要字段并构建返回对象
      return {
        word: parsed.word || originalWord,
        baseWord: parsed.baseWord || undefined,
        wordForm: parsed.wordForm || undefined,
        phonetic: parsed.phonetic || undefined,
        definitions: Array.isArray(parsed.definitions) ? parsed.definitions : [],
        baseWordDefinitions: Array.isArray(parsed.baseWordDefinitions) ? parsed.baseWordDefinitions : undefined,
        source: 'llm',
      };
    } catch (error) {
      logger.error('❌ Error parsing LLM response:', error);
      logger.error('   Response preview:', response.substring(0, 200));
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