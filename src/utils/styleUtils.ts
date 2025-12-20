/**
 * 统一的样式工具库
 * 基于 HomeScreen 的设计系统
 * 提供可复用的卡片、列表项、按钮等样式生成器
 */

import { Theme } from '../theme';

/**
 * 生成卡片样式（HomeScreen 风格）
 * - 圆角16px，padding 16px
 * - 深色模式: elevation 0，有边框
 * - 浅色模式: elevation 2，无边框
 */
export const createCardStyle = (isDark: boolean, theme: any) => ({
  backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
  borderRadius: 16,
  padding: 16,
  marginBottom: 10,
  // 阴影效果 (iOS)
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: isDark ? 0.3 : 0.05,
  shadowRadius: 8,
  // 阴影效果 (Android)
  elevation: isDark ? 0 : 2,
  // 深色模式下加边框
  borderWidth: isDark ? 1 : 0,
  borderColor: theme?.colors?.outlineVariant || 'rgba(255,255,255,0.1)',
});

/**
 * 生成列表项样式
 * 支持未读状态、选中状态等变体
 */
export const createListItemStyle = (isDark: boolean, theme: any, variant: 'default' | 'unread' | 'highlight' = 'default') => {
  const baseStyle = createCardStyle(isDark, theme);
  
  const variants = {
    default: {},
    unread: {
      backgroundColor: theme?.colors?.surfaceContainerLow || (isDark ? '#36343B' : '#FEF7FF'),
    },
    highlight: {
      backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#2563EB' : '#DBEAFE'),
    },
  };

  return {
    ...baseStyle,
    ...variants[variant],
  };
};

/**
 * 生成标题样式（用于列表项、卡片等）
 */
export const createTitleStyle = (isDark: boolean, theme: any, isUnread: boolean = false) => ({
  fontSize: 16,
  fontWeight: isUnread ? '700' : '600',
  lineHeight: 22,
  color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
  opacity: isUnread ? 1 : 0.9,
});

/**
 * 生成副标题样式
 */
export const createSubtitleStyle = (isDark: boolean, theme: any) => ({
  fontSize: 14,
  lineHeight: 20,
  color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
  marginBottom: 10,
});

/**
 * 生成元信息样式（日期、标签等）
 */
export const createMetaTextStyle = (isDark: boolean, theme: any) => ({
  fontSize: 12,
  color: theme?.colors?.outline || (isDark ? '#938F99' : '#79747E'),
});

/**
 * 生成按钮样式
 */
export const createButtonStyle = (isDark: boolean, theme: any, variant: 'primary' | 'secondary' | 'tertiary' = 'primary') => {
  const variants = {
    primary: {
      backgroundColor: theme?.colors?.primary || '#3B82F6',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 20,
    },
    secondary: {
      backgroundColor: theme?.colors?.secondaryContainer || (isDark ? '#334155' : '#F1F5F9'),
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme?.colors?.outline || (isDark ? '#64748B' : '#94A3B8'),
    },
    tertiary: {
      backgroundColor: 'transparent',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme?.colors?.primary || '#3B82F6',
    },
  };

  return variants[variant];
};

/**
 * 生成按钮文字样式
 */
export const createButtonTextStyle = (isDark: boolean, theme: any, variant: 'primary' | 'secondary' | 'tertiary' = 'primary') => {
  const variants = {
    primary: {
      color: theme?.colors?.onPrimary || '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    secondary: {
      color: theme?.colors?.onSecondaryContainer || (isDark ? '#E2E8F0' : '#0F172A'),
      fontSize: 14,
      fontWeight: '600',
    },
    tertiary: {
      color: theme?.colors?.primary || '#3B82F6',
      fontSize: 14,
      fontWeight: '600',
    },
  };

  return variants[variant];
};

/**
 * 生成空状态样式
 */
export const createEmptyStateStyle = (isDark: boolean, theme: any) => ({
  container: {
    flex: 1,
    justifyContent: 'center' as any,
    alignItems: 'center' as any,
    paddingTop: 100,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme?.colors?.surfaceContainerHighest || (isDark ? '#36343B' : '#F2F0F4'),
    justifyContent: 'center' as any,
    alignItems: 'center' as any,
    marginBottom: 24,
  },
  text: {
    fontSize: 16,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginBottom: 24,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: theme?.colors?.primaryContainer,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600' as any,
    color: theme?.colors?.onPrimaryContainer,
  },
});

/**
 * 生成统计卡片样式
 */
export const createStatCardStyle = (isDark: boolean, theme: any) => ({
  card: {
    ...createCardStyle(isDark, theme),
    marginHorizontal: 8,
    marginBottom: 16,
    paddingVertical: 20,
    alignItems: 'center' as any,
  },
  number: {
    fontSize: 24,
    fontWeight: '700',
    color: theme?.colors?.primary || '#3B82F6',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
    textAlign: 'center' as any,
  },
});

/**
 * 生成分割线样式
 */
export const createDividerStyle = (isDark: boolean, theme: any) => ({
  height: 1,
  backgroundColor: theme?.colors?.outlineVariant || (isDark ? '#49454F' : '#E6E0E9'),
  marginVertical: 16,
});

/**
 * 生成未读点样式
 */
export const createUnreadDotStyle = (theme: any) => ({
  width: 8,
  height: 8,
  borderRadius: 4,
  backgroundColor: theme?.colors?.primary || '#3B82F6',
  marginTop: 6,
  marginRight: 8,
});

/**
 * 生成徽章样式
 */
export const createBadgeStyle = (isDark: boolean, theme: any, variant: 'primary' | 'secondary' | 'success' | 'error' | 'warning' = 'primary') => {
  const variants = {
    primary: {
      backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#2563EB' : '#DBEAFE'),
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    secondary: {
      backgroundColor: theme?.colors?.secondaryContainer || (isDark ? '#334155' : '#F1F5F9'),
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    success: {
      backgroundColor: '#D4EDDA',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    error: {
      backgroundColor: theme?.colors?.errorContainer || '#FEE2E2',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    warning: {
      backgroundColor: '#FFF3CD',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
  };

  return variants[variant];
};

/**
 * 生成徽章文字样式
 */
export const createBadgeTextStyle = (isDark: boolean, theme: any, variant: 'primary' | 'secondary' | 'success' | 'error' | 'warning' = 'primary') => {
  const variants = {
    primary: {
      color: theme?.colors?.onPrimaryContainer || '#1E3A8A',
      fontSize: 12,
      fontWeight: '500' as any,
    },
    secondary: {
      color: theme?.colors?.onSecondaryContainer || (isDark ? '#E2E8F0' : '#0F172A'),
      fontSize: 12,
      fontWeight: '500' as any,
    },
    success: {
      color: '#155724',
      fontSize: 12,
      fontWeight: '500' as any,
    },
    error: {
      color: theme?.colors?.onErrorContainer || '#991B1B',
      fontSize: 12,
      fontWeight: '500' as any,
    },
    warning: {
      color: '#856404',
      fontSize: 12,
      fontWeight: '500' as any,
    },
  };

  return variants[variant];
};

export default {
  createCardStyle,
  createListItemStyle,
  createTitleStyle,
  createSubtitleStyle,
  createMetaTextStyle,
  createButtonStyle,
  createButtonTextStyle,
  createEmptyStateStyle,
  createStatCardStyle,
  createDividerStyle,
  createUnreadDotStyle,
  createBadgeStyle,
  createBadgeTextStyle,
};
