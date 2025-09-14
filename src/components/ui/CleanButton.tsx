import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  View,
} from 'react-native';
import { useTheme } from '../../theme';
import type { Theme } from '../../theme';

// 按钮变体类型
export type CleanButtonVariant = 'filled' | 'outlined' | 'text';
export type CleanButtonSize = 'small' | 'medium' | 'large';

// 按钮属性接口
export interface CleanButtonProps {
  /** 按钮文本 */
  title: string;
  /** 按钮变体 */
  variant?: CleanButtonVariant;
  /** 按钮尺寸 */
  size?: CleanButtonSize;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否显示加载状态 */
  loading?: boolean;
  /** 点击事件 */
  onPress?: () => void;
  /** 自定义样式 */
  style?: ViewStyle;
  /** 文本样式 */
  textStyle?: TextStyle;
  /** 测试ID */
  testID?: string;
}

// 创建按钮样式 - 完全符合Material Design 3规范
const createCleanButtonStyles = (theme: Theme) => {
  return StyleSheet.create({
    // 基础样式
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20, // MD3标准圆角
      paddingHorizontal: 24,
      paddingVertical: 10,
      minHeight: 40,
    },
    
    // 尺寸变体
    small: {
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 6,
      minHeight: 32,
    },
    
    medium: {
      borderRadius: 20,
      paddingHorizontal: 24,
      paddingVertical: 10,
      minHeight: 40,
    },
    
    large: {
      borderRadius: 24,
      paddingHorizontal: 32,
      paddingVertical: 14,
      minHeight: 48,
    },
    
    // 变体样式
    filled: {
      backgroundColor: theme.colors.primary,
      elevation: 1,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
    },
    
    outlined: {
      backgroundColor: 'transparent',
      
    },
    
    text: {
      backgroundColor: 'transparent',
    },
    
    // 禁用状态
    disabled: {
      opacity: 0.38,
    },
    
    // 文本样式
    textFilled: {
      color: theme.colors.onPrimary,
      fontSize: 14,
      fontWeight: '500',
      lineHeight: 20,
    },
    
    textOutlined: {
      color: theme.colors.primary,
      fontSize: 14,
      fontWeight: '500',
      lineHeight: 20,
    },
    
    textText: {
      color: theme.colors.primary,
      fontSize: 14,
      fontWeight: '500',
      lineHeight: 20,
    },
    
    // 加载容器
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    
    loadingText: {
      marginLeft: 8,
    },
  });
};

// CleanButton组件
export const CleanButton: React.FC<CleanButtonProps> = ({
  title,
  variant = 'filled',
  size = 'medium',
  disabled = false,
  loading = false,
  onPress,
  style,
  textStyle,
  testID,
}) => {
  const theme = useTheme();
  const styles = createCleanButtonStyles(theme);
  
  const buttonStyle = [
    styles.base,
    styles[size],
    styles[variant],
    disabled && styles.disabled,
    style,
  ];
  
  const textStyleCombined = [
    styles[`text${variant.charAt(0).toUpperCase() + variant.slice(1)}` as keyof typeof styles],
    textStyle,
  ];
  
  const handlePress = () => {
    if (!disabled && !loading && onPress) {
      onPress();
    }
  };
  
  return (
    <TouchableOpacity
      style={buttonStyle}
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      testID={testID}
    >
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="small"
            color={variant === 'filled' ? theme.colors.onPrimary : theme.colors.primary}
          />
          <Text style={[textStyleCombined, styles.loadingText]}>{title}</Text>
        </View>
      ) : (
        <Text style={textStyleCombined}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

// 预定义变体组件
export const FilledButton: React.FC<Omit<CleanButtonProps, 'variant'>> = (props) => (
  <CleanButton variant="filled" {...props} />
);

export const OutlinedButton: React.FC<Omit<CleanButtonProps, 'variant'>> = (props) => (
  <CleanButton variant="outlined" {...props} />
);

export const TextButton: React.FC<Omit<CleanButtonProps, 'variant'>> = (props) => (
  <CleanButton variant="text" {...props} />
);

export default CleanButton;