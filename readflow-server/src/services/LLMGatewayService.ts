import fetch from 'node-fetch';
import { storageService, LLMFeature, LLMProfileConfig } from './StorageService';
import { decrypt } from '../utils/encryption';
import { logger } from '../utils/Logger';
import { simpleHash } from '../utils/RSSUtils';
import crypto from 'crypto';
import pLimit from 'p-limit';

type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
};

type AnthropicResponse = {
  content?: Array<{ text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export class RateLimitError extends Error {
  public readonly code = 'RATE_LIMIT';
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

class UpstreamError extends Error {
  public readonly code = 'UPSTREAM_ERROR';
  public readonly status: number;
  constructor(status: number, message?: string) {
    super(message || `Upstream error ${status}`);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

export class LLMGatewayService {
  private static instance: LLMGatewayService;
  private readonly cache = new Map<string, { expiresAt: number; value: { text: string; tokens?: number; tokensPrompt?: number; tokensCompletion?: number } }>();
  private readonly cacheTtlMs = 10 * 60 * 1000;
  private readonly cacheMaxEntries = 2000;
  private readonly rate = new Map<string, { windowStart: number; count: number }>();
  private readonly rateWindowMs = 60 * 1000;
  private readonly rateMaxPerWindow = 60;
  private readonly rateBurst = new Map<string, { windowStart: number; count: number }>();
  private readonly rateBurstWindowMs = 5 * 1000;
  private readonly rateBurstMaxPerWindow = 12;
  private readonly inFlight = new Map<string, number>();
  private readonly maxInFlightPerKey = 2;
  private readonly upstreamLimit = pLimit(8);

  public static getInstance(): LLMGatewayService {
    if (!LLMGatewayService.instance) {
      LLMGatewayService.instance = new LLMGatewayService();
    }
    return LLMGatewayService.instance;
  }

  public async dictionary(userId: string, word: string, context?: string) {
    return this.callFeature(userId, 'dictionary', this.buildDictionaryPrompt(word, context), { word, context });
  }

  public async translate(userId: string, text: string, sourceLang: string, targetLang: string, style?: string) {
    return this.callFeature(
      userId,
      'translation',
      this.buildTranslationPrompt(text, sourceLang, targetLang, style),
      { text, sourceLang, targetLang, style }
    );
  }

  public async titleTranslate(userId: string, title: string, sourceLang: string, targetLang: string) {
    return this.callFeature(
      userId,
      'titleTranslation',
      this.buildTitleTranslationPrompt(title, sourceLang, targetLang),
      { title, sourceLang, targetLang }
    );
  }

  public async dailyReport(userId: string, prompt: string, inputForCache: any) {
    return this.callFeature(userId, 'dailyReport', String(prompt || ''), inputForCache);
  }

  private getProfileForFeature(feature: LLMFeature): LLMProfileConfig {
    const settings = storageService.getSettings();
    const llm = settings.llm || {};
    const profiles = Array.isArray(llm.profiles) ? llm.profiles : [];
    const bindings = (llm.bindings && typeof llm.bindings === 'object') ? llm.bindings : {};

    const boundId = (bindings as any)[feature] || 'default';
    const found = profiles.find((p) => p && p.id === boundId) || profiles.find((p) => p && p.id === 'default');
    const fallback = found || profiles[0];
    if (!fallback) {
      throw new Error('LLM profiles not configured');
    }
    return fallback;
  }

  private async callFeature(userId: string, feature: LLMFeature, prompt: string, inputForCache: any) {
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();
    let profile: LLMProfileConfig | null = null;
    let cacheKey = '';
    let cacheHit = false;
    let status = 'ok';
    let httpStatus: number | undefined;
    let errorType: string | undefined;
    let errorMessage: string | undefined;
    let tokensTotal: number | undefined;
    let tokensPrompt: number | undefined;
    let tokensCompletion: number | undefined;

    try {
      this.enforceRateLimit(userId, feature);
      profile = this.getProfileForFeature(feature);
      const apiKey = profile.apiKeyEncrypted ? decrypt(profile.apiKeyEncrypted) : '';
      if (!apiKey) {
        throw new Error(`LLM apiKey not configured for profile: ${profile.id}`);
      }

      cacheKey = String(simpleHash(JSON.stringify({
        v: 2,
        feature,
        profileId: profile.id,
        provider: profile.provider,
        baseUrl: profile.baseUrl,
        model: profile.model,
        input: inputForCache,
      })));

      const cached = this.getCache(cacheKey);
      if (cached) {
        cacheHit = true;
        tokensTotal = cached.tokens;
        tokensPrompt = cached.tokensPrompt;
        tokensCompletion = cached.tokensCompletion;
        const durationMs = Date.now() - startedAt;
        logger.system(`[LLM] ok requestId=${requestId} user=${userId} feature=${feature} provider=${profile.provider} model=${profile.model} ms=${durationMs} cacheKey=${cacheKey} cache=hit`);
        return {
          cacheKey,
          modelVersion: `${profile.provider}:${profile.model}`,
          text: cached.text,
        };
      }

      this.acquireInFlight(userId, feature);
      const result = await this.upstreamLimit(() => {
        return this.callWithRetry(
          () => (profile!.provider === 'anthropic'
            ? this.callAnthropic(profile!, apiKey, prompt)
            : this.callOpenAICompatible(profile!, apiKey, prompt)
          ),
          1
        );
      }).finally(() => {
        this.releaseInFlight(userId, feature);
      });

      tokensTotal = result.tokens;
      tokensPrompt = result.tokensPrompt;
      tokensCompletion = result.tokensCompletion;

      this.setCache(cacheKey, result);
      const durationMs = Date.now() - startedAt;
      logger.system(`[LLM] ok requestId=${requestId} user=${userId} feature=${feature} provider=${profile.provider} model=${profile.model} ms=${durationMs} cacheKey=${cacheKey}${result.tokens ? ` tokens=${result.tokens}` : ''}`);

      return {
        cacheKey,
        modelVersion: `${profile.provider}:${profile.model}`,
        text: result.text,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const e = error as any;
      if (e instanceof RateLimitError) {
        status = 'rate_limited';
        errorType = 'rate_limited';
        errorMessage = e.message;
      } else if (e instanceof UpstreamError) {
        status = 'upstream_error';
        httpStatus = e.status;
        errorType = 'upstream_error';
        errorMessage = e.message;
      } else if (String(e?.name || '') === 'AbortError') {
        status = 'timeout';
        errorType = 'timeout';
        errorMessage = 'Upstream timeout';
      } else {
        status = 'error';
        errorType = 'error';
        errorMessage = (error as Error).message || 'Unknown error';
      }

      const provider = profile?.provider || 'unknown';
      const model = profile?.model || 'unknown';
      logger.warn(`[LLM] fail requestId=${requestId} user=${userId} feature=${feature} provider=${provider} model=${model} ms=${durationMs} cacheKey=${cacheKey || 'n/a'} errType=${errorType}${httpStatus ? ` http=${httpStatus}` : ''}`);
      throw error;
    } finally {
      const durationMs = Date.now() - startedAt;
      await storageService.recordLLMUsageEvent({
        userId,
        requestId,
        feature,
        status,
        provider: profile?.provider,
        model: profile?.model,
        profileId: profile?.id,
        cacheKey: cacheKey || undefined,
        cacheHit,
        durationMs,
        tokensTotal,
        tokensPrompt,
        tokensCompletion,
        httpStatus,
        errorType,
        errorMessage,
      });
    }
  }

  private getCache(cacheKey: string): { text: string; tokens?: number; tokensPrompt?: number; tokensCompletion?: number } | null {
    const hit = this.cache.get(cacheKey);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.cache.delete(cacheKey);
      return null;
    }
    this.cache.delete(cacheKey);
    this.cache.set(cacheKey, hit);
    return hit.value;
  }

  private setCache(cacheKey: string, value: { text: string; tokens?: number; tokensPrompt?: number; tokensCompletion?: number }) {
    this.cache.set(cacheKey, { expiresAt: Date.now() + this.cacheTtlMs, value });
    while (this.cache.size > this.cacheMaxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
    }
  }

  private enforceRateLimit(userId: string, feature: LLMFeature) {
    const now = Date.now();
    const key = `${userId}:${feature}`;
    const burst = this.rateBurst.get(key);
    if (!burst || now - burst.windowStart >= this.rateBurstWindowMs) {
      this.rateBurst.set(key, { windowStart: now, count: 1 });
    } else {
      burst.count += 1;
      if (burst.count > this.rateBurstMaxPerWindow) {
        throw new RateLimitError('Rate limit exceeded');
      }
    }
    const slot = this.rate.get(key);
    if (!slot || now - slot.windowStart >= this.rateWindowMs) {
      this.rate.set(key, { windowStart: now, count: 1 });
      return;
    }
    slot.count += 1;
    if (slot.count > this.rateMaxPerWindow) {
      throw new RateLimitError('Rate limit exceeded');
    }
  }

  private acquireInFlight(userId: string, feature: LLMFeature) {
    const key = `${userId}:${feature}`;
    const current = this.inFlight.get(key) || 0;
    if (current >= this.maxInFlightPerKey) {
      throw new RateLimitError('Rate limit exceeded');
    }
    this.inFlight.set(key, current + 1);
  }

  private releaseInFlight(userId: string, feature: LLMFeature) {
    const key = `${userId}:${feature}`;
    const current = this.inFlight.get(key) || 0;
    const next = current - 1;
    if (next <= 0) this.inFlight.delete(key);
    else this.inFlight.set(key, next);
  }

  private async callWithRetry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
    let attempt = 0;
    let lastErr: any = null;
    while (attempt <= maxRetries) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const e = err as any;
        const canRetry =
          (e instanceof UpstreamError && (e.status === 429 || e.status >= 500)) ||
          String(e?.name || '') === 'FetchError' ||
          String(e?.name || '') === 'AbortError';
        if (!canRetry || attempt >= maxRetries) break;
        const delayMs = 400 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
        await new Promise((r) => setTimeout(r, delayMs));
      }
      attempt += 1;
    }
    throw lastErr;
  }

  private normalizeOpenAIBaseUrl(baseUrl: string): string {
    const raw = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!raw) return raw;
    if (/\/v1(\/|$)/i.test(raw)) return raw;
    return `${raw}/v1`;
  }

  private async callOpenAICompatible(profile: LLMProfileConfig, apiKey: string, prompt: string): Promise<{ text: string; tokens?: number; tokensPrompt?: number; tokensCompletion?: number }> {
    const baseUrl = this.normalizeOpenAIBaseUrl(profile.baseUrl);
    const url = `${baseUrl}/chat/completions`;
    const temperature = typeof profile.temperature === 'number' ? profile.temperature : 0.3;
    const maxTokens = typeof profile.maxTokens === 'number' ? profile.maxTokens : 1024;
    const topP = typeof profile.topP === 'number' ? profile.topP : undefined;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: profile.model,
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature,
          max_tokens: maxTokens,
          top_p: topP,
        }),
        signal: controller.signal as any,
      } as any);

      if (!resp.ok) {
        throw new UpstreamError(resp.status);
      }
      const data = await resp.json() as OpenAIChatResponse;
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error('Empty LLM response');
      return {
        text: String(text),
        tokens: data.usage?.total_tokens,
        tokensPrompt: data.usage?.prompt_tokens,
        tokensCompletion: data.usage?.completion_tokens,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async callAnthropic(profile: LLMProfileConfig, apiKey: string, prompt: string): Promise<{ text: string; tokens?: number; tokensPrompt?: number; tokensCompletion?: number }> {
    const baseUrl = String(profile.baseUrl || '').trim().replace(/\/+$/, '');
    const url = `${baseUrl}/messages`;
    const temperature = typeof profile.temperature === 'number' ? profile.temperature : 0.3;
    const maxTokens = typeof profile.maxTokens === 'number' ? profile.maxTokens : 1024;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: profile.model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
          temperature,
        }),
        signal: controller.signal as any,
      } as any);

      if (!resp.ok) {
        throw new UpstreamError(resp.status);
      }
      const data = await resp.json() as AnthropicResponse;
      const text = data.content?.[0]?.text;
      if (!text) throw new Error('Empty LLM response');
      const tokensPrompt = data.usage?.input_tokens;
      const tokensCompletion = data.usage?.output_tokens;
      const tokens =
        typeof tokensPrompt === 'number' || typeof tokensCompletion === 'number'
          ? ((tokensPrompt || 0) + (tokensCompletion || 0))
          : undefined;
      return { text: String(text), tokens, tokensPrompt, tokensCompletion };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildTranslationPrompt(text: string, sourceLang: string, targetLang: string, style?: string): string {
    const normalizedText = String(text || '').trim();
    const styleHint = style ? `风格要求：${String(style).trim()}\n` : '';
    return `请将以下${sourceLang}文本翻译成${targetLang}。\n${styleHint}只需要返回翻译结果，不需要解释。\n\n原文：\n${normalizedText}\n\n翻译：`;
  }

  private buildTitleTranslationPrompt(title: string, sourceLang: string, targetLang: string): string {
    const normalized = String(title || '').trim();
    return `请将以下${sourceLang}标题翻译成${targetLang}。\n只需要返回翻译后的标题，不需要解释。\n\n标题：\n${normalized}\n\n翻译：`;
  }

  private buildDictionaryPrompt(word: string, context?: string): string {
    let prompt = `请分析英语单词 “${String(word)}”`;
    if (context) {
      prompt += `，它在以下句子中出现：“${String(context)}”`;
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

注意：只返回JSON，不要包含任何额外说明文字。`;
    return prompt;
  }

  public parseDictionaryJson(text: string): any {
    let cleaned = String(text || '').trim();
    cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      cleaned = cleaned.slice(start, end + 1);
    }
    return JSON.parse(cleaned);
  }
}

export const llmGatewayService = LLMGatewayService.getInstance();
