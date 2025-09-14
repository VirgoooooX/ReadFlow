// Material Design 3 Color System
// 基于Material You设计规范的颜色定义

// 自定义颜色配置接口
export interface CustomColorConfig {
  primary?: string;
  secondary?: string;
  tertiary?: string;
  error?: string;
  background?: string;
  surface?: string;
}

// 主题预设类型
export type ThemePreset = 
  | 'default' 
  | 'blue' 
  | 'green' 
  | 'purple' 
  | 'orange' 
  | 'red' 
  | 'pink' 
  | 'teal' 
  | 'indigo' 
  | 'yellow' 
  | 'gray' 
  | 'dark' 
  | 'custom';

export interface ColorTokens {
  // Primary colors
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;

  // Secondary colors
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;

  // Tertiary colors
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;

  // Error colors
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;

  // Background colors
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;

  // Outline colors
  outline: string;
  outlineVariant: string;

  // Surface colors
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;

  // Inverse colors
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;

  // Shadow and scrim
  shadow: string;
  scrim: string;
}

// Light theme colors
export const lightColors: ColorTokens = {
  // Primary colors - Blue theme (符合设计规范)
  primary: '#3B82F6',
  onPrimary: '#FFFFFF',
  primaryContainer: '#DBEAFE',
  onPrimaryContainer: '#1E3A8A',

  // Secondary colors
  secondary: '#6B7280',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#F3F4F6',
  onSecondaryContainer: '#374151',

  // Tertiary colors
  tertiary: '#10B981',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#D1FAE5',
  onTertiaryContainer: '#064E3B',

  // Error colors
  error: '#B3261E',
  onError: '#FFFFFF',
  errorContainer: '#F9DEDC',
  onErrorContainer: '#410E0B',

  // Background colors
  background: '#FFFBFE',
  onBackground: '#1C1B1F',
  surface: '#FFFBFE',
  onSurface: '#1C1B1F',
  surfaceVariant: '#E7E0EC',
  onSurfaceVariant: '#49454F',

  // Outline colors
  outline: '#79747E',
  outlineVariant: '#CAC4D0',

  // Surface colors
  surfaceDim: '#DDD8E1',
  surfaceBright: '#FFFBFE',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F7F2FA',
  surfaceContainer: '#F1ECF4',
  surfaceContainerHigh: '#ECE6F0',
  surfaceContainerHighest: '#E6E0E9',

  // Inverse colors
  inverseSurface: '#313033',
  inverseOnSurface: '#F4EFF4',
  inversePrimary: '#D0BCFF',

  // Shadow and scrim
  shadow: '#000000',
  scrim: '#000000',
};

// Dark theme colors
export const darkColors: ColorTokens = {
  // Primary colors - Blue theme (符合设计规范)
  primary: '#60A5FA',
  onPrimary: '#1E3A8A',
  primaryContainer: '#2563EB',
  onPrimaryContainer: '#DBEAFE',

  // Secondary colors
  secondary: '#9CA3AF',
  onSecondary: '#374151',
  secondaryContainer: '#4B5563',
  onSecondaryContainer: '#F3F4F6',

  // Tertiary colors
  tertiary: '#34D399',
  onTertiary: '#064E3B',
  tertiaryContainer: '#059669',
  onTertiaryContainer: '#D1FAE5',

  // Error colors
  error: '#F2B8B5',
  onError: '#601410',
  errorContainer: '#8C1D18',
  onErrorContainer: '#F9DEDC',

  // Background colors
  background: '#1C1B1F',
  onBackground: '#E6E1E5',
  surface: '#1C1B1F',
  onSurface: '#E6E1E5',
  surfaceVariant: '#49454F',
  onSurfaceVariant: '#CAC4D0',

  // Outline colors
  outline: '#938F99',
  outlineVariant: '#49454F',

  // Surface colors
  surfaceDim: '#1C1B1F',
  surfaceBright: '#423F42',
  surfaceContainerLowest: '#0F0D13',
  surfaceContainerLow: '#1D1B20',
  surfaceContainer: '#211F26',
  surfaceContainerHigh: '#2B2930',
  surfaceContainerHighest: '#36343B',

  // Inverse colors
  inverseSurface: '#E6E1E5',
  inverseOnSurface: '#313033',
  inversePrimary: '#3B82F6',

  // Shadow and scrim
  shadow: '#000000',
  scrim: '#000000',
};

