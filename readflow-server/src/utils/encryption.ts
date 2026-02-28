import crypto from 'crypto';

const ENCRYPTION_SECRET = (() => {
  const raw = String(process.env.ENCRYPTION_SECRET || '').trim();
  if (raw) return raw;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_SECRET is required in production');
  }
  console.warn('[Encryption] ENCRYPTION_SECRET is not set; using an insecure development default');
  return 'readflow_dev_insecure_default_encryption_secret_change_me';
})();
const ALGORITHM = 'aes-256-cbc';

/**
 * Ensures the secret is exactly 32 bytes by hashing it.
 */
function getDerivedKey(): Buffer {
  return crypto.createHash('sha256').update(String(ENCRYPTION_SECRET)).digest();
}

/**
 * Encrypts a plaintext string.
 * @param text The text to encrypt
 * @returns A string in the format of "iv:encryptedData"
 */
export function encrypt(text: string): string {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(16);
    const key = getDerivedKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('[Encryption] Failed to encrypt data', err);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypts an encrypted string.
 * @param hash The encrypted string in the format of "iv:encryptedData"
 * @returns The decrypted plaintext
 */
export function decrypt(hash: string): string {
  if (!hash) return hash;
  if (!hash.includes(':')) {
    // If it doesn't contain the IV separator, assume it's unencrypted legacy data
    return hash;
  }
  try {
    const [ivHex, encryptedHex] = hash.split(':');
    if (!ivHex || !encryptedHex) {
      return hash;
    }
    const iv = Buffer.from(ivHex, 'hex');
    const key = getDerivedKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Encryption] Failed to decrypt data', err);
    // In case decryption fails (e.g. wrong key, corrupted data), return empty string or original
    // It's safer to return empty string than throwing for normal configs
    return '';
  }
}
