import { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { StyleProp, ViewStyle } from 'react-native';
import type { Theme } from '../theme';

const getStatusBarStyle = (hexColor: string): 'light' | 'dark' => {
  const hex = hexColor.replace('#', '');
  const normalized = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.5 ? 'light' : 'dark';
};

/**
 * 获取通用的屏幕配置选项
 * 这些配置从 ArticleDetailScreen 的成功实现中提取出来
 * 确保所有页面的转场动画效果和背景颜色一致
 */
export const getCommonScreenOptions = (
  theme: Theme
): NativeStackNavigationOptions & { cardStyle?: StyleProp<ViewStyle> } => {
  const backgroundColor = theme.colors.background;

  // 【关键修复】导航栏背景色：深色模式用 surface，浅色模式用 primary
  const headerBackgroundColor = theme.isDark ? theme.colors.surface : theme.colors.primary;

  // 【关键修复】导航栏文字色：深色模式用 onSurface，浅色模式用 onPrimary
  const headerTextColor = theme.isDark ? theme.colors.onSurface : theme.colors.onPrimary;
  const statusBarStyle = getStatusBarStyle(headerTextColor);

  return {
    // 1. 核心动画：平移效果，从右侧滑入
    animation: 'slide_from_right',

    // 2. 表现形式：卡片堆栈（而不是全屏模态）
    presentation: 'card',

    // 3. 【关键修复】使用透明卡片背景，使下层页面在返回时可见
    // 这样返回时当前页面平移出去时，前一个页面会跟着平移进来
    // 而不是显示空白屏
    cardStyle: {
      backgroundColor: 'transparent',
    } as StyleProp<ViewStyle>,

    // 4. 内容背景：用于页面内容区域的背景色
    contentStyle: {
      backgroundColor: backgroundColor,
    },

    // 6. 动画时长：200ms，与 Android 系统默认一致
    animationDuration: 200,

    // 7. 头部样式统一：【修复】深色/浅色模式使用不同颜色
    headerStyle: {
      backgroundColor: headerBackgroundColor,
    },
    headerTintColor: headerTextColor,
    statusBarStyle,

    // 8. 其他头部配置
    headerTitleStyle: {
      fontWeight: '600',
      fontSize: 16,
    },
  };
};
