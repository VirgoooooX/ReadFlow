import { describe, expect, it } from 'vitest';
import {
  ValidationError,
  validateString,
  validateInt,
  validateArray,
  validateUrl,
} from './validation';

describe('validation helpers', () => {
  describe('validateString', () => {
    it('should validate and trim string by default', () => {
      expect(validateString('  hello  ', 'test')).toBe('hello');
    });

    it('should respect trim: false', () => {
      expect(validateString('  hello  ', 'test', { trim: false })).toBe('  hello  ');
    });

    it('should throw if required and empty', () => {
      expect(() => validateString('', 'test', { required: true })).toThrow(ValidationError);
      expect(() => validateString('   ', 'test', { required: true })).toThrow('test is required');
    });

    it('should return defaultValue if empty and not required', () => {
      expect(validateString('', 'test', { defaultValue: 'fallback' })).toBe('fallback');
    });

    it('should throw if length exceeds maxLength', () => {
      expect(() => validateString('too long string', 'test', { maxLength: 5 })).toThrow(
        'test must be at most 5 characters'
      );
    });

    it('should convert non-string non-null values to string', () => {
      expect(validateString(12345, 'test')).toBe('12345');
    });
  });

  describe('validateInt', () => {
    it('should parse valid integers', () => {
      expect(validateInt('42', 'test')).toBe(42);
      expect(validateInt(100, 'test')).toBe(100);
    });

    it('should return default/0 for empty values if not required', () => {
      expect(validateInt('', 'test')).toBe(0);
      expect(validateInt(undefined, 'test', { defaultValue: 10 })).toBe(10);
    });

    it('should throw if required but missing or invalid', () => {
      expect(() => validateInt('', 'test', { required: true })).toThrow('test is required');
      expect(() => validateInt('abc', 'test', { required: true })).toThrow('test must be a valid integer');
    });

    it('should reject partial integers and unsafe numbers', () => {
      expect(() => validateInt('42abc', 'test')).toThrow('test must be a valid integer');
      expect(() => validateInt(1.5, 'test')).toThrow('test must be a valid integer');
      expect(() => validateInt('9007199254740992', 'test')).toThrow('test must be a valid integer');
    });

    it('should enforce min and max bounds', () => {
      expect(() => validateInt('5', 'test', { min: 10 })).toThrow('test must be at least 10');
      expect(() => validateInt('15', 'test', { max: 10 })).toThrow('test must be at most 10');
      expect(validateInt('10', 'test', { min: 5, max: 15 })).toBe(10);
    });
  });

  describe('validateArray', () => {
    it('should return array if valid', () => {
      expect(validateArray([1, 2, 3], 'test')).toEqual([1, 2, 3]);
    });

    it('should return empty array for missing if not required', () => {
      expect(validateArray(undefined, 'test')).toEqual([]);
    });

    it('should throw if required and missing', () => {
      expect(() => validateArray(undefined, 'test', { required: true })).toThrow('test is required');
    });

    it('should throw if not an array', () => {
      expect(() => validateArray('not an array', 'test')).toThrow('test must be an array');
    });

    it('should enforce maxLength', () => {
      expect(() => validateArray([1, 2, 3], 'test', { maxLength: 2 })).toThrow(
        'test array length must be at most 2'
      );
    });
  });

  describe('validateUrl', () => {
    it('should parse and normalize valid URLs', () => {
      expect(validateUrl('http://example.com/path', 'test')).toBe('http://example.com/path');
      expect(validateUrl('HTTPS://EXAMPLE.COM', 'test')).toBe('https://example.com/');
    });

    it('should reject credentials', () => {
      expect(() => validateUrl('https://user:pass@example.com/foo', 'test')).toThrow(
        'test must not contain credentials'
      );
    });

    it('should optionally strip trailing slash', () => {
      expect(validateUrl('https://example.com/', 'test', { stripTrailingSlash: true })).toBe('https://example.com');
    });

    it('should allow RSSHub URLs when explicitly enabled', () => {
      expect(validateUrl('rsshub://github/trending/daily/javascript', 'test', { allowRssHub: true })).toBe(
        'rsshub://github/trending/daily/javascript'
      );
      expect(() => validateUrl('rsshub://github/:bad', 'test', { allowRssHub: true })).toThrow(
        'test must be a valid RSSHub URL'
      );
    });

    it('should throw on invalid protocol', () => {
      expect(() => validateUrl('ftp://example.com', 'test')).toThrow('test protocol must be http or https');
    });

    it('should throw on invalid URL structure', () => {
      expect(() => validateUrl('not-a-url', 'test')).toThrow('test must be a valid HTTP or HTTPS URL');
    });

    it('should throw on exceeding max length', () => {
      expect(() => validateUrl('https://example.com', 'test', { maxLength: 10 })).toThrow(
        'test must be at most 10 characters'
      );
    });
  });
});
