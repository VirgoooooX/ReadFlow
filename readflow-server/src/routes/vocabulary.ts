import express, { Request, Response } from 'express';
import { storageService } from '../services/StorageService';
import { logger } from '../utils/Logger';

const router = express.Router();

// POST /api/vocab/push
router.post('/push', async (req: Request, res: Response) => {
  try {
    const { words } = req.body;
    if (!Array.isArray(words)) {
      return res.status(400).json({ error: 'words must be an array' });
    }

    let synced = 0;
    for (const word of words) {
      if (!word.word) continue;
      // Client sends "translation", but we store as "definition"
      if (word.translation && !word.definition) {
        word.definition = word.translation;
      }
      await storageService.upsertVocabulary(word);
      synced++;
    }

    res.json({ success: true, synced });
  } catch (error) {
    logger.error('[Vocabulary] Push failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/vocab/pull
router.get('/pull', async (req: Request, res: Response) => {
  try {
    const since = req.query.since as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 500;

    if (!since) {
      return res.status(400).json({ error: 'since parameter is required' });
    }

    const words = await storageService.getVocabularySince(since, limit);
    const serverTime = await storageService.getVocabularyServerTime();

    res.json({
      words: words.map((w: any) => ({
        ...w,
        updated_at: w.updatedAt.toISOString(),
        added_at: w.addedAt.toISOString(),
        last_reviewed_at: w.lastReviewedAt?.toISOString(),
        next_review_at: w.nextReviewAt.toISOString(),
        article_id: w.articleId,
        source_article_id: w.sourceArticleId,
        review_count: w.reviewCount,
        correct_count: w.correctCount,
        mastery_level: w.masteryLevel,
        is_deleted: w.isDeleted,
        // Map definition to translation for client compatibility
        translation: w.definition, 
        definition: w.definition, 
      })),
      has_more: words.length === limit,
      server_time: serverTime,
    });
  } catch (error) {
    logger.error('[Vocabulary] Pull failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
