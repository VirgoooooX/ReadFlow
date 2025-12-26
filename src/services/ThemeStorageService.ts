import AsyncStorage from '@react-native-async-storage/async-storage';
import { CustomColorConfig, ThemePreset } from '../theme';
import { logger } from './rss/RSSUtils';

// 存储键名
const STORAGE_KEYS = {
  THEME_MODE: '@theme_mode',
  THEME_PRESET: '@theme_preset',
  CUSTOM_COLORS: '@custom_colors',
  SAVED_THEMES: '@saved_themes',
} as const;

// 主题模式类型
export type ThemeMode = 'light' | 'dark' | 'system';

// 保存的主题配置
export interface SavedTheme {
  id: string;
  name: string;
  colors: CustomColorConfig;
  createdAt: number;
  updatedAt: number;
}

// 主题设置
export interface ThemeSettings {
  mode: ThemeMode;
  preset: ThemePreset;
  customColors?: CustomColorConfig;
}

class ThemeStorageService {
  // 【优化】提取通用的错误处理 helper，减少代码重复
  private async safeGet<T>(key: string, defaultValue: T, parser?: (val: string) => T): Promise<T> {
    try {
      const value = await AsyncStorage.getItem(key);
      if (value === null) return defaultValue;
      return parser ? parser(value) : (value as unknown as T);
    } catch (error) {
      logger.error(`Failed to get ${key}:`, error);
      return defaultValue;
    }
  }

