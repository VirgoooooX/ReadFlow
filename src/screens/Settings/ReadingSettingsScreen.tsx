import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { getAvailableFonts } from '../../theme/typography';
import { useReadingSettings } from '../../contexts/ReadingSettingsContext';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '../../navigation/AppNavigator';
import * as StyleUtils from '../../utils/styleUtils';

type NavigationProp = NativeStackNavigationProp<SettingsStackParamList, 'ReadingSettings'>;

const ReadingSettingsScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const navigation = useNavigation<NavigationProp>();
  const { settings, updateSetting, loading } = useReadingSettings();

  // 本地状态用于实时预览
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('system');
  const [lineHeight, setLineHeight] = useState(1.5);
  const [showAllTab, setShowAllTab] = useState(true);

  // 从设置中初始化本地状态（仅在首次加载时）
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (settings && !initialized) {
      setFontSize(settings.fontSize);
      setFontFamily(settings.fontFamily);
      setLineHeight(settings.lineHeight);
      setShowAllTab(settings.showAllTab ?? true);
      setInitialized(true);
    }
  }, [settings, initialized]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (fontSizeTimeoutRef.current) {
        clearTimeout(fontSizeTimeoutRef.current);
      }
      if (lineHeightTimeoutRef.current) {
        clearTimeout(lineHeightTimeoutRef.current);
      }
    };
  }, []);

  // 获取可用字体选项
  const availableFonts = getAvailableFonts();
  const fontFamilyOptions = availableFonts.map(font => font.name);
  const fontFamilyKeys = availableFonts.map(font => font.key);

  // 根据key获取字体名称
  const getFontNameByKey = (key: string) => {
    const font = availableFonts.find(f => f.key === key);
    return font ? font.name : '系统默认';
  };

  // 根据名称获取字体key
  const getFontKeyByName = (name: string) => {
    const font = availableFonts.find(f => f.name === name);
    return font ? font.key : 'system';
  };

  // 防抖定时器引用
  const fontSizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lineHeightTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 防抖函数
  const debounce = useCallback((func: () => void, delay: number, timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(func, delay);
  }, []);

  // 处理字体大小变化
  const handleFontSizeChange = useCallback((value: number) => {
    setFontSize(value);
    debounce(async () => {
      try {
        await updateSetting('fontSize', value);
      } catch (error) {
        console.error('Failed to update font size:', error);
        // 恢复原值
        if (settings) {
          setFontSize(settings.fontSize);
        }
      }
    }, 300, fontSizeTimeoutRef);
  }, [debounce, updateSetting, settings]);

  // 处理行间距变化
  const handleLineHeightChange = useCallback((value: number) => {
    setLineHeight(value);
    debounce(async () => {
      try {
        await updateSetting('lineHeight', value);
      } catch (error) {
        console.error('Failed to update line height:', error);
        // 恢复原值
        if (settings) {
          setLineHeight(settings.lineHeight);
        }
      }
    }, 300, lineHeightTimeoutRef);
  }, [debounce, updateSetting, settings]);

  // 处理字体类型变化
  const handleFontFamilyChange = async (name: string) => {
    const key = getFontKeyByName(name);
    if (fontFamily !== key) {
      setFontFamily(key);
      try {
        await updateSetting('fontFamily', key);
      } catch (error) {
        console.error('Failed to update font family:', error);
        // 恢复原值
        setFontFamily(fontFamily);
      }
    }
  };

  // 处理显示"全部"标签开关
  const handleShowAllTabChange = async (value: boolean) => {
    setShowAllTab(value);
    try {
      await updateSetting('showAllTab', value);
    } catch (error) {
      console.error('Failed to update showAllTab:', error);
      setShowAllTab(!value);
    }
  };

  const renderOptionSelector = (
    title: string,
    currentValue: string,
    options: string[],
    onSelect: (value: string) => void
  ) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>
        {options.map((option, index) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.optionItem,
              currentValue === option && styles.selectedOption,
              index === options.length - 1 && styles.lastOptionItem,
            ]}
            onPress={() => onSelect(option)}
          >
            <Text style={[
              styles.optionText,
              currentValue === option && styles.selectedText,
            ]}>
              {option}
            </Text>
            {currentValue === option && (
              <MaterialIcons name="check" size={20} color={theme?.colors?.primary} />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderSlider = (
    title: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onValueChange: (value: number) => void,
    unit: string = ''
  ) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sliderCard}>
        <View style={styles.sliderHeader}>
          <Text style={styles.sliderValue}>{value.toFixed(step < 1 ? 1 : 0)}{unit}</Text>
        </View>
        <View style={styles.sliderContainer}>
          <Text style={styles.sliderLabel}>{min}{unit}</Text>
          <Slider
            style={styles.slider}
            minimumValue={min}
            maximumValue={max}
            step={step}
            value={value}
            onValueChange={onValueChange}
            minimumTrackTintColor={theme?.colors?.primary || '#6750A4'}
            maximumTrackTintColor={theme?.colors?.outline || (isDark ? '#938F99' : '#79747E')}
            thumbTintColor={theme?.colors?.primary || '#6750A4'}
          />
          <Text style={styles.sliderLabel}>{max}{unit}</Text>
        </View>
      </View>
    </View>
  );

  const renderSwitch = (
    title: string,
    value: boolean,
    onValueChange: (value: boolean) => void
  ) => (
    <View style={styles.section}>
      <View style={styles.switchCard}>
        <Text style={styles.switchTitle}>{title}</Text>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: theme?.colors?.surfaceVariant, true: theme?.colors?.primary }}
          thumbColor={value ? theme?.colors?.onPrimary : theme?.colors?.outline}
        />
      </View>
    </View>
  );

  const styles = createStyles(isDark, theme);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.sectionTitle}>加载设置中...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* 显示设置 */}
        {renderSwitch(
          '显示"全部"标签',
          showAllTab,
          handleShowAllTabChange
        )}

        {/* 字体大小滑动调节 */}
        {renderSlider(
          '字体大小',
          fontSize,
          12,
          24,
          1,
          handleFontSizeChange,
          'px'
        )}

        {/* 字体类型选择 */}
        {renderOptionSelector('字体类型', getFontNameByKey(fontFamily), fontFamilyOptions, handleFontFamilyChange)}

        {/* 行间距滑动调节 */}
        {renderSlider(
          '行间距',
          lineHeight,
          1.0,
          2.5,
          0.1,
          handleLineHeightChange,
          '倍'
        )}
      </View>
    </ScrollView>
  );
};

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 12,
  },
  card: {
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    overflow: 'hidden',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  lastOptionItem: {
    borderBottomWidth: 0,
  },
  selectedOption: {
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#4F378B' : '#EADDFF'),
  },
  optionText: {
    fontSize: 16,
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
  },
  selectedText: {
    color: theme?.colors?.primary || '#6750A4',
    fontWeight: '500',
  },

  // 滑动条样式
  sliderCard: {
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    padding: 16,
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sliderValue: {
    fontSize: 16,
    fontWeight: '600',
    color: theme?.colors?.primary || '#6750A4',
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  sliderLabel: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    minWidth: 32,
    textAlign: 'center',
  },

  // 开关样式
  switchCard: {
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
  },
});

export default ReadingSettingsScreen;