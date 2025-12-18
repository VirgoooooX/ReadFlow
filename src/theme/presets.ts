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
    name: '蓝色主题',
    colors: {
      primary: '#1976D2',
      secondary: '#1565C0',
    },
  },
  {
    id: 'green',
    name: '绿色主题',
    colors: {
      primary: '#388E3C',
      secondary: '#2E7D32',
    },
  },
  {
    id: 'orange',
    name: '橙色主题',
    colors: {
      primary: '#F57C00',
      secondary: '#EF6C00',
    },
  },
  {
    id: 'purple',
    name: '紫色主题',
    colors: {
      primary: '#7B1FA2',
      secondary: '#6A1B9A',
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
