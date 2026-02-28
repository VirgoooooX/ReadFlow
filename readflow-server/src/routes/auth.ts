import express from 'express';
import { storageService } from '../services/StorageService';
import { logger } from '../utils/Logger';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = (() => {
  const raw = String(process.env.JWT_SECRET || '').trim();
  if (raw) return raw;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  logger.warn('[Auth] JWT_SECRET is not set; using an insecure development default');
  return 'readflow_jwt_secret_default_key_change_me';
})();

// Helper to hash password
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + 'readflow_salt').digest('hex');
}

// Helper to generate token (JWT implementation)
function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

// Helper to verify token
export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    return payload.userId;
  } catch (err) {
    return null;
  }
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (await storageService.findUserByEmail(email)) {
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

    await storageService.createUser(newUser);

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
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Missing credentials' });
    }

    const user = await storageService.findUserByEmail(email);
    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = generateToken(user.id);
    const { passwordHash, ...userSafe } = user;

    // Update last active
    user.lastActive = new Date().toISOString();
    await storageService.saveUser(user);

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
router.post('/validate', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.json({ valid: false });

    const userId = verifyToken(token);
    if (userId) {
      // Check if user still exists
      const users = await storageService.getUsers();
      const user = users.find(u => u.id === userId);
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
