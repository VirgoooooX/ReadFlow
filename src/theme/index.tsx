import { useColorScheme } from 'react-native';
import { lightColors, darkColors, getColorTokens, semanticColors, type ColorTokens, type CustomColorConfig, type ThemePreset, themePresets, themePresetDescriptions, themePresetTags } from './colors';
import { typography, readingTypography, adjustTypography, type TypographyTokens } from './typography';
import { spacing, componentSpacing, layoutSpacing, borderRadius, elevation, sizes, zIndex } from './spacing';

// 主题接口定义
export interface Theme {
  colors: ColorTokens;
  typography: TypographyTokens;
  spacing: typeof spacing;
  componentSpacing: typeof componentSpacing;
  layoutSpacing: typeof layoutSpacing;
  borderRadius: typeof borderRadius;
  elevation: typeof elevation;
  sizes: typeof sizes;
  zIndex: typeof zIndex;
  isDark: boolean;
}

// 创建主题对象
export const createTheme = (isDark: boolean, customConfig?: CustomColorConfig): Theme => {
  return {
    colors: getColorTokens(isDark, customConfig),
    typography,
    spacing,
    componentSpacing,
    layoutSpacing,
    borderRadius,
    elevation,
    sizes,
    zIndex,
    isDark,
  };
};

// 根据预设创建主题
export const createThemeFromPreset = (isDark: boolean, preset: ThemePreset): Theme => {
  const customConfig = themePresets[preset];
  return createTheme(isDark, customConfig || undefined);
};

// 预定义主题
export const lightTheme = createTheme(false);
export const darkTheme = createTheme(true);

// 主题钩子
export const useTheme = (): Theme => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  return createTheme(isDark);
};

// 主题上下文（可选，用于更复杂的主题管理）
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { themeStorageService, type ThemeSettings } from '../services/ThemeStorageService';

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  themeMode: 'light' | 'dark' | 'system';
  currentPreset: ThemePreset;
  customConfig?: CustomColorConfig;
  toggleTheme: () => void;
  setTheme: (isDark: boolean) => void;
  setThemeMode: (mode: 'light' | 'dark' | 'system') => Promise<void>;
  setThemePreset: (preset: ThemePreset) => void;
  setCustomColors: (config: CustomColorConfig) => void;
  resetToDefault: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  initialTheme?: 'light' | 'dark' | 'system';
  initialPreset?: ThemePreset;
  initialCustomConfig?: CustomColorConfig;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ 
  children, 
  initialTheme = 'system',
  initialPreset = 'default',
  initialCustomConfig
}) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>(initialTheme);
  const [currentPreset, setCurrentPreset] = useState<ThemePreset>(initialPreset);
  const [customConfig, setCustomConfig] = useState<CustomColorConfig | undefined>(initialCustomConfig);
  const [isLoading, setIsLoading] = useState(true);

  // 从存储加载主题设置
  useEffect(() => {
    const loadThemeSettings = async () => {
      try {
        const settings = await themeStorageService.getThemeSettings();
        setThemeMode(settings.mode || 'system');
        setCurrentPreset(settings.preset || 'default');
        setCustomConfig(settings.customColors || undefined);
      } catch (error) {
        console.error('Failed to load theme settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadThemeSettings();
  }, []);
  
  const isDark = themeMode === 'system' 
    ? systemColorScheme === 'dark'
    : themeMode === 'dark';
  
  // 根据当前预设和自定义配置创建主题
  const getEffectiveCustomConfig = (): CustomColorConfig | undefined => {
    if (currentPreset === 'custom') {
      return customConfig || undefined;
    }
    return themePresets[currentPreset] || undefined;
  };
  
  const theme = createTheme(isDark, getEffectiveCustomConfig());
  
  const toggleTheme = async () => {
    const newMode = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'system' : 'light';
    setThemeMode(newMode);
    try {
      await themeStorageService.setThemeMode(newMode);
    } catch (error) {
      console.error('Failed to save theme mode:', error);
    }
  };
  
  const setTheme = async (dark: boolean) => {
    const newMode = dark ? 'dark' : 'light';
    setThemeMode(newMode);
    try {
      await themeStorageService.setThemeMode(newMode);
    } catch (error) {
      console.error('Failed to save theme mode:', error);
    }
  };

  const setThemeModeAsync = async (mode: 'light' | 'dark' | 'system') => {
    setThemeMode(mode);
    try {
      await themeStorageService.setThemeMode(mode);
    } catch (error) {
      console.error('Failed to save theme mode:', error);
    }
  };
  
  const setThemePreset = async (preset: ThemePreset) => {
    setCurrentPreset(preset);
    try {
      await themeStorageService.setThemePreset(preset);
    } catch (error) {
      console.error('Failed to save theme preset:', error);
    }
  };
  
  const setCustomColors = async (config: CustomColorConfig) => {
    setCustomConfig(config);
    setCurrentPreset('custom');
    try {
      await Promise.all([
        themeStorageService.setThemePreset('custom'),
        themeStorageService.setCustomColors(config),
      ]);
    } catch (error) {
      console.error('Failed to save custom colors:', error);
    }
  };
  
  const resetToDefault = async () => {
    setCurrentPreset('default');
    setCustomConfig(undefined);
    try {
      await themeStorageService.resetAllSettings();
    } catch (error) {
      console.error('Failed to reset theme settings:', error);
    }
  };

  // 如果还在加载中，返回加载状态
  if (isLoading) {
    return null; // 或者返回一个加载组件
  }
  
  return (
    <ThemeContext.Provider value={{ 
      theme, 
      isDark, 
      themeMode,
      currentPreset,
      customConfig,
      toggleTheme, 
      setTheme,
      setThemeMode: setThemeModeAsync,
      setThemePreset,
      setCustomColors,
      resetToDefault
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeContext = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
};

// 样式工具函数
export const createStyles = <T extends Record<string, any>>(
  styleFactory: (theme: Theme) => T
) => {
  return (theme: Theme): T => styleFactory(theme);
};

// 颜色工具函数
export const withOpacity = (color: string, opacity: number): string => {
  // 如果颜色已经包含透明度，直接返回
  if (color.includes('rgba') || color.length === 9) {
    return color;
  }
  
  // 转换十六进制颜色为带透明度的格式
  const hex = color.replace('#', '');
  const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
  return `#${hex}${alpha}`;
};

// 响应式工具函数已暂时移除

// 动画配置已暂时移除

// 导出所有主题相关内容
export {
  // Colors
  lightColors,
  darkColors,
  getColorTokens,
  semanticColors,
  type ColorTokens,
  type CustomColorConfig,
  type ThemePreset,
  themePresets,
  themePresetDescriptions,
  themePresetTags,
  // Typography
  typography,
  readingTypography,
  adjustTypography,
  type TypographyTokens,
  // Spacing
  spacing,
  componentSpacing,
  layoutSpacing,
  borderRadius,
  elevation,
  sizes,
  zIndex,
};

// 默认导出
export default {
  light: lightTheme,
  dark: darkTheme,
  useTheme,
  createTheme,
  createThemeFromPreset,
  ThemeProvider,
  useThemeContext,
  createStyles,
  withOpacity,
  themePresets,
};