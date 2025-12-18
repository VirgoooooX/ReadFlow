import React from 'react';
import { View, StyleSheet } from 'react-native';
import CustomHeader from './CustomHeader';

interface ScreenWithCustomHeaderProps {
  title: string;
  showBackButton?: boolean;
  rightComponent?: React.ReactNode;
  onBackPress?: () => void;
  backgroundColor?: string;
  textColor?: string;
  children: React.ReactNode;
  // 新增文字定位和大小控制属性
  titleVerticalAlign?: 'top' | 'center' | 'bottom';
  titleHeight?: number;
  titleLineHeight?: number;
  titleMarginTop?: number;
}

const ScreenWithCustomHeader: React.FC<ScreenWithCustomHeaderProps> = ({
  title,
  showBackButton = true,
  rightComponent,
  onBackPress,
  backgroundColor,
  textColor,
  children,
  titleVerticalAlign,
  titleHeight,
  titleLineHeight,
  titleMarginTop,
}) => {
  return (
    <View style={styles.container}>
      <CustomHeader
        title={title}
        showBackButton={showBackButton}
        rightComponent={rightComponent}
        onBackPress={onBackPress}
        // 不传递默认 undefined/null，让 CustomHeader 自己处理回退
        backgroundColor={backgroundColor}
        textColor={textColor}
        titleVerticalAlign={titleVerticalAlign}
        titleHeight={titleHeight}
        titleLineHeight={titleLineHeight}
        titleMarginTop={titleMarginTop}
      />
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});

export default ScreenWithCustomHeader;