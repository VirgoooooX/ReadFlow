/**
 * 统一的样式工具库
 * 基于 HomeScreen 的设计系统
 * 提供可复用的卡片、列表项、按钮等样式生成器
 */

import { Theme } from '../theme';
import { withAlpha } from './colorUtils';

/**
 * 生成卡片样式（HomeScreen 风格）
 * - 圆角16px，padding 16px
 * - 深色模式: elevation 0，有边框
 * - 浅色模式: elevation 2，无边框
 */
export const createCardStyle = (theme: Theme) => ({
  backgroundColor: theme.colors.surface,
  borderRadius: 16,
  padding: 16,
  marginBottom: 10,
  // 阴影效果 (iOS)
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: theme.isDark ? 0.4 : 0.05,
  shadowRadius: 8,
  // 阴影效果 (Android)
  elevation: 2,
  // 深色模式下加边框
  borderWidth: 1,
  borderColor: theme.isDark ? theme.colors.outlineVariant : 'transparent',
});

/**
 * 生成列表项样式
 * 支持未读状态、选中状态等变体
 */
export const createListItemStyle = (theme: Theme, variant: 'default' | 'unread' | 'highlight' = 'default') => {
  const baseStyle = createCardStyle(theme);

  const variants = {
    default: {},
    unread: {
      backgroundColor: theme.colors.surfaceContainerLow,
    },
    highlight: {
      backgroundColor: theme.colors.primaryContainer,
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
export const createTitleStyle = (theme: Theme, isUnread: boolean = false) => ({
  fontSize: 16,
  fontWeight: isUnread ? '700' : '600',
  lineHeight: 22,
  color: theme.colors.onSurface,
  opacity: isUnread ? 1 : 0.9,
});

/**
 * 生成副标题样式
 */
export const createSubtitleStyle = (theme: Theme) => ({
  fontSize: 14,
  lineHeight: 20,
  color: theme.colors.onSurfaceVariant,
  marginBottom: 10,
});

/**
 * 生成元信息样式（日期、标签等）
 */
export const createMetaTextStyle = (theme: Theme) => ({
  fontSize: 12,
  color: theme.colors.outline,
});

/**
 * 生成按钮样式
 */
export const createButtonStyle = (theme: Theme, variant: 'primary' | 'secondary' | 'tertiary' = 'primary') => {
  const variants = {
    primary: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 20,
    },
    secondary: {
      backgroundColor: theme.colors.secondaryContainer,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.outline,
    },
    tertiary: {
      backgroundColor: 'transparent',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.primary,
    },
  };

  return variants[variant];
};

/**
 * 生成按钮文字样式
 */
export const createButtonTextStyle = (theme: Theme, variant: 'primary' | 'secondary' | 'tertiary' = 'primary') => {
  const variants = {
    primary: {
      color: theme.colors.onPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    secondary: {
      color: theme.colors.onSecondaryContainer,
      fontSize: 14,
      fontWeight: '600',
    },
    tertiary: {
      color: theme.colors.primary,
      fontSize: 14,
      fontWeight: '600',
    },
  };

  return variants[variant];
};

/**
 * 生成空状态样式
 */
export const createEmptyStateStyle = (theme: Theme) => ({
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
    backgroundColor: theme.colors.surfaceContainerHighest,
    justifyContent: 'center' as any,
    alignItems: 'center' as any,
    marginBottom: 24,
  },
  text: {
    fontSize: 16,
    color: theme.colors.onSurfaceVariant,
    marginBottom: 24,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: theme.colors.primaryContainer,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600' as any,
    color: theme.colors.onPrimaryContainer,
  },
});

/**
 * 生成统计卡片样式
 */
export const createStatCardStyle = (theme: Theme) => ({
  card: {
    ...createCardStyle(theme),
    marginHorizontal: 8,
    marginBottom: 16,
    paddingVertical: 20,
    alignItems: 'center' as any,
  },
  number: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center' as any,
  },
});

/**
 * 生成分割线样式
 */
export const createDividerStyle = (theme: Theme) => ({
  height: 1,
  backgroundColor: theme.colors.outlineVariant,
  marginVertical: 16,
});

/**
 * 生成未读点样式
 */
export const createUnreadDotStyle = (theme: Theme) => ({
  width: 8,
  height: 8,
  borderRadius: 4,
  backgroundColor: theme.colors.primary,
  marginTop: 6,
  marginRight: 8,
});

/**
 * 生成徽章样式
 */
export const createBadgeStyle = (theme: Theme, variant: 'primary' | 'secondary' | 'success' | 'error' | 'warning' = 'primary') => {
  const variants = {
    primary: {
      backgroundColor: theme.colors.primaryContainer,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    secondary: {
      backgroundColor: theme.colors.secondaryContainer,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    success: {
      backgroundColor: withAlpha(theme.semantic.success, theme.isDark ? 0.22 : 0.16),
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    error: {
      backgroundColor: theme.colors.errorContainer,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    warning: {
      backgroundColor: withAlpha(theme.semantic.warning, theme.isDark ? 0.22 : 0.16),
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
export const createBadgeTextStyle = (theme: Theme, variant: 'primary' | 'secondary' | 'success' | 'error' | 'warning' = 'primary') => {
  const variants = {
    primary: {
      color: theme.colors.onPrimaryContainer,
      fontSize: 12,
      fontWeight: '500' as any,
    },
    secondary: {
      color: theme.colors.onSecondaryContainer,
      fontSize: 12,
      fontWeight: '500' as any,
    },
    success: {
      color: theme.semantic.success,
      fontSize: 12,
      fontWeight: '500' as any,
    },
    error: {
      color: theme.colors.onErrorContainer,
      fontSize: 12,
      fontWeight: '500' as any,
    },
    warning: {
      color: theme.semantic.warning,
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
