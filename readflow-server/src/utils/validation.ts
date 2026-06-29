export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validates a string input.
 */
export function validateString(
  value: any,
  name: string,
  options: { maxLength?: number; trim?: boolean; required?: boolean; defaultValue?: string } = {}
): string {
  let str = '';
  if (typeof value === 'string') {
    str = value;
  } else if (value !== undefined && value !== null) {
    str = String(value);
  }

  const trim = options.trim !== false;
  if (trim) {
    str = str.trim();
  }

  if (options.required && !str) {
    throw new ValidationError(`${name} is required`);
  }

  if (!str && options.defaultValue !== undefined) {
    return options.defaultValue;
  }

  if (options.maxLength !== undefined && str.length > options.maxLength) {
    throw new ValidationError(`${name} must be at most ${options.maxLength} characters`);
  }

  return str;
}

/**
 * Validates and parses an integer input.
 */
export function validateInt(
  value: any,
  name: string,
  options: { min?: number; max?: number; defaultValue?: number; required?: boolean } = {}
): number {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (options.required) {
      throw new ValidationError(`${name} is required`);
    }
    if (options.defaultValue !== undefined) {
      return options.defaultValue;
    }
    return 0;
  }

  let parsed: number;
  if (typeof value === 'number') {
    parsed = value;
  } else {
    const raw = String(value).trim();
    if (!/^-?\d+$/.test(raw)) {
      throw new ValidationError(`${name} must be a valid integer`);
    }
    parsed = Number(raw);
  }

  if (!Number.isSafeInteger(parsed)) {
    throw new ValidationError(`${name} must be a valid integer`);
  }

  if (options.min !== undefined && parsed < options.min) {
    throw new ValidationError(`${name} must be at least ${options.min}`);
  }

  if (options.max !== undefined && parsed > options.max) {
    throw new ValidationError(`${name} must be at most ${options.max}`);
  }

  return parsed;
}

/**
 * Validates an array input.
 */
export function validateArray<T = any>(
  value: any,
  name: string,
  options: { maxLength?: number; required?: boolean } = {}
): T[] {
  if (value === undefined || value === null) {
    if (options.required) {
      throw new ValidationError(`${name} is required`);
    }
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ValidationError(`${name} must be an array`);
  }

  if (options.maxLength !== undefined && value.length > options.maxLength) {
    throw new ValidationError(`${name} array length must be at most ${options.maxLength}`);
  }

  return value as T[];
}

/**
 * Validates and normalizes an HTTP or HTTPS URL.
 */
export function validateUrl(
  value: any,
  name: string,
  options: {
    maxLength?: number;
    required?: boolean;
    defaultValue?: string;
    stripTrailingSlash?: boolean;
    allowRssHub?: boolean;
  } = {}
): string {
  const raw = typeof value === 'string' ? value.trim() : (value !== undefined && value !== null ? String(value).trim() : '');
  if (!raw) {
    if (options.required) {
      throw new ValidationError(`${name} is required`);
    }
    if (options.defaultValue !== undefined) {
      return options.defaultValue;
    }
    return '';
  }

  const maxLen = options.maxLength ?? 2048;
  if (raw.length > maxLen) {
    throw new ValidationError(`${name} must be at most ${maxLen} characters`);
  }

  if (options.allowRssHub && raw.toLowerCase().startsWith('rsshub://')) {
    const path = raw.substring('rsshub://'.length);
    if (!path || path === '/' || !/^[a-zA-Z0-9/._%?&=+\-]+$/.test(path)) {
      throw new ValidationError(`${name} must be a valid RSSHub URL`);
    }
    return options.stripTrailingSlash && raw.endsWith('/') ? raw.slice(0, -1) : raw;
  }

  try {
    const parsedUrl = new URL(raw);

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new ValidationError(`${name} protocol must be http or https`);
    }

    if (parsedUrl.username || parsedUrl.password) {
      throw new ValidationError(`${name} must not contain credentials`);
    }

    let normalized = parsedUrl.toString();
    if (options.stripTrailingSlash && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch (e) {
    if (e instanceof ValidationError) {
      throw e;
    }
    throw new ValidationError(`${name} must be a valid HTTP or HTTPS URL`);
  }
}
