import { useColorScheme } from 'react-native';
import { lightColors, darkColors, getColorTokens, semanticColors, type ColorTokens, type CustomColorConfig, type ThemePreset, themePresets, themePresetDescriptions, themePresetTags } from './colors';
import { typography, readingTypography, adjustTypography, type TypographyTokens } from './typography';
import { spacing, componentSpacing, layoutSpacing, borderRadius, elevation, sizes, zIndex } from './spacing';
import { withAlpha, getContrastColor } from '../utils/colorUtils';
import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { themeStorageService, type ThemeSettings } from '../services/ThemeStorageService';

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

// 主题钩子 (简单版本，仅读)
export const useTheme = (): Theme => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  return useMemo(() => createTheme(isDark), [isDark]);
};

// --- 完整主题上下文 ---

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  themeMode: 'light' | 'dark' | 'system';
  currentPreset: ThemePreset;
  customConfig?: CustomColorConfig;
  toggleTheme: () => Promise<void>;
  setTheme: (isDark: boolean) => Promise<void>;
  setThemeMode: (mode: 'light' | 'dark' | 'system') => Promise<void>;
  setThemePreset: (preset: ThemePreset | null | undefined) => Promise<void>;
  setCustomColors: (config: CustomColorConfig) => Promise<void>;
  resetToDefault: () => Promise<void>;
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
  const [themeMode, setThemeModeState] = useState<'light' | 'dark' | 'system'>(initialTheme);
  const [currentPreset, setCurrentPresetState] = useState<ThemePreset>(initialPreset);
  const [customConfig, setCustomConfigState] = useState<CustomColorConfig | undefined>(initialCustomConfig);
  const [isLoading, setIsLoading] = useState(true);

  // 【优化】加载设置
  useEffect(() => {
    const loadThemeSettings = async () => {
      try {
        const settings = await themeStorageService.getThemeSettings();
        setThemeModeState(settings.mode || 'system');
        setCurrentPresetState(settings.preset || 'default');
        setCustomConfigState(settings.customColors || undefined);
      } catch (error) {
        console.error('Failed to load theme settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadThemeSettings();
  }, []);
  
  // 【优化】使用 useMemo 计算 isDark，避免重复计算
  const isDark = useMemo(() => {
    if (themeMode === 'system') return systemColorScheme === 'dark';
    return themeMode === 'dark';
  }, [themeMode, systemColorScheme]);
  
  // 【优化】使用 useMemo 计算有效的自定义颜色配置
  const activeCustomConfig = useMemo(() => {
    if (currentPreset === 'custom') return customConfig;
    return themePresets[currentPreset] || undefined;
  }, [currentPreset, customConfig]);
  
  // 【关键优化】使用 useMemo 缓存主题对象，避免每次渲染都重新创建
  const theme = useMemo(() => 
    createTheme(isDark, activeCustomConfig), 
  [isDark, activeCustomConfig]);
  
  // 【关键优化】使用 useCallback 包裹所有状态修改方法，避免每次渲染创建新函数
  const setThemeMode = useCallback(async (mode: 'light' | 'dark' | 'system' | undefined | null) => {
    const validMode = mode || 'system';
    setThemeModeState(validMode);
    try {
      await themeStorageService.setThemeMode(validMode);
    } catch (error) {
      console.error('Failed to save theme mode:', error);
    }
  }, []);

  const toggleTheme = useCallback(async () => {
    const newMode = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'system' : 'light';
    await setThemeMode(newMode);
  }, [themeMode, setThemeMode]);
  
  const setTheme = useCallback(async (dark: boolean) => {
    await setThemeMode(dark ? 'dark' : 'light');
  }, [setThemeMode]);

  const setThemePreset = useCallback(async (preset: ThemePreset | undefined | null) => {
    const validPreset = preset || 'default';
    setCurrentPresetState(validPreset);
    try {
      await themeStorageService.setThemePreset(validPreset);
    } catch (error) {
      console.error('Failed to save theme preset:', error);
    }
  }, []);
  
  const setCustomColors = useCallback(async (config: CustomColorConfig) => {
    setCustomConfigState(config);
    setCurrentPresetState('custom');
    try {
      await Promise.all([
        themeStorageService.setThemePreset('custom'),
        themeStorageService.setCustomColors(config),
      ]);
    } catch (error) {
      console.error('Failed to save custom colors:', error);
    }
  }, []);
  
  const resetToDefault = useCallback(async () => {
    setCurrentPresetState('default');
    setCustomConfigState(undefined);
    setThemeModeState('system');
    try {
      await themeStorageService.resetAllSettings();
    } catch (error) {
      console.error('Failed to reset theme settings:', error);
    }
  }, []);

  // 【关键优化】使用 useMemo 缓存 Context value，防止所有消费者组件不必要的重渲染
  // 即使在加载状态下也要保持一致的 Hook 调用顺序
  const contextValue = useMemo<ThemeContextType>(() => ({
    theme: isLoading ? createTheme(systemColorScheme === 'dark') : theme,
    isDark: isLoading ? systemColorScheme === 'dark' : isDark,
    themeMode: isLoading ? 'system' : themeMode,
    currentPreset: isLoading ? 'default' : currentPreset,
    customConfig: isLoading ? undefined : customConfig,
    toggleTheme: isLoading ? async () => {} : toggleTheme,
    setTheme: isLoading ? async () => {} : setTheme,
    setThemeMode: isLoading ? async () => {} : setThemeMode,
    setThemePreset: isLoading ? async () => {} : setThemePreset,
    setCustomColors: isLoading ? async () => {} : setCustomColors,
    resetToDefault: isLoading ? async () => {} : resetToDefault
  }), [
    isLoading, theme, isDark, themeMode, currentPreset, customConfig,
    toggleTheme, setTheme, setThemeMode, setThemePreset, setCustomColors, resetToDefault,
    systemColorScheme
  ]);
  
  return (
    <ThemeContext.Provider value={contextValue}>
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

// 向后兼容
export const withOpacity = withAlpha;

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
  withAlpha,
  withOpacity,
  getContrastColor,
  themePresets,
};