import AsyncStorage from '@react-native-async-storage/async-storage';
import { CustomColorConfig, ThemePreset } from '../theme';

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
  // 获取主题模式
  async getThemeMode(): Promise<ThemeMode> {
    try {
      const mode = await AsyncStorage.getItem(STORAGE_KEYS.THEME_MODE);
      return (mode as ThemeMode) || 'system';
    } catch (error) {
      console.error('Failed to get theme mode:', error);
      return 'system';
    }
  }

  // 保存主题模式
  async setThemeMode(mode: ThemeMode | undefined | null): Promise<void> {
    try {
      const validMode = mode || 'system';
      if (!validMode) {
        console.warn('setThemeMode called with undefined/null value, using default');
      }
      await AsyncStorage.setItem(STORAGE_KEYS.THEME_MODE, validMode);
    } catch (error) {
      console.error('Failed to set theme mode:', error);
      throw error;
    }
  }

  // 获取主题预设
  async getThemePreset(): Promise<ThemePreset> {
    try {
      const preset = await AsyncStorage.getItem(STORAGE_KEYS.THEME_PRESET);
      return (preset as ThemePreset) || 'default';
    } catch (error) {
      console.error('Failed to get theme preset:', error);
      return 'default';
    }
  }

  // 保存主题预设
  async setThemePreset(preset: ThemePreset | undefined | null): Promise<void> {
    try {
      const validPreset = preset || 'default';
      if (!validPreset) {
        console.warn('setThemePreset called with undefined/null value, using default');
      }
      await AsyncStorage.setItem(STORAGE_KEYS.THEME_PRESET, validPreset);
    } catch (error) {
      console.error('Failed to set theme preset:', error);
      throw error;
    }
  }

  // 获取自定义颜色配置
  async getCustomColors(): Promise<CustomColorConfig | null> {
    try {
      const colors = await AsyncStorage.getItem(STORAGE_KEYS.CUSTOM_COLORS);
      return colors ? JSON.parse(colors) : null;
    } catch (error) {
      console.error('Failed to get custom colors:', error);
      return null;
    }
  }

  // 保存自定义颜色配置
  async setCustomColors(colors: CustomColorConfig): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.CUSTOM_COLORS, JSON.stringify(colors));
    } catch (error) {
      console.error('Failed to set custom colors:', error);
      throw error;
    }
  }

  // 清除自定义颜色配置
  async clearCustomColors(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.CUSTOM_COLORS);
    } catch (error) {
      console.error('Failed to clear custom colors:', error);
      throw error;
    }
  }

  // 获取完整的主题设置
  async getThemeSettings(): Promise<ThemeSettings> {
    try {
      const [mode, preset, customColors] = await Promise.all([
        this.getThemeMode(),
        this.getThemePreset(),
        this.getCustomColors(),
      ]);

      return {
        mode,
        preset,
        customColors: customColors || undefined,
      };
    } catch (error) {
      console.error('Failed to get theme settings:', error);
      return {
        mode: 'system',
        preset: 'default',
      };
    }
  }

  // 保存完整的主题设置
  async setThemeSettings(settings: ThemeSettings): Promise<void> {
    try {
      await Promise.all([
        this.setThemeMode(settings.mode),
        this.setThemePreset(settings.preset),
        settings.customColors
          ? this.setCustomColors(settings.customColors)
          : this.clearCustomColors(),
      ]);
    } catch (error) {
      console.error('Failed to set theme settings:', error);
      throw error;
    }
  }

  // 获取保存的主题列表
  async getSavedThemes(): Promise<SavedTheme[]> {
    try {
      const themes = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_THEMES);
      return themes ? JSON.parse(themes) : [];
    } catch (error) {
      console.error('Failed to get saved themes:', error);
      return [];
    }
  }

  // 保存主题
  async saveTheme(name: string, colors: CustomColorConfig): Promise<SavedTheme> {
    try {
      const savedThemes = await this.getSavedThemes();
      const now = Date.now();
      
      const newTheme: SavedTheme = {
        id: `theme_${now}`,
        name,
        colors,
        createdAt: now,
        updatedAt: now,
      };

      const updatedThemes = [...savedThemes, newTheme];
      await AsyncStorage.setItem(STORAGE_KEYS.SAVED_THEMES, JSON.stringify(updatedThemes));
      
      return newTheme;
    } catch (error) {
      console.error('Failed to save theme:', error);
      throw error;
    }
  }

  // 更新保存的主题
  async updateSavedTheme(id: string, name: string, colors: CustomColorConfig): Promise<void> {
    try {
      const savedThemes = await this.getSavedThemes();
      const themeIndex = savedThemes.findIndex(theme => theme.id === id);
      
      if (themeIndex === -1) {
        throw new Error('Theme not found');
      }

      savedThemes[themeIndex] = {
        ...savedThemes[themeIndex],
        name,
        colors,
        updatedAt: Date.now(),
      };

      await AsyncStorage.setItem(STORAGE_KEYS.SAVED_THEMES, JSON.stringify(savedThemes));
    } catch (error) {
      console.error('Failed to update saved theme:', error);
      throw error;
    }
  }

  // 删除保存的主题
  async deleteSavedTheme(id: string): Promise<void> {
    try {
      const savedThemes = await this.getSavedThemes();
      const filteredThemes = savedThemes.filter(theme => theme.id !== id);
      await AsyncStorage.setItem(STORAGE_KEYS.SAVED_THEMES, JSON.stringify(filteredThemes));
    } catch (error) {
      console.error('Failed to delete saved theme:', error);
      throw error;
    }
  }

  // 应用保存的主题
  async applySavedTheme(id: string): Promise<CustomColorConfig> {
    try {
      const savedThemes = await this.getSavedThemes();
      const theme = savedThemes.find(t => t.id === id);
      
      if (!theme) {
        throw new Error('Theme not found');
      }

      await this.setThemePreset('custom');
      await this.setCustomColors(theme.colors);
      
      return theme.colors;
    } catch (error) {
      console.error('Failed to apply saved theme:', error);
      throw error;
    }
  }

  // 重置所有主题设置
  async resetAllSettings(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.THEME_MODE),
        AsyncStorage.removeItem(STORAGE_KEYS.THEME_PRESET),
        AsyncStorage.removeItem(STORAGE_KEYS.CUSTOM_COLORS),
        // 注意：这里不删除保存的主题，用户可能还想要它们
      ]);
    } catch (error) {
      console.error('Failed to reset theme settings:', error);
      throw error;
    }
  }

  // 清除所有数据（包括保存的主题）
  async clearAllData(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.THEME_MODE),
        AsyncStorage.removeItem(STORAGE_KEYS.THEME_PRESET),
        AsyncStorage.removeItem(STORAGE_KEYS.CUSTOM_COLORS),
        AsyncStorage.removeItem(STORAGE_KEYS.SAVED_THEMES),
      ]);
    } catch (error) {
      console.error('Failed to clear all theme data:', error);
      throw error;
    }
  }

  // 导出主题配置（用于备份）
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
      console.error('Failed to export theme data:', error);
      throw error;
    }
  }

  // 导入主题配置（用于恢复）
  async importThemeData(data: string): Promise<void> {
    try {
      const importData = JSON.parse(data);
      
      if (!importData.settings || !Array.isArray(importData.savedThemes)) {
        throw new Error('Invalid import data format');
      }

      // 导入设置
      await this.setThemeSettings(importData.settings);
      
      // 导入保存的主题（合并，不覆盖）
      const existingThemes = await this.getSavedThemes();
      const newThemes = importData.savedThemes.filter(
        (importTheme: SavedTheme) => 
          !existingThemes.some(existing => existing.id === importTheme.id)
      );
      
      if (newThemes.length > 0) {
        const mergedThemes = [...existingThemes, ...newThemes];
        await AsyncStorage.setItem(STORAGE_KEYS.SAVED_THEMES, JSON.stringify(mergedThemes));
      }
    } catch (error) {
      console.error('Failed to import theme data:', error);
      throw error;
    }
  }
}

// 导出单例实例
export const themeStorageService = new ThemeStorageService();
export default themeStorageService;