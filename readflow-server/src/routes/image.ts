import express from 'express';
import { ImageProxyController } from '../controllers/ImageProxyController';

const router = express.Router();

router.get('/', ImageProxyController.proxyImage);

export default router;
