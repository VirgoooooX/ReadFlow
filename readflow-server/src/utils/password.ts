import crypto from 'crypto';

const LEGACY_PASSWORD_SALT = 'readflow_salt';
const SCRYPT_PARAMS = {
  N: 16_384,
  r: 8,
  p: 1,
  keyLength: 64,
  maxmem: 64 * 1024 * 1024,
};

export type PasswordVerification = {
  valid: boolean;
  needsRehash: boolean;
};

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, 'hex');
    const right = Buffer.from(b, 'hex');
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function hashLegacyPassword(password: string): string {
  return crypto.createHash('sha256').update(password + LEGACY_PASSWORD_SALT).digest('hex');
}

function scryptHex(password: string, salt: string, n: number, r: number, p: number): string {
  return crypto.scryptSync(password, salt, SCRYPT_PARAMS.keyLength, {
    N: n,
    r,
    p,
    maxmem: SCRYPT_PARAMS.maxmem,
  }).toString('hex');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = scryptHex(password, salt, SCRYPT_PARAMS.N, SCRYPT_PARAMS.r, SCRYPT_PARAMS.p);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash?: string | null): PasswordVerification {
  const stored = String(storedHash || '').trim();
  if (!stored) return { valid: false, needsRehash: false };

  if (stored.startsWith('scrypt$')) {
    const [, nRaw, rRaw, pRaw, salt, hash] = stored.split('$');
    const n = parseInt(nRaw || '', 10);
    const r = parseInt(rRaw || '', 10);
    const p = parseInt(pRaw || '', 10);

    if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p) || !salt || !hash) {
      return { valid: false, needsRehash: false };
    }

    const candidate = scryptHex(password, salt, n, r, p);
    const valid = timingSafeEqualHex(candidate, hash);
    const needsRehash =
      valid &&
      (n !== SCRYPT_PARAMS.N || r !== SCRYPT_PARAMS.r || p !== SCRYPT_PARAMS.p || hash.length !== SCRYPT_PARAMS.keyLength * 2);
    return { valid, needsRehash };
  }

  const legacyHash = hashLegacyPassword(password);
  const valid = timingSafeEqualHex(legacyHash, stored);
  return { valid, needsRehash: valid };
}
