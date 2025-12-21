/**
 * 主题预设配置
 * 统一管理所有主题预设颜色，避免硬编码在组件中
 */

export interface ThemePresetConfig {
  id: string;
  name: string;
  colors: {
    primary: string;
    secondary: string;
  };
}

export const THEME_PRESETS: readonly ThemePresetConfig[] = [
  {
    id: 'default',
    name: '默认主题',
    colors: {
      primary: '#6750A4',
      secondary: '#625B71',
    },
  },
  {
    id: 'blue',
    name: '商务蓝',
    colors: {
      primary: '#0061A4',
      secondary: '#535F70',
    },
  },
  {
    id: 'green',
    name: '森林绿',
    colors: {
      primary: '#006C4C',
      secondary: '#4D6357',
    },
  },
  {
    id: 'purple',
    name: '赛博紫',
    colors: {
      primary: '#7C3AED',
      secondary: '#4C1D95',
    },
  },
  {
    id: 'orange',
    name: '活力橙',
    colors: {
      primary: '#EA580C',
      secondary: '#78350F',
    },
  },
  {
    id: 'red',
    name: '热情红',
    colors: {
      primary: '#DC2626',
      secondary: '#7C2D12',
    },
  },
  {
    id: 'pink',
    name: '温柔粉',
    colors: {
      primary: '#EC4899',
      secondary: '#831843',
    },
  },
  {
    id: 'teal',
    name: '沉稳青',
    colors: {
      primary: '#0D9488',
      secondary: '#134E4A',
    },
  },
  {
    id: 'indigo',
    name: '深邃靖',
    colors: {
      primary: '#4F46E5',
      secondary: '#312E81',
    },
  },
  {
    id: 'yellow',
    name: '明亮黄',
    colors: {
      primary: '#D97706',
      secondary: '#78350F',
    },
  },
  {
    id: 'gray',
    name: '简约黑',
    colors: {
      primary: '#1F2937',
      secondary: '#374151',
    },
  },
  {
    id: 'dark',
    name: '藏青蓝',
    colors: {
      primary: '#0E7490',
      secondary: '#155E75',
    },
  },
] as const;

/**
 * 根据 ID 获取主题预设配置
 */
export const getThemePresetById = (id: string): ThemePresetConfig | undefined => {
  return THEME_PRESETS.find(preset => preset.id === id);
};

/**
 * 获取所有预设 ID
 */
export const getPresetIds = (): string[] => {
  return THEME_PRESETS.map(preset => preset.id);
};