// Semantic colors for specific use cases
export const semanticColors = {
  success: {
    light: '#2E7D32',
    dark: '#4CAF50',
  },
  warning: {
    light: '#F57C00',
    dark: '#FF9800',
  },
  info: {
    light: '#1976D2',
    dark: '#2196F3',
  },
};

// Color utilities
// 生成自定义颜色的辅助函数
const generateColorVariants = (baseColor: string, isDark: boolean) => {
  // 这里可以实现更复杂的颜色生成逻辑
  // 暂时返回基础颜色和一些变体
  const opacity = isDark ? 0.8 : 0.9;
  return {
    base: baseColor,
    container: isDark ? `${baseColor}33` : `${baseColor}1A`,
    onContainer: isDark ? '#FFFFFF' : '#000000',
  };
};

// 应用自定义颜色配置
const applyCustomColors = (baseColors: ColorTokens, customConfig?: CustomColorConfig): ColorTokens => {
  if (!customConfig) return baseColors;
  
  const customColors = { ...baseColors };
  
  if (customConfig.primary) {
    customColors.primary = customConfig.primary;
    customColors.primaryContainer = `${customConfig.primary}1A`;
  }
  
  if (customConfig.secondary) {
    customColors.secondary = customConfig.secondary;
    customColors.secondaryContainer = `${customConfig.secondary}1A`;
  }
  
  if (customConfig.tertiary) {
    customColors.tertiary = customConfig.tertiary;
    customColors.tertiaryContainer = `${customConfig.tertiary}1A`;
  }
  
  if (customConfig.error) {
    customColors.error = customConfig.error;
    customColors.errorContainer = `${customConfig.error}1A`;
  }
  
  if (customConfig.background) {
    customColors.background = customConfig.background;
  }
  
  if (customConfig.surface) {
    customColors.surface = customConfig.surface;
  }
  
  return customColors;
};

export const getColorTokens = (isDark: boolean, customConfig?: CustomColorConfig): ColorTokens => {
  const baseColors = isDark ? darkColors : lightColors;
  return applyCustomColors(baseColors, customConfig);
};

// 主题预设配置
export const themePresets: Record<ThemePreset, CustomColorConfig | null> = {
  default: null, // 使用系统默认颜色
  
  // 蓝色系主题
  blue: {
    primary: '#3B82F6',
    secondary: '#6B7280',
    tertiary: '#10B981',
    background: '#F8FAFC',
    surface: '#FFFFFF',
  },
  
  // 绿色系主题
  green: {
    primary: '#10B981',
    secondary: '#6B7280',
    tertiary: '#3B82F6',
    background: '#F0FDF4',
    surface: '#FFFFFF',
  },
  
  // 紫色系主题
  purple: {
    primary: '#8B5CF6',
    secondary: '#6B7280',
    tertiary: '#F59E0B',
    background: '#FAF5FF',
    surface: '#FFFFFF',
  },
  
  // 橙色系主题
  orange: {
    primary: '#F97316',
    secondary: '#6B7280',
    tertiary: '#10B981',
    background: '#FFF7ED',
    surface: '#FFFFFF',
  },
  
  // 红色系主题
  red: {
    primary: '#EF4444',
    secondary: '#6B7280',
    tertiary: '#10B981',
    background: '#FEF2F2',
    surface: '#FFFFFF',
  },
  
  // 粉色系主题
  pink: {
    primary: '#EC4899',
    secondary: '#6B7280',
    tertiary: '#8B5CF6',
    background: '#FDF2F8',
    surface: '#FFFFFF',
  },
  
  // 青色系主题
  teal: {
    primary: '#14B8A6',
    secondary: '#6B7280',
    tertiary: '#F59E0B',
    background: '#F0FDFA',
    surface: '#FFFFFF',
  },
  
  // 靛蓝系主题
  indigo: {
    primary: '#6366F1',
    secondary: '#6B7280',
    tertiary: '#10B981',
    background: '#F0F9FF',
    surface: '#FFFFFF',
  },
  
  // 黄色系主题
  yellow: {
    primary: '#F59E0B',
    secondary: '#6B7280',
    tertiary: '#8B5CF6',
    background: '#FFFBEB',
    surface: '#FFFFFF',
  },
  
  // 灰色系主题
  gray: {
    primary: '#6B7280',
    secondary: '#9CA3AF',
    tertiary: '#3B82F6',
    background: '#F9FAFB',
    surface: '#FFFFFF',
  },
  
  // 深色主题
  dark: {
    primary: '#60A5FA',
    secondary: '#9CA3AF',
    tertiary: '#34D399',
    background: '#111827',
    surface: '#1F2937',
  },
  
  custom: null, // 用户自定义
};

