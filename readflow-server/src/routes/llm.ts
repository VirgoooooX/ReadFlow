import express from 'express';
import { llmGatewayService, RateLimitError } from '../services/LLMGatewayService';

const router = express.Router();

router.post('/dict', async (req, res) => {
  try {
    const userId = (req as any).user?.id || 'unknown';
    const word = typeof req.body?.word === 'string' ? req.body.word.trim() : '';
    const context = typeof req.body?.context === 'string' ? req.body.context.trim() : undefined;
    if (!word) return res.status(400).json({ error: 'word is required' });

    const r = await llmGatewayService.dictionary(userId, word, context);
    const parsed = llmGatewayService.parseDictionaryJson(r.text);
    res.json({ result: parsed, cacheKey: r.cacheKey, modelVersion: r.modelVersion });
  } catch (error) {
    const msg = (error as Error).message || 'Unknown error';
    if (error instanceof RateLimitError || msg === 'Rate limit exceeded') return res.status(429).json({ error: msg });
    res.status(500).json({ error: msg });
  }
});

router.post('/translate', async (req, res) => {
  try {
    const userId = (req as any).user?.id || 'unknown';
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const sourceLang = typeof req.body?.sourceLang === 'string' ? req.body.sourceLang.trim() : 'en';
    const targetLang = typeof req.body?.targetLang === 'string' ? req.body.targetLang.trim() : 'zh';
    const style = typeof req.body?.style === 'string' ? req.body.style.trim() : undefined;
    if (!text) return res.status(400).json({ error: 'text is required' });

    const r = await llmGatewayService.translate(userId, text, sourceLang, targetLang, style);
    res.json({ translatedText: r.text.trim(), cacheKey: r.cacheKey, modelVersion: r.modelVersion });
  } catch (error) {
    const msg = (error as Error).message || 'Unknown error';
    if (error instanceof RateLimitError || msg === 'Rate limit exceeded') return res.status(429).json({ error: msg });
    res.status(500).json({ error: msg });
  }
});

router.post('/title-translate', async (req, res) => {
  try {
    const userId = (req as any).user?.id || 'unknown';
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const sourceLang = typeof req.body?.sourceLang === 'string' ? req.body.sourceLang.trim() : 'en';
    const targetLang = typeof req.body?.targetLang === 'string' ? req.body.targetLang.trim() : 'zh';
    if (!title) return res.status(400).json({ error: 'title is required' });

    const r = await llmGatewayService.titleTranslate(userId, title, sourceLang, targetLang);
    res.json({ translatedTitle: r.text.trim(), cacheKey: r.cacheKey, modelVersion: r.modelVersion });
  } catch (error) {
    const msg = (error as Error).message || 'Unknown error';
    if (error instanceof RateLimitError || msg === 'Rate limit exceeded') return res.status(429).json({ error: msg });
    res.status(500).json({ error: msg });
  }
});

export default router;
