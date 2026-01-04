import { DatabaseService } from '../database/DatabaseService';
import { SettingsService } from './SettingsService';
import { logger } from './rss/RSSUtils';

/**
 * 翻译缓存条目
 */
export interface TranslationCacheEntry {
  id?: number;
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  source: string;
  createdAt?: Date;
}

/**
 * 翻译服务 - 使用LLM翻译句子，并缓存到本地数据库
 */
export class TranslationService {
  private static instance: TranslationService;
  private databaseService: DatabaseService;
  private settingsService: SettingsService;

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
    this.settingsService = SettingsService.getInstance();
  }

  public static getInstance(): TranslationService {
    if (!TranslationService.instance) {
      TranslationService.instance = new TranslationService();
    }
    return TranslationService.instance;
  }

  /**
   * 翻译句子（优先本地缓存，后备LLM）
   */
  public async translateSentence(
    text: string,
    sourceLang: string = 'en',
    targetLang: string = 'zh'
  ): Promise<string | null> {
    try {
      const normalizedText = text.trim();
      
      // 1. 首先尝试从本地缓存查询
      const cachedResult = await this.getCachedTranslation(normalizedText, sourceLang, targetLang);
      if (cachedResult) {
        logger.info(`✅ 从缓存获取翻译: ${normalizedText.substring(0, 50)}...`);
        return cachedResult.translatedText;
      }

      // 2. 本地缓存没有，调用LLM翻译
      logger.info(`🔍 调用LLM翻译: ${normalizedText.substring(0, 50)}...`);
      const translation = await this.translateWithLLM(normalizedText, sourceLang, targetLang);
      
      if (translation) {
        // 3. 将LLM结果存入本地缓存
        await this.cacheTranslation({
          originalText: normalizedText,
          translatedText: translation,
          sourceLang,
          targetLang,
          source: 'llm',
        });
        
        return translation;
      }

      return null;
    } catch (error) {
      logger.error('Error translating sentence:', error);
      return null;
    }
  }


  /**
   * 从本地缓存获取翻译
   */
  private async getCachedTranslation(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<TranslationCacheEntry | null> {
    try {
      const results = await this.databaseService.executeQuery(
        'SELECT * FROM translation_cache WHERE original_text = ? AND source_lang = ? AND target_lang = ? LIMIT 1',
        [text, sourceLang, targetLang]
      );

      if (results.length > 0) {
        const row = results[0];
        return {
          id: row.id,
          originalText: row.original_text,
          translatedText: row.translated_text,
          sourceLang: row.source_lang,
          targetLang: row.target_lang,
          source: row.source,
          createdAt: row.created_at ? new Date(row.created_at) : undefined,
        };
      }

      return null;
    } catch (error) {
      logger.error('Error getting cached translation:', error);
      return null;
    }
  }

  /**
   * 缓存翻译结果
   */
  private async cacheTranslation(entry: TranslationCacheEntry): Promise<void> {
    try {
      const now = new Date().toISOString();

      await this.databaseService.executeStatement(
        `INSERT INTO translation_cache (original_text, translated_text, source_lang, target_lang, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [entry.originalText, entry.translatedText, entry.sourceLang, entry.targetLang, entry.source, now]
      );
      
      logger.info(`💾 已缓存翻译: ${entry.originalText.substring(0, 50)}...`);
    } catch (error) {
      logger.error('Error caching translation:', error);
    }
  }

  /**
   * 调用LLM翻译
   */
  private async translateWithLLM(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<string | null> {
    try {
      const llmSettings = await this.settingsService.getLLMSettingsFor('translation');
      
      if (!llmSettings?.apiKey) {
        logger.warn('LLM API key not configured');
        return null;
      }

      const prompt = this.buildTranslationPrompt(text, sourceLang, targetLang);
      
      // 调用LLM API
      const response = await this.callLLMAPI(llmSettings, prompt);
      
      if (response) {
        // 记录使用统计
        await this.logUsage('translation', llmSettings.provider, llmSettings.model);
        return response.trim();
      }

      return null;
    } catch (error) {
      logger.error('Error translating with LLM:', error);
      // 记录失败统计
      const llmSettings = await this.settingsService.getLLMSettingsFor('translation');
      if (llmSettings) {
        await this.logUsage('translation', llmSettings.provider, llmSettings.model, false);
      }
      return null;
    }
  }


  /**
   * 构建翻译提示词
   */
  private buildTranslationPrompt(text: string, sourceLang: string, targetLang: string): string {
    const langMap: { [key: string]: string } = {
      'en': '英语',
      'zh': '中文',
      'ja': '日语',
      'ko': '韩语',
      'fr': '法语',
      'de': '德语',
      'es': '西班牙语',
    };

    const sourceLangName = langMap[sourceLang] || sourceLang;
    const targetLangName = langMap[targetLang] || targetLang;

    return `请将以下${sourceLangName}文本翻译成${targetLangName}。只需要返回翻译结果，不要包含任何解释或说明。

原文：${text}

翻译：`;
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
        // OpenAI 兼容格式
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
    // 确保baseUrl格式正确，移除末尾斜杠
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    
    logger.info('🔍 调用LLM翻译:' + prompt.substring(0, 50) + '...');
    logger.info('🎯 API地址:' + `${cleanBaseUrl}/chat/completions`);
    logger.info('🤖 模型:' + model);
    
    const response = await fetch(`${cleanBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是一个专业的翻译助手。' },
          { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      logger.error('❌ API请求失败:', response.status, errorText);
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content || null;
    logger.info('✅ 翻译结果:' + result?.substring(0, 50) + '...');
    return result;
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
   * 记录LLM使用统计
   */
  private async logUsage(
    requestType: string,
    provider: string,
    model: string,
    success: boolean = true
  ): Promise<void> {
    try {
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
   * 获取使用统计
   */
  public async getUsageStats(): Promise<{
    total: number;
    monthly: number;
    byType: { [key: string]: number };
  }> {
    try {
      // 确保数据库已初始化
      await this.databaseService.initializeDatabase();
      
      // 总请求数
      const totalResult = await this.databaseService.executeQuery(
        'SELECT COUNT(*) as count FROM llm_usage_stats WHERE success = 1'
      ).catch(() => [{ count: 0 }]);
      
      // 本月请求数
      const startOfMonth = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);
      const monthlyResult = await this.databaseService.executeQuery(
        'SELECT COUNT(*) as count FROM llm_usage_stats WHERE success = 1 AND created_at >= ?',
        [startOfMonth]
      ).catch(() => [{ count: 0 }]);
      
      // 按类型统计
      const byTypeResult = await this.databaseService.executeQuery(
        'SELECT request_type, COUNT(*) as count FROM llm_usage_stats WHERE success = 1 GROUP BY request_type'
      ).catch(() => []);
      
      const byType: { [key: string]: number } = {};
      byTypeResult.forEach((row: any) => {
        byType[row.request_type] = row.count;
      });
      
      return {
        total: totalResult[0]?.count || 0,
        monthly: monthlyResult[0]?.count || 0,
        byType,
      };
    } catch (error) {
      logger.error('Error getting usage stats:', error);
      return { total: 0, monthly: 0, byType: {} };
    }
  }

  /**
   * 获取翻译历史
   */
  public async getTranslationHistory(limit: number = 50): Promise<TranslationCacheEntry[]> {
    try {
      // 确保数据库已初始化
      await this.databaseService.initializeDatabase();
      
      const results = await this.databaseService.executeQuery(
        'SELECT * FROM translation_cache ORDER BY created_at DESC LIMIT ?',
        [limit]
      ).catch(() => []);

      return results.map((row: any) => ({
        id: row.id,
        originalText: row.original_text,
        translatedText: row.translated_text,
        sourceLang: row.source_lang,
        targetLang: row.target_lang,
        source: row.source,
        createdAt: row.created_at ? new Date(row.created_at * 1000) : undefined,
      }));
    } catch (error) {
      logger.error('Error getting translation history:', error);
      return [];
    }
  }

  /**
   * 清除翻译缓存
   */
  public async clearCache(): Promise<void> {
    try {
      await this.databaseService.executeStatement('DELETE FROM translation_cache');
      logger.info('翻译缓存已清除');
    } catch (error) {
      logger.error('Error clearing translation cache:', error);
    }
  }

}

// 导出单例实例
export const translationService = TranslationService.getInstance();
