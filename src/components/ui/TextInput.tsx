import React, { useState, forwardRef } from 'react';
import {
  TextInput as RNTextInput,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TextInputProps as RNTextInputProps,
  Animated,
} from 'react-native';
import { useTheme } from '../../theme';
import type { Theme } from '../../theme';

// 输入框变体类型
export type TextInputVariant = 'filled' | 'outlined';

// 输入框尺寸类型
export type TextInputSize = 'small' | 'medium' | 'large';

// 输入框属性接口
export interface TextInputProps extends Omit<RNTextInputProps, 'style'> {
  /** 标签文本 */
  label?: string;
  /** 输入框变体 */
  variant?: TextInputVariant;
  /** 输入框尺寸 */
  size?: TextInputSize;
  /** 错误信息 */
  error?: string;
  /** 帮助文本 */
  helperText?: string;
  /** 是否必填 */
  required?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 左侧图标 */
  leftIcon?: React.ReactNode;
  /** 右侧图标 */
  rightIcon?: React.ReactNode;
  /** 是否显示清除按钮 */
  clearable?: boolean;
  /** 自定义容器样式 */
  containerStyle?: ViewStyle;
  /** 自定义输入框样式 */
  inputStyle?: TextStyle;
  /** 自定义标签样式 */
  labelStyle?: TextStyle;
  /** 是否多行 */
  multiline?: boolean;
  /** 多行时的行数 */
  numberOfLines?: number;
}

// 创建输入框样式
const createTextInputStyles = (theme: Theme) => {
  return StyleSheet.create({
    // 容器样式
    container: {
      marginVertical: theme.spacing.xs,
    },
    
    // 输入框容器
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: theme.componentSpacing.input.borderRadius,
      paddingHorizontal: theme.componentSpacing.input.paddingHorizontal,
      minHeight: theme.componentSpacing.input.minHeight,
    },
    
    // 变体样式
    filled: {
      backgroundColor: theme.colors.surfaceVariant,
      borderBottomWidth: 2,
      borderBottomColor: theme.colors.outline,
    },
    
    filledFocused: {
      borderBottomColor: theme.colors.primary,
    },
    
    filledError: {
      borderBottomColor: theme.colors.error,
    },
    
    outlined: {
      backgroundColor: 'transparent',
      
    },
    
    outlinedFocused: {
      backgroundColor: theme.colors.primaryContainer,
    },
    
    outlinedError: {
      backgroundColor: theme.colors.errorContainer,
    },
    
    // 尺寸样式
    small: {
      minHeight: theme.sizes.input.sm.height,
      paddingHorizontal: theme.spacing.sm,
    },
    
    medium: {
      minHeight: theme.sizes.input.md.height,
      paddingHorizontal: theme.spacing.md,
    },
    
    large: {
      minHeight: theme.sizes.input.lg.height,
      paddingHorizontal: theme.spacing.lg,
    },
    
    // 禁用样式
    disabled: {
      opacity: 0.38,
      backgroundColor: theme.colors.surfaceVariant,
    },
    
    // 输入框样式
    input: {
      flex: 1,
      fontFamily: theme.typography.bodyLarge.fontFamily,
      fontSize: theme.typography.bodyLarge.fontSize,
      lineHeight: theme.typography.bodyLarge.lineHeight,
      color: theme.colors.onSurface,
      paddingVertical: theme.spacing.sm,
    },
    
    inputSmall: {
      fontSize: theme.typography.bodyMedium.fontSize,
      lineHeight: theme.typography.bodyMedium.lineHeight,
    },
    
    inputLarge: {
      fontSize: theme.typography.bodyLarge.fontSize,
      lineHeight: theme.typography.bodyLarge.lineHeight,
    },
    
    inputMultiline: {
      textAlignVertical: 'top',
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.sm,
    },
    
    // 标签样式
    label: {
      fontFamily: theme.typography.bodyMedium.fontFamily,
      fontSize: theme.typography.bodyMedium.fontSize,
      color: theme.colors.onSurfaceVariant,
      marginBottom: theme.spacing.xs,
    },
    
    labelRequired: {
      color: theme.colors.error,
    },
    
    labelFocused: {
      color: theme.colors.primary,
    },
    
    labelError: {
      color: theme.colors.error,
    },
    
    // 图标容器
    iconContainer: {
      padding: theme.spacing.xs,
    },
    
    leftIconContainer: {
      marginRight: theme.spacing.sm,
    },
    
    rightIconContainer: {
      marginLeft: theme.spacing.sm,
    },
    
    // 清除按钮
    clearButton: {
      padding: theme.spacing.xs,
      marginLeft: theme.spacing.xs,
    },
    
    // 帮助文本和错误信息
    helperText: {
      fontFamily: theme.typography.bodySmall.fontFamily,
      fontSize: theme.typography.bodySmall.fontSize,
      color: theme.colors.onSurfaceVariant,
      marginTop: theme.spacing.xs,
      marginHorizontal: theme.spacing.md,
    },
    
    errorText: {
      color: theme.colors.error,
    },
  });
};

