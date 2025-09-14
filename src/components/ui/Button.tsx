import React from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TouchableOpacityProps,
} from 'react-native';
import { useTheme } from '../../theme';
import type { Theme } from '../../theme';

// 按钮变体类型
export type ButtonVariant = 'filled' | 'outlined' | 'text' | 'elevated' | 'tonal';

// 按钮尺寸类型
export type ButtonSize = 'small' | 'medium' | 'large';

// 按钮属性接口
export interface ButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  /** 按钮文本 */
  title: string;
  /** 按钮变体 */
  variant?: ButtonVariant;
  /** 按钮尺寸 */
  size?: ButtonSize;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否显示加载状态 */
  loading?: boolean;
  /** 左侧图标 */
  leftIcon?: React.ReactNode;
  /** 右侧图标 */
  rightIcon?: React.ReactNode;
  /** 自定义样式 */
  style?: ViewStyle;
  /** 自定义文本样式 */
  textStyle?: TextStyle;
  /** 是否全宽 */
  fullWidth?: boolean;
}

// 创建按钮样式
const createButtonStyles = (theme: Theme) => {
  return StyleSheet.create({
    // 基础按钮样式
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20, // Material Design 3 规范圆角
      paddingHorizontal: 24, // 增加水平内边距
      paddingVertical: 10, // 调整垂直内边距
      minHeight: 40, // Material Design 3 标准高度
    },
    
    // 全宽样式
    fullWidth: {
      width: '100%',
    },
    
    // 禁用样式
    disabled: {
      opacity: 0.38,
    },
    
    // 尺寸样式 - Material Design 3 规范
    small: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      minHeight: 32,
      borderRadius: 16,
    },
    
    medium: {
      paddingHorizontal: 24,
      paddingVertical: 10,
      minHeight: 40,
      borderRadius: 20,
    },
    
    large: {
      paddingHorizontal: 32,
      paddingVertical: 14,
      minHeight: 48,
      borderRadius: 24,
    },
    
    // 变体样式
    filled: {
      backgroundColor: theme.colors.primary,
      ...theme.elevation.level1,
    },
    
    outlined: {
      backgroundColor: 'transparent',
      
    },
    
    text: {
      backgroundColor: 'transparent',
    },
    
    elevated: {
      backgroundColor: theme.colors.surface,
      ...theme.elevation.level2,
    },
    
    tonal: {
      backgroundColor: theme.colors.secondaryContainer,
    },
    
    // 文本样式
    textBase: {
      fontFamily: theme.typography.labelLarge.fontFamily,
      fontSize: theme.typography.labelLarge.fontSize,
      fontWeight: theme.typography.labelLarge.fontWeight,
      lineHeight: theme.typography.labelLarge.lineHeight,
      textAlign: 'center',
    },
    
    textFilled: {
      color: theme.colors.onPrimary,
    },
    
    textOutlined: {
      color: theme.colors.primary,
    },
    
    textText: {
      color: theme.colors.primary,
    },
    
    textElevated: {
      color: theme.colors.primary,
    },
    
    textTonal: {
      color: theme.colors.onSecondaryContainer,
    },
    
    // 小尺寸文本
    textSmall: {
      fontSize: theme.typography.labelMedium.fontSize,
      lineHeight: theme.typography.labelMedium.lineHeight,
    },
    
    // 大尺寸文本
    textLarge: {
      fontSize: theme.typography.labelLarge.fontSize,
      lineHeight: theme.typography.labelLarge.lineHeight,
    },
    
    // 图标容器
    iconContainer: {
      marginHorizontal: theme.spacing.xs,
    },
    
    leftIconContainer: {
      marginRight: theme.spacing.sm,
      marginLeft: 0,
    },
    
    rightIconContainer: {
      marginLeft: theme.spacing.sm,
      marginRight: 0,
    },
    
    // 加载指示器
    loadingContainer: {
      marginRight: theme.spacing.sm,
    },
  });
};

// 按钮组件
export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'filled',
  size = 'medium',
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
  fullWidth = false,
  onPress,
  ...props
}) => {
  const theme = useTheme();
  const styles = createButtonStyles(theme);
  
  // 处理按钮按下事件
  const handlePress = (event: any) => {
    if (disabled || loading) return;
    onPress?.(event);
  };
  
  // 获取按钮样式
  const getButtonStyle = (): ViewStyle[] => {
    const baseStyles = [styles.base, styles[size], styles[variant]];
    
    if (fullWidth) {
      baseStyles.push(styles.fullWidth);
    }
    
    if (disabled) {
      baseStyles.push(styles.disabled);
    }
    
    if (style) {
      baseStyles.push(style);
    }
    
    return baseStyles;
  };
  
  // 获取文本样式
  const getTextStyle = (): TextStyle[] => {
    const baseStyles = [
      styles.textBase,
      styles[`text${variant.charAt(0).toUpperCase() + variant.slice(1)}` as keyof typeof styles],
    ];
    
    if (size === 'small') {
      baseStyles.push(styles.textSmall);
    } else if (size === 'large') {
      baseStyles.push(styles.textLarge);
    }
    
    if (textStyle) {
      baseStyles.push(textStyle);
    }
    
    return baseStyles;
  };
  
  return (
    <TouchableOpacity
      style={getButtonStyle()}
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      {...props}
    >
      {/* 加载指示器 */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="small"
            color={variant === 'filled' ? theme.colors.onPrimary : theme.colors.primary}
          />
        </View>
      )}
      
      {/* 左侧图标 */}
      {leftIcon && !loading && (
        <View style={[styles.iconContainer, styles.leftIconContainer]}>
          {leftIcon}
        </View>
      )}
      
      {/* 按钮文本 */}
      <Text style={getTextStyle()}>
        {title}
      </Text>
      
      {/* 右侧图标 */}
      {rightIcon && (
        <View style={[styles.iconContainer, styles.rightIconContainer]}>
          {rightIcon}
        </View>
      )}
    </TouchableOpacity>
  );
};

// 预设按钮组件
export const PrimaryButton: React.FC<Omit<ButtonProps, 'variant'>> = (props) => (
  <Button variant="filled" {...props} />
);

export const SecondaryButton: React.FC<Omit<ButtonProps, 'variant'>> = (props) => (
  <Button variant="outlined" {...props} />
);

export const TextButton: React.FC<Omit<ButtonProps, 'variant'>> = (props) => (
  <Button variant="text" {...props} />
);

export const ElevatedButton: React.FC<Omit<ButtonProps, 'variant'>> = (props) => (
  <Button variant="elevated" {...props} />
);

export const TonalButton: React.FC<Omit<ButtonProps, 'variant'>> = (props) => (
  <Button variant="tonal" {...props} />
);

export default Button;