// 主题预设描述
export const themePresetDescriptions: Record<ThemePreset, string> = {
  default: '系统默认主题，跟随Material Design 3规范',
  blue: '清新的蓝色主题，适合商务和专业场景',
  green: '自然的绿色主题，给人清新舒适的感觉',
  purple: '优雅的紫色主题，富有创意和想象力',
  orange: '活力的橙色主题，充满热情和能量',
  red: '热情的红色主题，醒目而有力量感',
  pink: '温柔的粉色主题，柔和而富有亲和力',
  teal: '沉稳的青色主题，平衡而专业',
  indigo: '深邃的靛蓝主题，神秘而富有深度',
  yellow: '明亮的黄色主题，充满阳光和活力',
  gray: '简约的灰色主题，低调而优雅',
  dark: '深色主题，护眼且适合夜间使用',
  custom: '完全自定义的主题，发挥你的创意',
};

// 主题预设标签
export const themePresetTags: Record<ThemePreset, string[]> = {
  default: ['默认', '标准'],
  blue: ['商务', '专业', '清新'],
  green: ['自然', '健康', '舒适'],
  purple: ['创意', '优雅', '神秘'],
  orange: ['活力', '热情', '温暖'],
  red: ['热情', '力量', '醒目'],
  pink: ['温柔', '浪漫', '亲和'],
  teal: ['沉稳', '平衡', '专业'],
  indigo: ['深邃', '智慧', '冷静'],
  yellow: ['明亮', '活力', '阳光'],
  gray: ['简约', '低调', '优雅'],
  dark: ['护眼', '夜间', '酷炫'],
  custom: ['个性', '创意', '独特'],
};

export const getSemanticColor = (type: 'success' | 'warning' | 'info', isDark: boolean): string => {
  return semanticColors[type][isDark ? 'dark' : 'light'];
};

// Opacity levels for overlays and states
export const opacityLevels = {
  disabled: 0.38,
  hover: 0.08,
  focus: 0.12,
  selected: 0.12,
  activated: 0.12,
  pressed: 0.12,
  dragged: 0.16,
};

// Color roles for different UI elements
export const colorRoles = {
  // Text colors
  textPrimary: (colors: ColorTokens) => colors.onSurface,
  textSecondary: (colors: ColorTokens) => colors.onSurfaceVariant,
  textDisabled: (colors: ColorTokens) => `${colors.onSurface}${Math.round(opacityLevels.disabled * 255).toString(16)}`,

  // Icon colors
  iconPrimary: (colors: ColorTokens) => colors.onSurface,
  iconSecondary: (colors: ColorTokens) => colors.onSurfaceVariant,
  iconDisabled: (colors: ColorTokens) => `${colors.onSurface}${Math.round(opacityLevels.disabled * 255).toString(16)}`,

  // Border colors
  borderPrimary: (colors: ColorTokens) => colors.outline,
  borderSecondary: (colors: ColorTokens) => colors.outlineVariant,

  // Divider colors
  divider: (colors: ColorTokens) => colors.outlineVariant,
};

export default {
  light: lightColors,
  dark: darkColors,
  semantic: semanticColors,
  getColorTokens,
  getSemanticColor,
  opacityLevels,
  colorRoles,
};