import express from 'express';
import { storageService } from '../services/StorageService';
import { logger } from '../utils/Logger';
import crypto from 'crypto';

const router = express.Router();

// Helper to hash password
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + 'techflow_salt').digest('hex');
}

// Helper to generate token (Simple implementation)
function generateToken(userId: string): string {
  const payload = JSON.stringify({ userId, exp: Date.now() + 7 * 24 * 3600 * 1000 });
  return Buffer.from(payload).toString('base64');
}

// Helper to verify token
export function verifyToken(token: string): string | null {
  try {
    const payloadStr = Buffer.from(token, 'base64').toString('utf-8');
    const payload = JSON.parse(payloadStr);
    if (payload.exp < Date.now()) return null;
    return payload.userId;
  } catch {
    return null;
  }
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (storageService.findUserByEmail(email)) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const newUser = {
      id: email, // Use email as ID for simplicity in cloud mode
      username,
      email,
      passwordHash: hashPassword(password),
      registeredAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      settings: {}
    };

    storageService.createUser(newUser);

    const token = generateToken(newUser.id);
    
    // Don't return password hash
    const { passwordHash, ...userSafe } = newUser;

    logger.info(`[Auth] Registered user: ${email}`);

    res.json({
      success: true,
      user: userSafe,
      token
    });
  } catch (error) {
    logger.error('[Auth] Register failed:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Missing credentials' });
    }

    const user = storageService.findUserByEmail(email);
    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = generateToken(user.id);
    const { passwordHash, ...userSafe } = user;

    // Update last active
    user.lastActive = new Date().toISOString();
    storageService.saveUser(user);

    logger.info(`[Auth] User logged in: ${email}`);

    res.json({
      success: true,
      user: userSafe,
      token
    });
  } catch (error) {
    logger.error('[Auth] Login failed:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

// POST /api/auth/validate
router.post('/validate', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.json({ valid: false });

    const userId = verifyToken(token);
    if (userId) {
      // Check if user still exists
      const user = storageService.getUsers().find(u => u.id === userId);
      if (user) {
        return res.json({ valid: true, userId });
      }
    }
    res.json({ valid: false });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