// 输入框组件
export const TextInput = forwardRef<RNTextInput, TextInputProps>((
  {
    label,
    variant = 'outlined',
    size = 'medium',
    error,
    helperText,
    required = false,
    disabled = false,
    leftIcon,
    rightIcon,
    clearable = false,
    containerStyle,
    inputStyle,
    labelStyle,
    multiline = false,
    numberOfLines = 1,
    value,
    onChangeText,
    onFocus,
    onBlur,
    ...props
  },
  ref
) => {
  const theme = useTheme();
  const styles = createTextInputStyles(theme);
  const [isFocused, setIsFocused] = useState(false);
  const [animatedValue] = useState(new Animated.Value(0));
  
  // 处理焦点事件
  const handleFocus = (event: any) => {
    setIsFocused(true);
    Animated.timing(animatedValue, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
    onFocus?.(event);
  };
  
  const handleBlur = (event: any) => {
    setIsFocused(false);
    Animated.timing(animatedValue, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
    onBlur?.(event);
  };
  
  // 处理清除按钮
  const handleClear = () => {
    onChangeText?.('');
  };
  
  // 获取容器样式
  const getContainerStyle = (): ViewStyle[] => {
    const baseStyles: ViewStyle[] = [
      styles.inputContainer as ViewStyle,
      styles[variant] as ViewStyle,
      styles[size] as ViewStyle,
    ];
    
    if (isFocused) {
      baseStyles.push(styles[`${variant}Focused` as keyof typeof styles] as ViewStyle);
    }
    
    if (error) {
      baseStyles.push(styles[`${variant}Error` as keyof typeof styles] as ViewStyle);
    }
    
    if (disabled) {
      baseStyles.push(styles.disabled as ViewStyle);
    }
    
    if (multiline) {
      baseStyles.push({ minHeight: (numberOfLines || 1) * 24 + theme.spacing.md * 2 });
    }
    
    return baseStyles;
  };
  
  // 获取输入框样式
  const getInputStyle = (): TextStyle[] => {
    const baseStyles: TextStyle[] = [styles.input as TextStyle];
    
    if (size === 'small') {
      baseStyles.push(styles.inputSmall as TextStyle);
    } else if (size === 'large') {
      baseStyles.push(styles.inputLarge as TextStyle);
    }
    
    if (multiline) {
      baseStyles.push(styles.inputMultiline as TextStyle);
    }
    
    if (inputStyle) {
      baseStyles.push(inputStyle);
    }
    
    return baseStyles;
  };
  
  // 获取标签样式
  const getLabelStyle = (): TextStyle[] => {
    const baseStyles: TextStyle[] = [styles.label as TextStyle];
    
    if (required) {
      baseStyles.push(styles.labelRequired as TextStyle);
    }
    
    if (isFocused) {
      baseStyles.push(styles.labelFocused as TextStyle);
    }
    
    if (error) {
      baseStyles.push(styles.labelError as TextStyle);
    }
    
    if (labelStyle) {
      baseStyles.push(labelStyle);
    }
    
    return baseStyles;
  };
  
  return (
    <View style={[styles.container, containerStyle]}>
      {/* 标签 */}
      {label && (
        <Text style={getLabelStyle()}>
          {label}
          {required && ' *'}
        </Text>
      )}
      
      {/* 输入框容器 */}
      <View style={getContainerStyle()}>
        {/* 左侧图标 */}
        {leftIcon && (
          <View style={[styles.iconContainer, styles.leftIconContainer]}>
            {leftIcon}
          </View>
        )}
        
        {/* 输入框 */}
        <RNTextInput
          ref={ref}
          style={getInputStyle()}
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          editable={!disabled}
          multiline={multiline}
          numberOfLines={multiline ? numberOfLines : 1}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          selectionColor={theme.colors.primary}
          {...props}
        />
        
        {/* 清除按钮 */}
        {clearable && value && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClear}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ color: theme.colors.onSurfaceVariant }}>✕</Text>
          </TouchableOpacity>
        )}
        
        {/* 右侧图标 */}
        {rightIcon && (
          <View style={[styles.iconContainer, styles.rightIconContainer]}>
            {rightIcon}
          </View>
        )}
      </View>
      
      {/* 帮助文本或错误信息 */}
      {(error || helperText) && (
        <Text style={[styles.helperText, error && styles.errorText]}>
          {error || helperText}
        </Text>
      )}
    </View>
  );
});

// 预设输入框组件
export const FilledTextInput: React.FC<Omit<TextInputProps, 'variant'>> = (props) => (
  <TextInput variant="filled" {...props} />
);

export const OutlinedTextInput: React.FC<Omit<TextInputProps, 'variant'>> = (props) => (
  <TextInput variant="outlined" {...props} />
);

export const SearchInput: React.FC<Omit<TextInputProps, 'leftIcon' | 'clearable'>> = (props) => (
  <TextInput
    leftIcon={<Text>🔍</Text>}
    clearable
    placeholder="搜索..."
    {...props}
  />
);

export const PasswordInput: React.FC<Omit<TextInputProps, 'secureTextEntry' | 'rightIcon'>> = ({
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);
  
  return (
    <TextInput
      secureTextEntry={!showPassword}
      rightIcon={
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
          <Text>{showPassword ? '🙈' : '👁️'}</Text>
        </TouchableOpacity>
      }
      {...props}
    />
  );
};

export default TextInput;
