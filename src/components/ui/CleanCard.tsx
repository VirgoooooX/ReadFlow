import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme';
import type { Theme } from '../../theme';

// 卡片变体类型
export type CleanCardVariant = 'elevated' | 'filled' | 'outlined';
export type CleanCardPadding = 'none' | 'small' | 'medium' | 'large';

// 卡片属性接口
export interface CleanCardProps {
  /** 卡片内容 */
  children: React.ReactNode;
  /** 卡片变体 */
  variant?: CleanCardVariant;
  /** 是否可点击 */
  pressable?: boolean;
  /** 内边距 */
  padding?: CleanCardPadding;
  /** 点击事件 */
  onPress?: () => void;
  /** 自定义样式 */
  style?: ViewStyle;
  /** 测试ID */
  testID?: string;
}

// 创建卡片样式 - 完全符合Material Design 3规范
const createCleanCardStyles = (theme: Theme) => {
  return StyleSheet.create({
    // 基础样式
    base: {
      borderRadius: 12, // MD3标准圆角
      overflow: 'hidden',
    },
    
    // 变体样式
    elevated: {
      backgroundColor: theme.colors.surface,
      elevation: 1,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
    },
    
    filled: {
      backgroundColor: theme.colors.surfaceVariant,
    },
    
    outlined: {
      backgroundColor: theme.colors.surface,
      
    },
    
    // 可点击状态
    pressable: {
      // 添加轻微的透明度变化以指示可点击
    },
    
    // 内边距样式
    paddingNone: {
      padding: 0,
    },
    
    paddingSmall: {
      padding: 12,
    },
    
    paddingMedium: {
      padding: 16,
    },
    
    paddingLarge: {
      padding: 24,
    },
  });
};

// CleanCard组件
export const CleanCard: React.FC<CleanCardProps> = ({
  children,
  variant = 'elevated',
  pressable = false,
  padding = 'medium',
  onPress,
  style,
  testID,
}) => {
  const theme = useTheme();
  const styles = createCleanCardStyles(theme);
  
  const cardStyle = [
    styles.base,
    styles[variant],
    styles[`padding${padding.charAt(0).toUpperCase() + padding.slice(1)}`],
    pressable && styles.pressable,
    style,
  ];
  
  if (pressable && onPress) {
    return (
      <TouchableOpacity
        style={cardStyle}
        onPress={onPress}
        activeOpacity={0.8}
        testID={testID}
      >
        {children}
      </TouchableOpacity>
    );
  }
  
  return (
    <View style={cardStyle} testID={testID}>
      {children}
    </View>
  );
};

// 卡片头部组件
export interface CleanCardHeaderProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const CleanCardHeader: React.FC<CleanCardHeaderProps> = ({ children, style }) => {
  const theme = useTheme();
  
  const headerStyle = [
    {
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outlineVariant,
      marginBottom: 16,
    },
    style,
  ];
  
  return (
    <View style={headerStyle}>
      {children}
    </View>
  );
};

// 卡片内容组件
export interface CleanCardContentProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const CleanCardContent: React.FC<CleanCardContentProps> = ({ children, style }) => {
  return (
    <View style={style}>
      {children}
    </View>
  );
};

// 卡片底部组件
export interface CleanCardFooterProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const CleanCardFooter: React.FC<CleanCardFooterProps> = ({ children, style }) => {
  const theme = useTheme();
  
  const footerStyle = [
    {
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: theme.colors.outlineVariant,
      marginTop: 16,
    },
    style,
  ];
  
  return (
    <View style={footerStyle}>
      {children}
    </View>
  );
};

// 卡片操作区组件
export interface CleanCardActionsProps {
  children: React.ReactNode;
  style?: ViewStyle;
  align?: 'left' | 'center' | 'right';
}

export const CleanCardActions: React.FC<CleanCardActionsProps> = ({ 
  children, 
  style, 
  align = 'right' 
}) => {
  const alignmentStyle = {
    left: { justifyContent: 'flex-start' as const },
    center: { justifyContent: 'center' as const },
    right: { justifyContent: 'flex-end' as const },
  };
  
  const actionsStyle = [
    {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingTop: 16,
      gap: 8,
    },
    alignmentStyle[align],
    style,
  ];
  
  return (
    <View style={actionsStyle}>
      {children}
    </View>
  );
};

// 预定义变体组件
export const ElevatedCard: React.FC<Omit<CleanCardProps, 'variant'>> = (props) => (
  <CleanCard variant="elevated" {...props} />
);

export const FilledCard: React.FC<Omit<CleanCardProps, 'variant'>> = (props) => (
  <CleanCard variant="filled" {...props} />
);

export const OutlinedCard: React.FC<Omit<CleanCardProps, 'variant'>> = (props) => (
  <CleanCard variant="outlined" {...props} />
);

export default CleanCard;