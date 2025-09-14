import React, { useState } from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TextInputProps,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '../../theme';
import type { Theme } from '../../theme';

// 输入框变体类型
export type CleanInputVariant = 'filled' | 'outlined';
export type CleanInputSize = 'small' | 'medium' | 'large';

// 输入框属性接口
export interface CleanInputProps extends Omit<TextInputProps, 'style'> {
  /** 输入框变体 */
  variant?: CleanInputVariant;
  /** 输入框尺寸 */
  size?: CleanInputSize;
  /** 标签文本 */
  label?: string;
  /** 辅助文本 */
  helperText?: string;
  /** 错误文本 */
  errorText?: string;
  /** 是否显示错误状态 */
  error?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 左侧图标 */
  leftIcon?: React.ReactNode;
  /** 右侧图标 */
  rightIcon?: React.ReactNode;
  /** 右侧图标点击事件 */
  onRightIconPress?: () => void;
  /** 容器样式 */
  containerStyle?: ViewStyle;
  /** 输入框样式 */
  inputStyle?: TextStyle;
  /** 标签样式 */
  labelStyle?: TextStyle;
  /** 测试ID */
  testID?: string;
}

// 创建输入框样式 - 完全符合Material Design 3规范
const createCleanInputStyles = (theme: Theme) => {
  return StyleSheet.create({
    // 容器样式
    container: {
      marginVertical: 4,
    },
    
    // 标签样式
    label: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      color: theme.colors.onSurfaceVariant,
      marginBottom: 4,
    },
    
    labelError: {
      color: theme.colors.error,
    },
    
    labelDisabled: {
      color: theme.colors.onSurface,
      opacity: 0.38,
    },
    
    // 输入框容器
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      position: 'relative',
    },
    
    // 基础输入框样式
    inputBase: {
      flex: 1,
      fontSize: 16,
      lineHeight: 24,
      color: theme.colors.onSurface,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    
    // 尺寸变体
    inputSmall: {
      fontSize: 14,
      paddingVertical: 8,
      paddingHorizontal: 12,
      minHeight: 32,
    },
    
    inputMedium: {
      fontSize: 16,
      paddingVertical: 12,
      paddingHorizontal: 16,
      minHeight: 48,
    },
    
    inputLarge: {
      fontSize: 18,
      paddingVertical: 16,
      paddingHorizontal: 20,
      minHeight: 56,
    },
    
    // Filled 变体
    inputFilled: {
      backgroundColor: theme.colors.surfaceVariant,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.onSurfaceVariant,
    },
    
    inputFilledFocused: {
      borderBottomWidth: 2,
      borderBottomColor: theme.colors.primary,
    },
    
    inputFilledError: {
      borderBottomColor: theme.colors.error,
    },
    
    inputFilledDisabled: {
      backgroundColor: theme.colors.onSurface,
      opacity: 0.04,
      borderBottomColor: theme.colors.onSurface,
    },
    
    // Outlined 变体
    inputOutlined: {
      backgroundColor: 'transparent',
      
      borderRadius: 4,
    },
    
    inputOutlinedFocused: {
      backgroundColor: theme.colors.primaryContainer,
    },
    
    inputOutlinedError: {
      backgroundColor: theme.colors.errorContainer,
    },
    
    inputOutlinedDisabled: {
      opacity: 0.12,
    },
    
    // 禁用状态
    inputDisabled: {
      color: theme.colors.onSurface,
      opacity: 0.38,
    },
    
    // 图标样式
    leftIcon: {
      marginRight: 12,
      color: theme.colors.onSurfaceVariant,
    },
    
    rightIcon: {
      marginLeft: 12,
      color: theme.colors.onSurfaceVariant,
    },
    
    rightIconButton: {
      padding: 4,
    },
    
    // 辅助文本样式
    helperText: {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.onSurfaceVariant,
      marginTop: 4,
      marginHorizontal: 16,
    },
    
    errorText: {
      color: theme.colors.error,
    },
  });
};

// CleanInput组件
export const CleanInput: React.FC<CleanInputProps> = ({
  variant = 'outlined',
  size = 'medium',
  label,
  helperText,
  errorText,
  error = false,
  disabled = false,
  leftIcon,
  rightIcon,
  onRightIconPress,
  containerStyle,
  inputStyle,
  labelStyle,
  testID,
  onFocus,
  onBlur,
  ...props
}) => {
  const theme = useTheme();
  const styles = createCleanInputStyles(theme);
  const [isFocused, setIsFocused] = useState(false);
  
  const handleFocus = (e: any) => {
    setIsFocused(true);
    onFocus?.(e);
  };
  
  const handleBlur = (e: any) => {
    setIsFocused(false);
    onBlur?.(e);
  };
  
  const getInputContainerStyle = () => {
    const baseStyle = [styles.inputContainer];
    
    if (variant === 'filled') {
      baseStyle.push(styles.inputFilled);
      if (isFocused) baseStyle.push(styles.inputFilledFocused);
      if (error) baseStyle.push(styles.inputFilledError);
      if (disabled) baseStyle.push(styles.inputFilledDisabled);
    } else {
      baseStyle.push(styles.inputOutlined);
      if (isFocused) baseStyle.push(styles.inputOutlinedFocused);
      if (error) baseStyle.push(styles.inputOutlinedError);
      if (disabled) baseStyle.push(styles.inputOutlinedDisabled);
    }
    
    return baseStyle;
  };
  
  const getInputStyle = () => {
    return [
      styles.inputBase,
      styles[`input${size.charAt(0).toUpperCase() + size.slice(1)}`],
      disabled && styles.inputDisabled,
      inputStyle,
    ];
  };
  
  const getLabelStyle = () => {
    return [
      styles.label,
      error && styles.labelError,
      disabled && styles.labelDisabled,
      labelStyle,
    ];
  };
  
  const displayHelperText = error && errorText ? errorText : helperText;
  
  return (
    <View style={[styles.container, containerStyle]} testID={testID}>
      {label && (
        <Text style={getLabelStyle()}>
          {label}
        </Text>
      )}
      
      <View style={getInputContainerStyle()}>
        {leftIcon && (
          <View style={styles.leftIcon}>
            {leftIcon}
          </View>
        )}
        
        <TextInput
          style={getInputStyle()}
          editable={!disabled}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          {...props}
        />
        
        {rightIcon && (
          onRightIconPress ? (
            <TouchableOpacity
              style={[styles.rightIcon, styles.rightIconButton]}
              onPress={onRightIconPress}
              disabled={disabled}
            >
              {rightIcon}
            </TouchableOpacity>
          ) : (
            <View style={styles.rightIcon}>
              {rightIcon}
            </View>
          )
        )}
      </View>
      
      {displayHelperText && (
        <Text style={[styles.helperText, error && styles.errorText]}>
          {displayHelperText}
        </Text>
      )}
    </View>
  );
};

// 预定义变体组件
export const FilledInput: React.FC<Omit<CleanInputProps, 'variant'>> = (props) => (
  <CleanInput variant="filled" {...props} />
);

export const OutlinedInput: React.FC<Omit<CleanInputProps, 'variant'>> = (props) => (
  <CleanInput variant="outlined" {...props} />
);

export default CleanInput;