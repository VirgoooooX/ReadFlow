import { Router } from 'express';
import { ConfigController } from '../controllers/ConfigController';

const router = Router();

router.get('/meta', ConfigController.getConfigMeta);

// Configure Preferences
router.get('/preferences', ConfigController.getPreferences);
router.put('/preferences', ConfigController.updatePreferences);

// Configure LLM Profiles
router.get('/llm-keys', ConfigController.getLLMKeys);
router.post('/llm-keys', ConfigController.upsertLLMKey);
router.post('/llm-keys/batch', ConfigController.batchUpsertLLMKeys);
router.delete('/llm-keys/:profileId', ConfigController.deleteLLMKey);

// Configure Sources
router.get('/sources', ConfigController.getSources);
router.post('/sources', ConfigController.upsertSource);
router.post('/sources/batch', ConfigController.batchUpsertSources);

// Configure Groups
router.get('/groups', ConfigController.getGroups);
router.post('/groups', ConfigController.upsertGroup);
router.post('/groups/batch', ConfigController.batchUpsertGroups);

// Configure Filter Rules
router.get('/filter-rules', ConfigController.getFilterRules);
router.post('/filter-rules', ConfigController.upsertFilterRule);
router.post('/filter-rules/batch', ConfigController.batchUpsertFilterRules);

export default router;
