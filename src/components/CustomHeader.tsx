import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeContext } from '../theme';
import { HEADER_HEIGHT } from '../constants/navigation';

interface CustomHeaderProps {
  title: string;
  showBackButton?: boolean;
  rightComponent?: React.ReactNode;
  onBackPress?: () => void;
  backgroundColor?: string;
  textColor?: string;
  // 新增文字定位和大小控制属性
  titleVerticalAlign?: 'top' | 'center' | 'bottom';
  titleHeight?: number;
  titleLineHeight?: number;
  titleMarginTop?: number;
}

const CustomHeader: React.FC<CustomHeaderProps> = ({
  title,
  showBackButton = true,
  rightComponent,
  onBackPress,
  backgroundColor,
  textColor,
  titleVerticalAlign = 'center', // 默认保持居中以保持向后兼容
  titleHeight,
  titleLineHeight,
  titleMarginTop = 12, // 默认为0，按需设置
}) => {
  const navigation = useNavigation();
  const { theme, isDark } = useThemeContext();
  const insets = useSafeAreaInsets();

  // 计算实际的header高度（包含状态栏）
  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : insets.top;
  const totalHeaderHeight = HEADER_HEIGHT + statusBarHeight;

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      navigation.goBack();
    }
  };

  // 确保使用主题色，如果传入了 backgroundColor 则优先使用
  // 深色模式下使用 surface 色替代亮色 primary，避免突兀
  const headerBackgroundColor = backgroundColor || (isDark 
    ? theme?.colors?.surface || '#1F2937'  // 深色模式：使用 surface 色
    : theme?.colors?.primary);              // 浅色模式：使用 primary 色
  
  // 深色模式下文字用 onSurface，浅色模式下用 onPrimary
  const headerTextColor = textColor || (isDark
    ? theme?.colors?.onSurface || '#F9FAFB'
    : theme?.colors?.onPrimary || '#FFFFFF');

  // 动态计算文字样式
  const getTitleStyle = (): any => {
    const baseStyle: any = {
      fontSize: 18,
      fontWeight: '900' as const,
      textAlign: 'center' as const,
      color: headerTextColor,
      marginTop: 5, // 文字下移 10px
    };

    // 添加自定义属性
    if (titleHeight) {
      baseStyle.height = titleHeight;
    }
    if (titleLineHeight) {
      baseStyle.lineHeight = titleLineHeight;
    }
    // 注意：不再在这里设置marginTop，由容器的paddingTop来控制

    // Android特有属性
    if (Platform.OS === 'android') {
      baseStyle.textAlignVertical = 'center';
    }

    return baseStyle;
  };

  // 动态计算容器样式
  const getCenterSectionStyle = (): any => {
    const baseStyle: any = {
      flex: 1,
      alignItems: 'center' as const,
      paddingHorizontal: 16,
      justifyContent: 'flex-start', // 改为顶部对齐
      paddingTop: 0, // 文字紧贴顶部
    };

    return baseStyle;
  };

  // 动态计算左侧按钮容器样式
  const getLeftSectionStyle = (): any => {
    const baseStyle: any = {
      width: 40,
      alignItems: 'flex-start' as const,
      justifyContent: 'flex-start', // 改为顶部对齐
      paddingTop: 0, // 按钮紧贴顶部
      marginTop: -2, // 与标题文字对齐
    };

    return baseStyle;
  };

  // 动态计算右侧组件容器样式
  const getRightSectionStyle = (): any => {
    const baseStyle: any = {
      width: 40,
      alignItems: 'flex-end' as const,
      justifyContent: 'flex-start', // 改为顶部对齐
      paddingTop: 0, // 按钮紧贴顶部
    };

    return baseStyle;
  };

  // 判断状态栏内容颜色：导航栏背景是 primary 色，所以根据 onPrimary 判断
  // 如果 onPrimary 是浅色（如白色），则状态栏内容用 light-content
  // 如果 onPrimary 是深色（如黑色），则状态栏内容用 dark-content
  const isLightContent = headerTextColor.toLowerCase() === '#ffffff' || 
                         headerTextColor.toLowerCase() === '#fff' ||
                         headerTextColor.startsWith('#f') ||
                         headerTextColor.startsWith('#e') ||
                         headerTextColor.startsWith('#d');

  return (
    <>
      <StatusBar
        barStyle={isLightContent ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent={true}
      />
      <View style={[styles.container, {
        backgroundColor: headerBackgroundColor,
        height: totalHeaderHeight,
        paddingTop: statusBarHeight,
      }]}>
        <View style={styles.content}>
          {/* 左侧返回按钮 */}
          <View style={getLeftSectionStyle()}>
            {showBackButton && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleBackPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialIcons
                  name="arrow-back"
                  size={22}
                  color={headerTextColor}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* 中间标题 */}
          <View style={getCenterSectionStyle()}>
            <Text
              style={getTitleStyle()}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {title}
            </Text>
          </View>

          {/* 右侧组件 */}
          <View style={getRightSectionStyle()}>
            {rightComponent}
          </View>
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingTop: Platform.OS === 'ios' ? 0 : 0, // 状态栏高度已由StatusBar处理
    elevation: 4, // Android阴影
    shadowColor: '#000', // iOS阴影
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    zIndex: 1000,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'stretch', // 改为stretch，让子容器可以控制自己的对齐
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    flex: 1,
  },
  backButton: {
    padding: 8,
    marginLeft: -8, // 调整触摸区域
  },
});

export default CustomHeader;