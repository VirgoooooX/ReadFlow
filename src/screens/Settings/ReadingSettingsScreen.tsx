import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { getAvailableFonts } from '../../theme/typography';
import { useReadingSettings } from '../../contexts/ReadingSettingsContext';
import { 
  SettingItem, 
  SettingSliderItem, 
  SettingSection 
} from '../../components/ui';
import { typography } from '../../theme/typography';

const ReadingSettingsScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const { settings, updateSetting, loading } = useReadingSettings();
  const styles = createStyles(isDark, theme);

  // 本地状态用于实时预览
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('system');
  const [lineHeight, setLineHeight] = useState(1.5);
  const [showAllTab, setShowAllTab] = useState(true);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(10);
  const [autoMarkReadOnScroll, setAutoMarkReadOnScroll] = useState(false);
  const [showFontDropdown, setShowFontDropdown] = useState(false);

  // 从设置中初始化本地状态（仅在首次加载时）
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (settings && !initialized) {
      setFontSize(settings.fontSize);
      setFontFamily(settings.fontFamily);
      setLineHeight(settings.lineHeight);
      setShowAllTab(settings.showAllTab ?? true);
      setAutoRefreshInterval(settings.autoRefreshInterval ?? 10);
      setAutoMarkReadOnScroll(settings.autoMarkReadOnScroll ?? false);
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
      if (autoRefreshTimeoutRef.current) {
        clearTimeout(autoRefreshTimeoutRef.current);
      }
    };
  }, []);

  // 获取可用字体选项
  const availableFonts = getAvailableFonts();
  
  // 防抖定时器引用
  const fontSizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lineHeightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoRefreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
        if (settings) {
          setLineHeight(settings.lineHeight);
        }
      }
    }, 300, lineHeightTimeoutRef);
  }, [debounce, updateSetting, settings]);

  // 处理字体类型变化
  const handleFontFamilyChange = async (key: string) => {
    if (fontFamily !== key) {
      setFontFamily(key);
      try {
        await updateSetting('fontFamily', key);
      } catch (error) {
        console.error('Failed to update font family:', error);
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

  // 处理自动刷新间隔变化
  const handleAutoRefreshIntervalChange = useCallback((value: number) => {
    setAutoRefreshInterval(value);
    debounce(async () => {
      try {
        await updateSetting('autoRefreshInterval', value);
      } catch (error) {
        console.error('Failed to update autoRefreshInterval:', error);
        if (settings) {
          setAutoRefreshInterval(settings.autoRefreshInterval ?? 10);
        }
      }
    }, 300, autoRefreshTimeoutRef);
  }, [debounce, updateSetting, settings]);

  // 处理滚动自动标记已读开关
  const handleAutoMarkReadOnScrollChange = async (value: boolean) => {
    setAutoMarkReadOnScroll(value);
    try {
      await updateSetting('autoMarkReadOnScroll', value);
    } catch (error) {
      console.error('Failed to update autoMarkReadOnScroll:', error);
      setAutoMarkReadOnScroll(!value);
    }
  };

  // 字体选择 Modal
  const renderFontSelectorModal = () => (
    <Modal
      visible={showFontDropdown}
      transparent
      animationType="fade"
      onRequestClose={() => setShowFontDropdown(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowFontDropdown(false)}
      >
        <View style={[styles.dropdownMenu, { maxHeight: Dimensions.get('window').height * 0.6 }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {availableFonts.map((font) => (
              <TouchableOpacity
                key={font.key}
                style={[
                  styles.dropdownItem,
                  fontFamily === font.key && styles.dropdownItemSelected,
                ]}
                onPress={() => {
                  handleFontFamilyChange(font.key);
                  setShowFontDropdown(false);
                }}
                activeOpacity={0.6}
              >
                <View style={styles.dropdownItemContent}>
                  <Text style={[
                    styles.dropdownItemLabel,
                    fontFamily === font.key && styles.dropdownItemLabelSelected,
                  ]}>
                    {font.name}
                  </Text>
                  {font.description && (
                    <Text style={[
                      styles.dropdownItemDescription,
                      fontFamily === font.key && styles.dropdownItemDescriptionSelected,
                    ]}>
                      {font.description}
                    </Text>
                  )}
                </View>
                {fontFamily === font.key && (
                  <MaterialIcons name="check" size={24} color={theme?.colors?.primary} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme?.colors?.primary} />
        <Text style={styles.loadingText}>加载设置中...</Text>
      </View>
    );
  }

  const currentFont = availableFonts.find(f => f.key === fontFamily);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* 头部留白 */}
      <View style={{ height: 12 }} />

      {/* Group 1: 显示设置 */}
      <SettingSection title="显示设置">
        <SettingItem
          icon="tab"
          label="显示“全部”标签"
          color="#8B5CF6"
          rightElement={
            <View style={{ height: 32, justifyContent: 'center' }}>
              <Switch
                value={showAllTab}
                onValueChange={handleShowAllTabChange}
                trackColor={{ false: theme?.colors?.surfaceVariant, true: theme?.colors?.primary }}
                thumbColor={showAllTab ? theme?.colors?.onPrimary : theme?.colors?.outline}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }} 
              />
            </View>
          }
        />
        <SettingItem
          icon="playlist-add-check"
          label="滚动自动标记已读"
          color="#10B981"
          rightElement={
            <View style={{ height: 32, justifyContent: 'center' }}>
              <Switch
                value={autoMarkReadOnScroll}
                onValueChange={handleAutoMarkReadOnScrollChange}
                trackColor={{ false: theme?.colors?.surfaceVariant, true: theme?.colors?.primary }}
                thumbColor={autoMarkReadOnScroll ? theme?.colors?.onPrimary : theme?.colors?.outline}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
            </View>
          }
          isLast
        />
      </SettingSection>

      {/* Group 2: 排版设置 */}
      <SettingSection title="排版设置">
        <SettingItem
          icon="font-download"
          label="字体类型"
          color={theme?.colors?.primary}
          valueText={currentFont?.name || '系统默认'}
          onPress={() => setShowFontDropdown(true)}
        />
        <SettingSliderItem
          icon="format-size"
          label="字体大小"
          value={fontSize}
          min={12}
          max={24}
          step={1}
          onValueChange={handleFontSizeChange}
          unit="px"
        />
        <SettingSliderItem
          icon="format-line-spacing"
          label="行间距"
          value={lineHeight}
          min={1.0}
          max={2.5}
          step={0.1}
          onValueChange={handleLineHeightChange}
          unit="倍"
          isLast
        />
      </SettingSection>

      {/* Group 3: 数据更新 */}
      <SettingSection title="数据更新">
        <SettingSliderItem
          icon="update"
          label="自动刷新间隔"
          value={autoRefreshInterval}
          min={0}
          max={60}
          step={5}
          onValueChange={handleAutoRefreshIntervalChange}
          unit="分钟"
          isLast
        />
      </SettingSection>

      <View style={styles.hintBox}>
        <Text style={styles.hintText}>
          {autoRefreshInterval === 0 
            ? 'ℹ️ 已关闭自动刷新，需手动下拉刷新RSS源' 
            : `ℹ️ 后台将每 ${autoRefreshInterval} 分钟自动静默刷新RSS源`}
        </Text>
      </View>

      {/* 底部留白 */}
      <View style={{ height: 20 }} />

      {renderFontSelectorModal()}
    </ScrollView>
  );
};

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme?.colors?.background || (isDark ? '#121212' : '#F5F5F5'),
    paddingHorizontal: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
  },

  // Hint Box
  hintBox: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  hintText: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    lineHeight: 16,
  },

  // Modal / Dropdown Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  dropdownMenu: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.5 : 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme?.colors?.outlineVariant || (isDark ? '#3D3D3D' : '#E8E8E8'),
  },
  dropdownItemSelected: {
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#4F378B' : '#EADDFF'),
  },
  dropdownItemContent: {
    flex: 1,
  },
  dropdownItemLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
    marginBottom: 2,
  },
  dropdownItemLabelSelected: {
    color: theme?.colors?.primary || '#6750A4',
    fontWeight: '600',
  },
  dropdownItemDescription: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
  },
  dropdownItemDescriptionSelected: {
    color: theme?.colors?.primary || '#6750A4',
  },
});

export default ReadingSettingsScreen;