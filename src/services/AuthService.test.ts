import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cloudConfigService: {
    clearAuth: vi.fn(async () => ({ mode: 'cloud', serverUrl: 'https://example.com', auth: {} })),
    getConfig: vi.fn(async () => ({ mode: 'cloud', serverUrl: 'https://example.com', auth: {} })),
    updateConfig: vi.fn(async () => undefined),
  },
  databaseService: {
    clearUserData: vi.fn(async () => undefined),
  },
  settingsService: {
    clearAllSettings: vi.fn(async () => undefined),
  },
  cacheEventEmitter: {
    clearAll: vi.fn(),
    emit: vi.fn(),
  },
  store: {
    dispatch: vi.fn(),
  },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

vi.mock('./AvatarStorageService', () => ({
  default: {
    getAvatarPath: vi.fn(async () => null),
  },
}));

vi.mock('./rss/RSSUtils', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('./CloudConfigService', () => ({
  cloudConfigService: mocks.cloudConfigService,
}));

vi.mock('./SettingsService', () => ({
  SettingsService: {
    getInstance: () => mocks.settingsService,
  },
  settingsService: mocks.settingsService,
}));

vi.mock('../database/DatabaseService', () => ({
  databaseService: mocks.databaseService,
}));

vi.mock('./CacheEventEmitter', () => ({
  default: mocks.cacheEventEmitter,
}));

vi.mock('../store', () => ({
  store: mocks.store,
}));

import AuthService, {
  parseTokenValidationResult,
  shouldLogoutForTokenValidation,
} from './AuthService';

describe('AuthService logout data retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not clear local user data during a normal logout', async () => {
    await AuthService.logout();

    expect(mocks.cloudConfigService.clearAuth).toHaveBeenCalledTimes(1);
    expect(mocks.databaseService.clearUserData).not.toHaveBeenCalled();
    expect(mocks.settingsService.clearAllSettings).not.toHaveBeenCalled();
    expect(mocks.cacheEventEmitter.emit).toHaveBeenCalledWith({ type: 'authLogout' });
  });

  it('clears local user data only when explicitly requested', async () => {
    await AuthService.logout({ clearLocalData: true });

    expect(mocks.databaseService.clearUserData).toHaveBeenCalledTimes(1);
    expect(mocks.settingsService.clearAllSettings).toHaveBeenCalledTimes(1);
  });
});

describe('token validation classification', () => {
  it('treats network or server failures as unknown instead of logout-worthy', () => {
    const result = parseTokenValidationResult(false, undefined);

    expect(result).toBe('unknown');
    expect(shouldLogoutForTokenValidation(result)).toBe(false);
  });

  it('logs out only for a definitive invalid token response', () => {
    const result = parseTokenValidationResult(true, { valid: false });

    expect(result).toBe('invalid');
    expect(shouldLogoutForTokenValidation(result)).toBe(true);
  });
});
