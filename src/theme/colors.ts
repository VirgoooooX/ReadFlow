// Material Design 3 Color System with Dynamic Theming
// 【重构】使用 @material/material-color-utilities 生成科学配色方案

import {
  argbFromHex,
  themeFromSourceColor,
  hexFromArgb,
} from '@material/material-color-utilities';
import { getContrastColor, withAlpha, generateContainerColor } from '../utils/colorUtils';

// --- 接口定义 ---

export interface CustomColorConfig {
  primary?: string;
  secondary?: string;
  tertiary?: string;
  error?: string;
  background?: string;
  surface?: string;
}

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

// --- 【核心优化】使用官方库生成完整的配色方案 ---

/**
 * 根据源颜色（种子色）生成完整的 Material Design 3 配色方案
 * 这个函数使用 Google 官方的 HCT 色彩空间算法
 */
export const generateTokensFromSource = (
  sourceColorHex: string,
  isDark: boolean
): ColorTokens => {
  try {
    // 1. 使用官方算法生成主题
    const theme = themeFromSourceColor(argbFromHex(sourceColorHex));
    const scheme = isDark ? theme.schemes.dark : theme.schemes.light;

    // 2. 辅助函数：ARGB 转 Hex
    const toHex = (argb: number) => hexFromArgb(argb);

    // 3. 映射到 ColorTokens 结构
    const tokens: ColorTokens = {
      // Primary
      primary: toHex(scheme.primary),
      onPrimary: toHex(scheme.onPrimary),
      primaryContainer: toHex(scheme.primaryContainer),
      onPrimaryContainer: toHex(scheme.onPrimaryContainer),

      // Secondary
      secondary: toHex(scheme.secondary),
      onSecondary: toHex(scheme.onSecondary),
      secondaryContainer: toHex(scheme.secondaryContainer),
      onSecondaryContainer: toHex(scheme.onSecondaryContainer),

      // Tertiary
      tertiary: toHex(scheme.tertiary),
      onTertiary: toHex(scheme.onTertiary),
      tertiaryContainer: toHex(scheme.tertiaryContainer),
      onTertiaryContainer: toHex(scheme.onTertiaryContainer),

      // Error
      error: toHex(scheme.error),
      onError: toHex(scheme.onError),
      errorContainer: toHex(scheme.errorContainer),
      onErrorContainer: toHex(scheme.onErrorContainer),

      // Background
      // Background - 强制在浅色模式下使用略深的背景色以保证卡片对比度
      background: (!isDark && toHex(scheme.background) === toHex(scheme.surface))
        ? '#F0F2F5' // 通用浅灰背景
        : toHex(scheme.background),
      onBackground: toHex(scheme.onBackground),

      // Surface
      surface: toHex(scheme.surface),
      onSurface: toHex(scheme.onSurface),
      surfaceVariant: toHex(scheme.surfaceVariant),
      onSurfaceVariant: toHex(scheme.onSurfaceVariant),

      // Outline
      outline: toHex(scheme.outline),
      outlineVariant: toHex(scheme.outlineVariant),

      // Surface container (MD3 新增分层)
      // Surface container (MD3 新增分层) - 添加回退机制，防止旧版库返回 undefined
      surfaceDim: (scheme as any).surfaceDim ? toHex((scheme as any).surfaceDim) : toHex(scheme.surface),
      surfaceBright: (scheme as any).surfaceBright ? toHex((scheme as any).surfaceBright) : toHex(scheme.surface),
      surfaceContainerLowest: (scheme as any).surfaceContainerLowest ? toHex((scheme as any).surfaceContainerLowest) : toHex(scheme.surface),
      surfaceContainerLow: (scheme as any).surfaceContainerLow ? toHex((scheme as any).surfaceContainerLow) : toHex(scheme.surface),
      surfaceContainer: (scheme as any).surfaceContainer ? toHex((scheme as any).surfaceContainer) : toHex(scheme.surface),
      surfaceContainerHigh: (scheme as any).surfaceContainerHigh ? toHex((scheme as any).surfaceContainerHigh) : toHex(scheme.surface),
      surfaceContainerHighest: (scheme as any).surfaceContainerHighest ? toHex((scheme as any).surfaceContainerHighest) : toHex(scheme.surface),

      // Inverse
      inverseSurface: toHex((scheme as any).inverseSurface),
      inverseOnSurface: toHex((scheme as any).inverseOnSurface),
      inversePrimary: toHex((scheme as any).inversePrimary),

      // Shadow & Scrim
      shadow: toHex((scheme as any).shadow),
      scrim: toHex((scheme as any).scrim),
    };

    return tokens;
  } catch (error) {
    console.error('Failed to generate tokens from source color:', error);
    // 回退到默认浅色主题
    return isDark ? darkColors : lightColors;
  }
};

