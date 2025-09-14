import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TouchableOpacityProps,
} from 'react-native';
import { useTheme } from '../../theme';
import type { Theme } from '../../theme';

// 卡片变体类型
export type CardVariant = 'elevated' | 'filled' | 'outlined';

// 卡片属性接口
export interface CardProps extends Omit<TouchableOpacityProps, 'style'> {
  /** 卡片内容 */
  children: React.ReactNode;
  /** 卡片变体 */
  variant?: CardVariant;
  /** 是否可点击 */
  pressable?: boolean;
  /** 自定义样式 */
  style?: ViewStyle;
  /** 内边距 */
  padding?: number | 'none' | 'small' | 'medium' | 'large';
  /** 外边距 */
  margin?: number | 'none' | 'small' | 'medium' | 'large';
  /** 圆角半径 */
  borderRadius?: number;
}

// 创建卡片样式
const createCardStyles = (theme: Theme) => {
  return StyleSheet.create({
    // 基础卡片样式
    base: {
      borderRadius: 12, // Material Design 3 规范圆角
      overflow: 'hidden',
    },
    
    // 变体样式
    elevated: {
      backgroundColor: theme.colors.surface,
      ...theme.elevation.level1,
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
      padding: theme.spacing.sm,
    },
    
    paddingMedium: {
      padding: theme.componentSpacing.card.padding,
    },
    
    paddingLarge: {
      padding: theme.spacing.lg,
    },
    
    // 外边距样式
    marginNone: {
      margin: 0,
    },
    
    marginSmall: {
      margin: theme.spacing.sm,
    },
    
    marginMedium: {
      margin: theme.componentSpacing.card.margin,
    },
    
    marginLarge: {
      margin: theme.spacing.lg,
    },
  });
};

// 卡片组件
export const Card: React.FC<CardProps> = ({
  children,
  variant = 'elevated',
  pressable = false,
  style,
  padding = 'medium',
  margin = 'none',
  borderRadius,
  onPress,
  ...props
}) => {
  const theme = useTheme();
  const styles = createCardStyles(theme);
  
  // 获取卡片样式
  const getCardStyle = (): ViewStyle[] => {
    const baseStyles = [styles.base, styles[variant]];
    
    // 添加内边距
    if (typeof padding === 'number') {
      baseStyles.push({ padding });
    } else {
      baseStyles.push(styles[`padding${padding.charAt(0).toUpperCase() + padding.slice(1)}` as keyof typeof styles]);
    }
    
    // 添加外边距
    if (typeof margin === 'number') {
      baseStyles.push({ margin });
    } else {
      baseStyles.push(styles[`margin${margin.charAt(0).toUpperCase() + margin.slice(1)}` as keyof typeof styles]);
    }
    
    // 自定义圆角
    if (borderRadius !== undefined) {
      baseStyles.push({ borderRadius });
    }
    
    // 可点击样式
    if (pressable) {
      baseStyles.push(styles.pressable);
    }
    
    // 自定义样式
    if (style) {
      baseStyles.push(style);
    }
    
    return baseStyles;
  };
  
  // 如果可点击，使用TouchableOpacity
  if (pressable) {
    return (
      <TouchableOpacity
        style={getCardStyle()}
        onPress={onPress}
        activeOpacity={0.8}
        {...props}
      >
        {children}
      </TouchableOpacity>
    );
  }
  
  // 否则使用普通View
  return (
    <View style={getCardStyle()}>
      {children}
    </View>
  );
};

// 卡片头部组件
export interface CardHeaderProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ children, style }) => {
  const theme = useTheme();
  
  const headerStyle: ViewStyle = {
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
    marginBottom: theme.spacing.md,
  };
  
  return (
    <View style={[headerStyle, style]}>
      {children}
    </View>
  );
};

// 卡片内容组件
export interface CardContentProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const CardContent: React.FC<CardContentProps> = ({ children, style }) => {
  return (
    <View style={style}>
      {children}
    </View>
  );
};

// 卡片底部组件
export interface CardFooterProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const CardFooter: React.FC<CardFooterProps> = ({ children, style }) => {
  const theme = useTheme();
  
  const footerStyle: ViewStyle = {
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline,
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  };
  
  return (
    <View style={[footerStyle, style]}>
      {children}
    </View>
  );
};

// 卡片操作区域组件
export interface CardActionsProps {
  children: React.ReactNode;
  style?: ViewStyle;
  align?: 'left' | 'center' | 'right';
}

export const CardActions: React.FC<CardActionsProps> = ({ 
  children, 
  style, 
  align = 'right' 
}) => {
  const theme = useTheme();
  
  const getJustifyContent = () => {
    switch (align) {
      case 'left': return 'flex-start';
      case 'center': return 'center';
      case 'right': return 'flex-end';
      default: return 'flex-end';
    }
  };
  
  const actionsStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: getJustifyContent(),
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  };
  
  return (
    <View style={[actionsStyle, style]}>
      {children}
    </View>
  );
};

// 预设卡片组件
export const ElevatedCard: React.FC<Omit<CardProps, 'variant'>> = (props) => (
  <Card variant="elevated" {...props} />
);

export const FilledCard: React.FC<Omit<CardProps, 'variant'>> = (props) => (
  <Card variant="filled" {...props} />
);

export const OutlinedCard: React.FC<Omit<CardProps, 'variant'>> = (props) => (
  <Card variant="outlined" {...props} />
);

export default Card;