  private async safeSet(key: string, value: any): Promise<void> {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      await AsyncStorage.setItem(key, stringValue);
    } catch (error) {
      logger.error(`Failed to set ${key}:`, error);
      throw error;
    }
  }


  // --- 核心设置 ---

  async getThemeMode(): Promise<ThemeMode> {
    return this.safeGet<ThemeMode>(STORAGE_KEYS.THEME_MODE, 'system');
  }

  async setThemeMode(mode: ThemeMode | undefined | null): Promise<void> {
    const validMode = mode || 'system';
    await this.safeSet(STORAGE_KEYS.THEME_MODE, validMode);
  }

  async getThemePreset(): Promise<ThemePreset> {
    return this.safeGet<ThemePreset>(STORAGE_KEYS.THEME_PRESET, 'default');
  }

  async setThemePreset(preset: ThemePreset | undefined | null): Promise<void> {
    const validPreset = preset || 'default';
    await this.safeSet(STORAGE_KEYS.THEME_PRESET, validPreset);
  }

  async getCustomColors(): Promise<CustomColorConfig | null> {
    return this.safeGet<CustomColorConfig | null>(STORAGE_KEYS.CUSTOM_COLORS, null, JSON.parse);
  }

  async setCustomColors(colors: CustomColorConfig): Promise<void> {
    await this.safeSet(STORAGE_KEYS.CUSTOM_COLORS, colors);
  }

  async clearCustomColors(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.CUSTOM_COLORS);
    } catch (error) {
      logger.error('Failed to clear custom colors:', error);
    }
  }


  // --- 组合操作 ---

  async getThemeSettings(): Promise<ThemeSettings> {
    // 【保留】Promise.all 并发读取效率高
    const [mode, preset, customColors] = await Promise.all([
      this.getThemeMode(),
      this.getThemePreset(),
      this.getCustomColors(),
    ]);

    return { mode, preset, customColors: customColors || undefined };
  }

  async setThemeSettings(settings: ThemeSettings): Promise<void> {
    const promises = [
      this.setThemeMode(settings.mode),
      this.setThemePreset(settings.preset),
    ];

    if (settings.customColors) {
      promises.push(this.setCustomColors(settings.customColors));
    } else {
      promises.push(AsyncStorage.removeItem(STORAGE_KEYS.CUSTOM_COLORS));
    }

    await Promise.all(promises);
  }

  // --- 保存的主题 (Saved Themes) ---

  async getSavedThemes(): Promise<SavedTheme[]> {
    return this.safeGet<SavedTheme[]>(STORAGE_KEYS.SAVED_THEMES, [], JSON.parse);
  }

  async saveTheme(name: string, colors: CustomColorConfig): Promise<SavedTheme> {
    const savedThemes = await this.getSavedThemes();
    const now = Date.now();
    // 【优化】增加随机数后缀防止 ID 碰撞
    const newTheme: SavedTheme = {
      id: `theme_${now}_${Math.floor(Math.random() * 10000)}`,
      name,
      colors,
      createdAt: now,
      updatedAt: now,
    };

    await this.safeSet(STORAGE_KEYS.SAVED_THEMES, [...savedThemes, newTheme]);
    return newTheme;
  }

  async updateSavedTheme(id: string, name: string, colors: CustomColorConfig): Promise<void> {
    const savedThemes = await this.getSavedThemes();
    const index = savedThemes.findIndex(theme => theme.id === id);

    if (index === -1) {
      throw new Error('Theme not found');
    }

    savedThemes[index] = {
      ...savedThemes[index],
      name,
      colors,
      updatedAt: Date.now(),
    };

    await this.safeSet(STORAGE_KEYS.SAVED_THEMES, savedThemes);
  }

  async deleteSavedTheme(id: string): Promise<void> {
    const savedThemes = await this.getSavedThemes();
    const filteredThemes = savedThemes.filter(theme => theme.id !== id);
    await this.safeSet(STORAGE_KEYS.SAVED_THEMES, filteredThemes);
  }

  async applySavedTheme(id: string): Promise<CustomColorConfig> {
    const savedThemes = await this.getSavedThemes();
    const theme = savedThemes.find(t => t.id === id);

    if (!theme) {
      throw new Error('Theme not found');
    }

    await this.setThemePreset('custom');
    await this.setCustomColors(theme.colors);

    return theme.colors;
  }

  async resetAllSettings(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.THEME_MODE),
        AsyncStorage.removeItem(STORAGE_KEYS.THEME_PRESET),
        AsyncStorage.removeItem(STORAGE_KEYS.CUSTOM_COLORS),
        // 注意：这里不删除保存的主题，用户可能还想要它们
      ]);
    } catch (error) {
      logger.error('Failed to reset theme settings:', error);
      throw error;
    }
  }

  async clearAllData(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.THEME_MODE),
        AsyncStorage.removeItem(STORAGE_KEYS.THEME_PRESET),
        AsyncStorage.removeItem(STORAGE_KEYS.CUSTOM_COLORS),
        AsyncStorage.removeItem(STORAGE_KEYS.SAVED_THEMES),
      ]);
    } catch (error) {
      logger.error('Failed to clear all theme data:', error);
      throw error;
    }
  }

  async exportThemeData(): Promise<string> {
    try {
      const [settings, savedThemes] = await Promise.all([
        this.getThemeSettings(),
        this.getSavedThemes(),
      ]);

      const exportData = {
        settings,
        savedThemes,
        exportedAt: Date.now(),
        version: '1.0',
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      logger.error('Failed to export theme data:', error);
      throw error;
    }
  }

  // 【优化】改进导入逻辑，支持合并而非简单覆盖
  async importThemeData(data: string, mergeStrategy: 'skip' | 'overwrite' = 'skip'): Promise<void> {
    try {
      const importData = JSON.parse(data);

      if (!importData.settings || !Array.isArray(importData.savedThemes)) {
        throw new Error('Invalid import data format');
      }

      // 导入设置
      await this.setThemeSettings(importData.settings);

      // 导入保存的主题
      const existingThemes = await this.getSavedThemes();
      let mergedThemes: SavedTheme[];

      if (mergeStrategy === 'overwrite') {
        // 覆盖模式：ID 相同则覆盖，否则追加
        mergedThemes = importData.savedThemes.map((importTheme: SavedTheme) => {
          const existingIndex = existingThemes.findIndex(t => t.id === importTheme.id);
          if (existingIndex !== -1) {
            return { ...importTheme, updatedAt: Date.now() };
          }
          return importTheme;
        });

        // 添加导入中没有的现有主题
        const importIds = importData.savedThemes.map((t: SavedTheme) => t.id);
        const existingNotInImport = existingThemes.filter(t => !importIds.includes(t.id));
        mergedThemes = [...mergedThemes, ...existingNotInImport];
      } else {
        // 跳过模式：只添加不存在的主题
        const newThemes = importData.savedThemes.filter(
          (importTheme: SavedTheme) => !existingThemes.some(existing => existing.id === importTheme.id)
        );
        mergedThemes = [...existingThemes, ...newThemes];
      }

      if (mergedThemes.length > 0) {
        await this.safeSet(STORAGE_KEYS.SAVED_THEMES, mergedThemes);
      }
    } catch (error) {
      logger.error('Failed to import theme data:', error);
      throw error;
    }
  }

}

// 导出单例实例
export const themeStorageService = new ThemeStorageService();
export default themeStorageService;