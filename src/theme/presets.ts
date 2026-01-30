/**
 * 主题预设配置
 * 统一管理所有主题预设颜色，避免硬编码在组件中
 */

import { lightColors, themePresets, type ThemePreset } from './colors';

export interface ThemePresetConfig {
  id: ThemePreset;
  name: string;
  colors: {
    primary: string;
    secondary: string;
  };
}

const THEME_PRESET_NAMES: Record<Exclude<ThemePreset, 'custom'>, string> = {
  default: '默认主题',
  blue: '商务蓝',
  green: '森林绿',
  purple: '赛博紫',
  orange: '活力橙',
  red: '热情红',
  pink: '温柔粉',
  teal: '沉稳青',
  indigo: '深邃靖',
  yellow: '明亮黄',
  gray: '简约黑',
  dark: '藏青蓝',
};

const buildPresetConfig = (id: Exclude<ThemePreset, 'custom'>): ThemePresetConfig => {
  const config = themePresets[id] || null;
  return {
    id,
    name: THEME_PRESET_NAMES[id],
    colors: {
      primary: config?.primary || lightColors.primary,
      secondary: config?.secondary || lightColors.secondary,
    },
  };
};

export const THEME_PRESETS: readonly ThemePresetConfig[] = (Object.keys(THEME_PRESET_NAMES) as Array<
  Exclude<ThemePreset, 'custom'>
 >).map(buildPresetConfig);

/**
 * 根据 ID 获取主题预设配置
 */
export const getThemePresetById = (id: ThemePreset): ThemePresetConfig | undefined => {
  return THEME_PRESETS.find(preset => preset.id === id);
};

/**
 * 获取所有预设 ID
 */
export const getPresetIds = (): string[] => {
  return THEME_PRESETS.map(preset => preset.id);
};