// --- 默认主题 (手工精心定义，确保完整的语义化颜色系统) ---

// 1. 浅色模式标准定义 (Light Theme)
export const lightColors: ColorTokens = {
  primary: '#3B82F6',
  onPrimary: '#FFFFFF',
  primaryContainer: '#DBEAFE',
  onPrimaryContainer: '#1E3A8A',

  // 背景：白色
  background: '#F9FAFB',
  onBackground: '#111827', // 深黑字

  // 卡片：白色
  surface: '#FFFFFF',
  onSurface: '#1F2937',    // 深灰字 (标题)
  surfaceVariant: '#F3F4F6',
  onSurfaceVariant: '#4B5563', // 浅灰字 (副标题)

  surfaceContainer: '#FFFFFF', // 列表项背景

  // 其他辅助色
  secondary: '#64748B',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#F1F5F9',
  onSecondaryContainer: '#0F172A',
  tertiary: '#0F766E',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#CCFBF1',
  onTertiaryContainer: '#115E59',
  error: '#EF4444',
  onError: '#FFFFFF',
  errorContainer: '#FEE2E2',
  onErrorContainer: '#991B1B',
  outline: '#94A3B8',
  outlineVariant: '#CBD5E1',

  // MD3 Surface Tones (浅色模式下通常也是白色或极浅灰)
  surfaceDim: '#DED8E1',
  surfaceBright: '#FEF7FF',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F7F2FA',
  surfaceContainerHigh: '#ECE6F0',
  surfaceContainerHighest: '#E6E0E9',

  inverseSurface: '#313033',
  inverseOnSurface: '#F4EFF4',
  inversePrimary: '#D0BCFF',
  shadow: '#000000',
  scrim: '#000000',
};

