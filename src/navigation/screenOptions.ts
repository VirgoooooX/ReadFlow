import { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { StyleProp, ViewStyle } from 'react-native';

/**
 * 获取通用的屏幕配置选项
 * 这些配置从 ArticleDetailScreen 的成功实现中提取出来
 * 确保所有页面的转场动画效果和背景颜色一致
 */
export const getCommonScreenOptions = (
  theme: any,
  isDark: boolean
): NativeStackNavigationOptions & { cardStyle?: StyleProp<ViewStyle> } => {
  const backgroundColor = theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE');
  const primaryColor = theme?.colors?.primary || '#6750A4';
  const onPrimaryColor = theme?.colors?.onPrimary || '#FFFFFF';

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

    // 7. 头部样式统一：使用主题色作为背景
    headerStyle: {
      backgroundColor: primaryColor,
    },
    headerTintColor: onPrimaryColor,

    // 8. 其他头部配置
    headerTitleStyle: {
      fontWeight: '600',
      fontSize: 16,
    },
  };
};
