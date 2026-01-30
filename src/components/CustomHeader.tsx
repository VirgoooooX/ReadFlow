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
  const { theme } = useThemeContext();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets, backgroundColor, textColor, titleHeight, titleLineHeight);

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      navigation.goBack();
    }
  };

  return (
    <View style={styles.container}>
      {/* 左侧区域：返回按钮 */}
      <View style={styles.sideSection}>
        {showBackButton && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="arrow-back-ios" size={20} color={styles.title.color} />
          </TouchableOpacity>
        )}
      </View>

      {/* 中间区域：标题 */}
      <View style={styles.centerSection}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {/* 右侧区域：操作按钮 */}
      <View style={styles.sideSection}>
        {rightComponent}
      </View>
    </View>
  );
};

const createStyles = (
  theme: any,
  insets: any,
  backgroundColor?: string,
  textColor?: string,
  titleHeight?: number,
  titleLineHeight?: number
) => {
  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : insets.top;
  
  // 确保使用主题色，如果传入了 backgroundColor 则优先使用
  const headerBackgroundColor = backgroundColor || (theme.isDark ? theme.colors.surface : theme.colors.primary);
  const headerTextColor = textColor || (theme.isDark ? theme.colors.onSurface : theme.colors.onPrimary);

  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: headerBackgroundColor,
      height: HEADER_HEIGHT + statusBarHeight,
      paddingTop: statusBarHeight,
      paddingHorizontal: 4,
      elevation: 4,
      shadowColor: theme.isDark ? '#000' : (theme.colors.shadow || '#000'),
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.isDark ? 0.3 : 0.1,
      shadowRadius: 2,
      zIndex: 100,
    },
    sideSection: {
      width: 56,
      height: HEADER_HEIGHT,
      justifyContent: 'center',
      alignItems: 'center',
    },
    centerSection: {
      flex: 1,
      height: HEADER_HEIGHT,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 8,
    },
    backButton: {
      padding: 8,
      marginLeft: 4,
    },
    title: {
      fontSize: 18,
      fontWeight: '900',
      color: headerTextColor,
      textAlign: 'center',
      height: titleHeight,
      lineHeight: titleLineHeight,
      marginTop: 5,
      ...(Platform.OS === 'android' ? { textAlignVertical: 'center' } : {}),
    },
  });
};

export default CustomHeader;