// 2. 深色模式标准定义 (Dark Theme)
// 【重点】确保所有 onXxx 都是浅色！
export const darkColors: ColorTokens = {
  primary: '#60A5FA',
  onPrimary: '#002D6C',
  primaryContainer: '#2563EB',
  onPrimaryContainer: '#DBEAFE',

  // 背景：深黑
  background: '#111827', // Gray-900
  onBackground: '#F3F4F6', // Gray-100 (浅白字)

  // 卡片：比背景稍亮
  surface: '#1F2937',    // Gray-800
  onSurface: '#F9FAFB',  // Gray-50 (纯白字)
  surfaceVariant: '#374151', // Gray-700
  onSurfaceVariant: '#D1D5DB', // Gray-300 (浅灰字)

  surfaceContainer: '#1F2937', // 列表项背景

  // 其他辅助色
  secondary: '#94A3B8',
  onSecondary: '#0F172A',
  secondaryContainer: '#334155',
  onSecondaryContainer: '#E2E8F0',
  tertiary: '#2DD4BF',
  onTertiary: '#00382E',
  tertiaryContainer: '#0F766E',
  onTertiaryContainer: '#CCFBF1',
  error: '#F87171',
  onError: '#450A0A',
  errorContainer: '#991B1B',
  onErrorContainer: '#FECACA',
  outline: '#64748B',
  outlineVariant: '#475569',

  // MD3 Surface Tones
  surfaceDim: '#111827',
  surfaceBright: '#374151',
  surfaceContainerLowest: '#0F0D13',
  surfaceContainerLow: '#1D1B20',
  surfaceContainerHigh: '#2B2930',
  surfaceContainerHighest: '#36343B',

  inverseSurface: '#E6E1E5',
  inverseOnSurface: '#313033',
  inversePrimary: '#3B82F6',
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

// --- 【优化】应用自定义颜色配置 ---

const applyCustomColors = (
  baseColors: ColorTokens,
  customConfig?: CustomColorConfig,
  isDark: boolean = false
): ColorTokens => {
  if (!customConfig) return baseColors;

  // 使用官方库重新生成整套配色（如果有 primary）
  if (customConfig.primary) {
    const generatedTokens = generateTokensFromSource(customConfig.primary, isDark);

    // 仅覆盖用户指定的颜色，其他颜色使用生成的方案
    const merged = { ...generatedTokens };

    // 允许用户强制覆盖特定的颜色
    if (customConfig.secondary) {
      merged.secondary = customConfig.secondary;
      merged.onSecondary = getContrastColor(customConfig.secondary);
      merged.secondaryContainer = generateContainerColor(customConfig.secondary, isDark);
    }

    if (customConfig.tertiary) {
      merged.tertiary = customConfig.tertiary;
      merged.onTertiary = getContrastColor(customConfig.tertiary);
      merged.tertiaryContainer = generateContainerColor(customConfig.tertiary, isDark);
    }

    if (customConfig.error) {
      merged.error = customConfig.error;
      merged.onError = getContrastColor(customConfig.error);
      merged.errorContainer = generateContainerColor(customConfig.error, isDark);
    }

    if (customConfig.background) {
      merged.background = customConfig.background;
      merged.onBackground = getContrastColor(customConfig.background);
    }

    if (customConfig.surface) {
      merged.surface = customConfig.surface;
      merged.onSurface = getContrastColor(customConfig.surface);
    }

    return merged;
  }

  // 如果没有 primary 但有其他自定义颜色，直接应用
  const newColors = { ...baseColors };

  if (customConfig.secondary) {
    newColors.secondary = customConfig.secondary;
    newColors.onSecondary = getContrastColor(customConfig.secondary);
    newColors.secondaryContainer = generateContainerColor(customConfig.secondary, isDark);
  }

  if (customConfig.tertiary) {
    newColors.tertiary = customConfig.tertiary;
    newColors.onTertiary = getContrastColor(customConfig.tertiary);
    newColors.tertiaryContainer = generateContainerColor(customConfig.tertiary, isDark);
  }

  if (customConfig.error) {
    newColors.error = customConfig.error;
    newColors.onError = getContrastColor(customConfig.error);
    newColors.errorContainer = generateContainerColor(customConfig.error, isDark);
  }

  if (customConfig.background) {
    newColors.background = customConfig.background;
    newColors.onBackground = getContrastColor(customConfig.background);
  }

  if (customConfig.surface) {
    newColors.surface = customConfig.surface;
    newColors.onSurface = getContrastColor(customConfig.surface);
  }

  return newColors;
};

export const getColorTokens = (isDark: boolean, customConfig?: CustomColorConfig): ColorTokens => {
  const baseColors = isDark ? darkColors : lightColors;
  const result = applyCustomColors(baseColors, customConfig, isDark);

  // 【防守性编程】确保深色模式下的文字颜色永远不会是深色
  // 更新：使用新的标准浅色 #F9FAFB 作为深色模式下的文字颜色
  if (isDark && result.onSurface && result.onSurface.toLowerCase() !== '#f9fafb') {
    console.warn('⚠️ 深色模式 onSurface 颜色异常:', result.onSurface, '已纠正为浅色');
    result.onSurface = '#F9FAFB';
    result.onBackground = '#F3F4F6';
    result.onSurfaceVariant = '#D1D5DB';
  }

  return result;
};

// --- 【优化】预设颜色方案 (基于色彩理论) ---

export const themePresets: Record<ThemePreset, CustomColorConfig | null> = {
  // 默认主题 (系统蓝色)
  default: {
    surface: '#FAF9FF', // 淡紫色卡片背景
  },

  // 1. 商务蓝 - 单色系 (Monochromatic)
  // 主色、次色、第三色都在蓝色家族，提升专业感
  blue: {
    primary: '#0061A4', // 深蓝
    secondary: '#535F70', // 蓝灰
    tertiary: '#6B5778', // 紫灰
    surface: '#F8FAFF', // 淡蓝色卡片背景
  },

  // 2. 森林绿 - 邻近色系 (Analogous)
  // 绿色 + 蓝绿色，自然和谐
  green: {
    primary: '#006C4C', // 翠绿
    secondary: '#4D6357', // 灰绿
    tertiary: '#3E6373', // 蓝青色
    surface: '#F6FBF8', // 淡绿色卡片背景
  },

  // 3. 赛博紫 - 对比色系
  // 紫色主调，加入绿色点缀，科技感十足
  purple: {
    primary: '#7C3AED', // 紫色-600
    secondary: '#4C1D95', // 紫色-900
    tertiary: '#10B981', // 绿色-500
    surface: '#FAF8FF', // 淡紫色卡片背景
  },

  // 4. 活力橙 - 暖色系
  // 橙色 + 褐色 + 青色，充满能量
  orange: {
    primary: '#EA580C', // 橙色-600
    secondary: '#78350F', // 褐色-900
    tertiary: '#0F766E', // 青色-700
    surface: '#FFFAF6', // 淡橙色卡片背景
  },

  // 5. 热情红 - 红色系
  // 红色主导，加入中性色平衡
  red: {
    primary: '#DC2626', // 红色-600
    secondary: '#7C2D12', // 橙色-900
    tertiary: '#0369A1', // 蓝色-600
    surface: '#FFF8F8', // 淡红色卡片背景
  },

  // 6. 温柔粉 - 粉色系
  // 粉色主调，柔和舒适
  pink: {
    primary: '#EC4899', // 粉色-500
    secondary: '#831843', // 粉色-900
    tertiary: '#7C3AED', // 紫色-600
    surface: '#FFF8FB', // 淡粉色卡片背景
  },

  // 7. 沉稳青 - 冷色系
  // 青绿色，稳重专业
  teal: {
    primary: '#0D9488', // 青色-600
    secondary: '#134E4A', // 青色-900
    tertiary: '#D97706', // 琥珀色-600
    surface: '#F6FDFC', // 淡青色卡片背景
  },

  // 8. 深邃靖 - 靖蓝系
  // 靖蓝 + 紫色，高级神秘感
  indigo: {
    primary: '#4F46E5', // 靖蓝-600
    secondary: '#312E81', // 靖蓝-900
    tertiary: '#059669', // 绿色-600
    surface: '#F8F8FF', // 淡靖蓝色卡片背景
  },

  // 9. 明亮黄 - 黄色系
  // 活力黄色，加入深色平衡
  yellow: {
    primary: '#D97706', // 琥珀色-600
    secondary: '#78350F', // 褐色-900
    tertiary: '#0369A1', // 蓝色-600
    surface: '#FFFDF6', // 淡黄色卡片背景
  },

  // 10. 简约黑 - 中性系
  // 深色主调，简洁低调
  gray: {
    primary: '#1F2937', // 灰色-800
    secondary: '#374151', // 灰色-700
    tertiary: '#2563EB', // 蓝色-600
    surface: '#F9FAFB', // 淡灰色卡片背景
  },

  // 11. 藏青蓝 - 冷静优雅
  // 藏青色，沉稳而不失活力
  dark: {
    primary: '#0E7490', // 青色-600
    secondary: '#155E75', // 青色-800
    tertiary: '#34D399', // 绿色-400
    surface: '#F5FCFC', // 淡青色卡片背景
  },

  // 12. 自定义 (用户自己设置)
  custom: null,
};

// 主题预设描述
export const themePresetDescriptions: Record<ThemePreset, string> = {
  default: '系统默认主题，遵循 Material Design 3 规范',
  blue: '商务专业主题，传递信任和稳定感，适合企业应用',
  green: '自然清新主题，给人生机和舒适感，适合健康和生活类应用',
  purple: '赛博科技主题，富有创意和神秘感，适合创意和技术类应用',
  orange: '活力热情主题，充满能量和热血，适合社交和娱乐应用',
  red: '热烈醒目主题，传递激情和力量，适合运动和动作应用',
  pink: '温柔浪漫主题，柔和亲切，适合美妆和生活方式应用',
  teal: '沉稳优雅主题，平衡冷暖，适合金融和商务应用',
  indigo: '深邃神秘主题，高级感十足，适合艺术和设计应用',
  yellow: '明亮活泼主题，阳光积极，适合教育和娱乐应用',
  gray: '简约低调主题，深色主调，适合追求极简风格',
  dark: '藏青蓝主题，冷静优雅，适合阅读和专注',
  custom: '完全自定义主题，发挥你的创意和想象',
};

// 主题预设标签
export const themePresetTags: Record<ThemePreset, string[]> = {
  default: ['默认', '标准', '官方'],
  blue: ['商务', '专业', '信任', '单色系'],
  green: ['自然', '健康', '清新', '邻近色'],
  purple: ['科技', '创意', '神秘', '对比色'],
  orange: ['活力', '热情', '能量', '暖色'],
  red: ['热烈', '醒目', '力量', '激情'],
  pink: ['温柔', '浪漫', '亲切', '柔和'],
  teal: ['沉稳', '优雅', '平衡', '专业'],
  indigo: ['深邃', '高级', '神秘', '艺术'],
  yellow: ['明亮', '活泼', '阳光', '积极'],
  gray: ['简约', '极简', '低调', '深色'],
  dark: ['藏青', '冷静', '优雅', '专注'],
  custom: ['自定义', '个性', '创意', '唯一'],
};
