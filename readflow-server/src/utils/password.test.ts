import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('hashes and verifies passwords with scrypt', () => {
    const hash = hashPassword('secret-password');

    expect(hash).toMatch(/^scrypt\$/);
    expect(verifyPassword('secret-password', hash)).toEqual({ valid: true, needsRehash: false });
    expect(verifyPassword('wrong-password', hash)).toEqual({ valid: false, needsRehash: false });
  });

  it('accepts legacy sha256 hashes and marks them for rehash', () => {
    const legacyHash = crypto.createHash('sha256').update('old-password' + 'readflow_salt').digest('hex');

    expect(verifyPassword('old-password', legacyHash)).toEqual({ valid: true, needsRehash: true });
    expect(verifyPassword('wrong-password', legacyHash)).toEqual({ valid: false, needsRehash: false });
  });
});
