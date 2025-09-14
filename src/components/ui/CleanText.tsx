import React from 'react';
import {
  Text,
  StyleSheet,
  TextStyle,
  TextProps,
} from 'react-native';
import { useTheme } from '../../theme';
import type { Theme } from '../../theme';

// Material Design 3 字体角色
export type CleanTextVariant = 
  | 'displayLarge'
  | 'displayMedium'
  | 'displaySmall'
  | 'headlineLarge'
  | 'headlineMedium'
  | 'headlineSmall'
  | 'titleLarge'
  | 'titleMedium'
  | 'titleSmall'
  | 'bodyLarge'
  | 'bodyMedium'
  | 'bodySmall'
  | 'labelLarge'
  | 'labelMedium'
  | 'labelSmall';

// 文本颜色角色
export type CleanTextColor = 
  | 'primary'
  | 'onPrimary'
  | 'secondary'
  | 'onSecondary'
  | 'tertiary'
  | 'onTertiary'
  | 'error'
  | 'onError'
  | 'surface'
  | 'onSurface'
  | 'onSurfaceVariant'
  | 'outline'
  | 'outlineVariant';

// 文本属性接口
export interface CleanTextProps extends Omit<TextProps, 'style'> {
  /** 文本内容 */
  children: React.ReactNode;
  /** 字体变体 */
  variant?: CleanTextVariant;
  /** 文本颜色 */
  color?: CleanTextColor;
  /** 自定义样式 */
  style?: TextStyle;
  /** 测试ID */
  testID?: string;
}

// 创建文本样式 - 完全符合Material Design 3规范
const createCleanTextStyles = (theme: Theme) => {
  return StyleSheet.create({
    // Display 角色
    displayLarge: {
      fontSize: 57,
      lineHeight: 64,
      fontWeight: '400',
      letterSpacing: -0.25,
    },
    
    displayMedium: {
      fontSize: 45,
      lineHeight: 52,
      fontWeight: '400',
      letterSpacing: 0,
    },
    
    displaySmall: {
      fontSize: 36,
      lineHeight: 44,
      fontWeight: '400',
      letterSpacing: 0,
    },
    
    // Headline 角色
    headlineLarge: {
      fontSize: 32,
      lineHeight: 40,
      fontWeight: '400',
      letterSpacing: 0,
    },
    
    headlineMedium: {
      fontSize: 28,
      lineHeight: 36,
      fontWeight: '400',
      letterSpacing: 0,
    },
    
    headlineSmall: {
      fontSize: 24,
      lineHeight: 32,
      fontWeight: '400',
      letterSpacing: 0,
    },
    
    // Title 角色
    titleLarge: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '400',
      letterSpacing: 0,
    },
    
    titleMedium: {
      fontSize: 16,
      lineHeight: 24,
      fontWeight: '500',
      letterSpacing: 0.15,
    },
    
    titleSmall: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
      letterSpacing: 0.1,
    },
    
    // Body 角色
    bodyLarge: {
      fontSize: 16,
      lineHeight: 24,
      fontWeight: '400',
      letterSpacing: 0.5,
    },
    
    bodyMedium: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '400',
      letterSpacing: 0.25,
    },
    
    bodySmall: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '400',
      letterSpacing: 0.4,
    },
    
    // Label 角色
    labelLarge: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
      letterSpacing: 0.1,
    },
    
    labelMedium: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      letterSpacing: 0.5,
    },
    
    labelSmall: {
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '500',
      letterSpacing: 0.5,
    },
  });
};

// 获取颜色值
const getTextColor = (theme: Theme, color?: CleanTextColor): string => {
  if (!color) return theme.colors.onSurface;
  
  const colorMap: Record<CleanTextColor, string> = {
    primary: theme.colors.primary,
    onPrimary: theme.colors.onPrimary,
    secondary: theme.colors.secondary,
    onSecondary: theme.colors.onSecondary,
    tertiary: theme.colors.tertiary,
    onTertiary: theme.colors.onTertiary,
    error: theme.colors.error,
    onError: theme.colors.onError,
    surface: theme.colors.surface,
    onSurface: theme.colors.onSurface,
    onSurfaceVariant: theme.colors.onSurfaceVariant,
    outline: theme.colors.outline,
    outlineVariant: theme.colors.outlineVariant,
  };
  
  return colorMap[color];
};

// CleanText组件
export const CleanText: React.FC<CleanTextProps> = ({
  children,
  variant = 'bodyMedium',
  color,
  style,
  testID,
  ...props
}) => {
  const theme = useTheme();
  const styles = createCleanTextStyles(theme);
  
  const textStyle = [
    styles[variant],
    { color: getTextColor(theme, color) },
    style,
  ];
  
  return (
    <Text style={textStyle} testID={testID} {...props}>
      {children}
    </Text>
  );
};

// 预定义组件
export const DisplayLarge: React.FC<Omit<CleanTextProps, 'variant'>> = (props) => (
  <CleanText variant="displayLarge" {...props} />
);

export const DisplayMedium: React.FC<Omit<CleanTextProps, 'variant'>> = (props) => (
  <CleanText variant="displayMedium" {...props} />
);

export const DisplaySmall: React.FC<Omit<CleanTextProps, 'variant'>> = (props) => (
  <CleanText variant="displaySmall" {...props} />
);

export const HeadlineLarge: React.FC<Omit<CleanTextProps, 'variant'>> = (props) => (
  <CleanText variant="headlineLarge" {...props} />
);

export const HeadlineMedium: React.FC<Omit<CleanTextProps, 'variant'>> = (props) => (
  <CleanText variant="headlineMedium" {...props} />
);

export const HeadlineSmall: React.FC<Omit<CleanTextProps, 'variant'>> = (props) => (
  <CleanText variant="headlineSmall" {...props} />
);

export const TitleLarge: React.FC<Omit<CleanTextProps, 'variant'>> = (props) => (
  <CleanText variant="titleLarge" {...props} />
);

export const TitleMedium: React.FC<Omit<CleanTextProps, 'variant'>> = (props) => (
  <CleanText variant="titleMedium" {...props} />
);

export const TitleSmall: React.FC<Omit<CleanTextProps, 'variant'>> = (props) => (
  <CleanText variant="titleSmall" {...props} />
);

export const BodyLarge: React.FC<Omit<CleanTextProps, 'variant'>> = (props) => (
  <CleanText variant="bodyLarge" {...props} />
);

export const BodyMedium: React.FC<Omit<CleanTextProps, 'variant'>> = (props) => (
  <CleanText variant="bodyMedium" {...props} />
);

export const BodySmall: React.FC<Omit<CleanTextProps, 'variant'>> = (props) => (
  <CleanText variant="bodySmall" {...props} />
);

export const LabelLarge: React.FC<Omit<CleanTextProps, 'variant'>> = (props) => (
  <CleanText variant="labelLarge" {...props} />
);

export const LabelMedium: React.FC<Omit<CleanTextProps, 'variant'>> = (props) => (
  <CleanText variant="labelMedium" {...props} />
);

export const LabelSmall: React.FC<Omit<CleanTextProps, 'variant'>> = (props) => (
  <CleanText variant="labelSmall" {...props} />
);

export default CleanText;