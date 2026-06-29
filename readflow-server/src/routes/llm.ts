import express from 'express';
import { llmGatewayService, RateLimitError } from '../services/LLMGatewayService';
import { ValidationError, validateString } from '../utils/validation';

const router = express.Router();

router.post('/dict', async (req, res) => {
  try {
    const userId = (req as any).user?.id || 'unknown';
    const word = validateString(req.body?.word, 'word', { required: true, maxLength: 200 });
    const context = req.body?.context !== undefined
      ? validateString(req.body.context, 'context', { maxLength: 5000 })
      : undefined;

    const r = await llmGatewayService.dictionary(userId, word, context);
    const parsed = llmGatewayService.parseDictionaryJson(r.text);
    res.json({ result: parsed, cacheKey: r.cacheKey, modelVersion: r.modelVersion });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    const msg = (error as Error).message || 'Unknown error';
    if (error instanceof RateLimitError || msg === 'Rate limit exceeded') return res.status(429).json({ error: msg });
    res.status(500).json({ error: msg });
  }
});

router.post('/translate', async (req, res) => {
  try {
    const userId = (req as any).user?.id || 'unknown';
    const text = validateString(req.body?.text, 'text', { required: true, maxLength: 20000 });
    const sourceLang = validateString(req.body?.sourceLang, 'sourceLang', { maxLength: 20, defaultValue: 'en' });
    const targetLang = validateString(req.body?.targetLang, 'targetLang', { maxLength: 20, defaultValue: 'zh' });
    const style = req.body?.style !== undefined
      ? validateString(req.body.style, 'style', { maxLength: 200 })
      : undefined;

    const r = await llmGatewayService.translate(userId, text, sourceLang, targetLang, style);
    res.json({ translatedText: r.text.trim(), cacheKey: r.cacheKey, modelVersion: r.modelVersion });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    const msg = (error as Error).message || 'Unknown error';
    if (error instanceof RateLimitError || msg === 'Rate limit exceeded') return res.status(429).json({ error: msg });
    res.status(500).json({ error: msg });
  }
});

router.post('/title-translate', async (req, res) => {
  try {
    const userId = (req as any).user?.id || 'unknown';
    const title = validateString(req.body?.title, 'title', { required: true, maxLength: 1000 });
    const sourceLang = validateString(req.body?.sourceLang, 'sourceLang', { maxLength: 20, defaultValue: 'en' });
    const targetLang = validateString(req.body?.targetLang, 'targetLang', { maxLength: 20, defaultValue: 'zh' });

    const r = await llmGatewayService.titleTranslate(userId, title, sourceLang, targetLang);
    res.json({ translatedTitle: r.text.trim(), cacheKey: r.cacheKey, modelVersion: r.modelVersion });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    const msg = (error as Error).message || 'Unknown error';
    if (error instanceof RateLimitError || msg === 'Rate limit exceeded') return res.status(429).json({ error: msg });
    res.status(500).json({ error: msg });
  }
});

export default router;
