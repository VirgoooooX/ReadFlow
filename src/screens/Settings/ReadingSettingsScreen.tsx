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
} from 'react-native';
import Slider from '@react-native-community/slider';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { getAvailableFonts } from '../../theme/typography';
import { useReadingSettings } from '../../contexts/ReadingSettingsContext';

const ReadingSettingsScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const { settings, updateSetting, loading } = useReadingSettings();

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
  const handleFontFamilyChange = async (key: string) => {
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

  // 处理自动刷新间隔变化
  const handleAutoRefreshIntervalChange = useCallback((value: number) => {
    setAutoRefreshInterval(value);
    debounce(async () => {
      try {
        await updateSetting('autoRefreshInterval', value);
      } catch (error) {
        console.error('Failed to update autoRefreshInterval:', error);
        // 恢复原值
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

  // 菜单项组件 - 选择效果借鉴 LLM 设置
  const MenuItem = ({
    icon,
    label,
    onPress,
    color,
    isSelected = false,
    showCheck = false,
    description,
    isLast = false,
  }: any) => (
    <>
      <TouchableOpacity 
        style={[styles.menuItem, isSelected && styles.selectedOption]} 
        onPress={onPress} 
        activeOpacity={0.6}
      >
        <View style={styles.menuLeft}>
          {icon && (
            <View style={styles.menuIconBox}>
              <MaterialIcons
                name={icon}
                size={20}
                color={color || theme?.colors?.onSurfaceVariant || '#666'}
              />
            </View>
          )}
          <View style={styles.menuTextContainer}>
            <Text style={[styles.menuText, isSelected && styles.selectedText]}>
              {label}
            </Text>
            {description && (
              <Text style={styles.menuDescription}>{description}</Text>
            )}
          </View>
        </View>
        <View style={styles.menuRight}>
          {showCheck && (
            <MaterialIcons name="check" size={24} color={theme?.colors?.primary} />
          )}
        </View>
      </TouchableOpacity>
      {!isLast && <View style={styles.menuDivider} />}
    </>
  );

  // 字体选择器（下拉菜单）
  const renderFontSelector = () => {
    const currentFont = availableFonts.find(f => f.key === fontFamily);
    
    return (
      <View style={styles.menuGroupContainer}>
        <Text style={styles.sectionTitle}>字体类型</Text>
        
        {/* 下拉菜单触发按钮 */}
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => setShowFontDropdown(true)}
          activeOpacity={0.7}
        >
          <View style={styles.dropdownButtonLeft}>
            <MaterialIcons name="text-fields" size={20} color={theme?.colors?.primary} />
            <View style={styles.dropdownButtonText}>
              <Text style={styles.dropdownButtonLabel}>当前选择</Text>
              <Text style={styles.dropdownButtonValue}>{currentFont?.name || '系统默认'}</Text>
            </View>
          </View>
          <MaterialIcons name="expand-more" size={24} color={theme?.colors?.onSurfaceVariant} />
        </TouchableOpacity>

        {/* 下拉菜单弹窗 */}
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
      </View>
    );
  };

  const renderSlider = (
    title: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onValueChange: (value: number) => void,
    unit: string = ''
  ) => (
    <View style={styles.menuGroupContainer}>
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
    <View style={styles.menuGroupContainer}>
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

        {/* 滚动自动标记已读 */}
        {renderSwitch(
          '列表滚动自动标记已读',
          autoMarkReadOnScroll,
          handleAutoMarkReadOnScrollChange
        )}

        {/* 后台自动刷新间隔 */}
        {renderSlider(
          '后台自动刷新间隔',
          autoRefreshInterval,
          0,
          60,
          5,
          handleAutoRefreshIntervalChange,
          '分钟'
        )}
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>
            {autoRefreshInterval === 0 
              ? 'ℹ️ 已关闭自动刷新，需手动下拉刷新RSS源' 
              : `ℹ️ 后台将每 ${autoRefreshInterval} 分钟自动静默刷新RSS源`}
          </Text>
        </View>

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
        {renderFontSelector()}

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
    backgroundColor: theme?.colors?.background || (isDark ? '#121212' : '#F5F5F5'),
    paddingHorizontal: 16,
  },
  content: {
    paddingTop: 12,
    paddingBottom: 20,
  },

  // 分组布局 - 完全复制 Mine
  menuGroupContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
      marginBottom: 10,
      marginTop: -5,  // 👈 增加与上方容器的距离
      textTransform: 'uppercase',
      letterSpacing: 0.3,
  },
  menuGroupCard: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    borderRadius: 12,
    overflow: 'hidden',
    // 投影效果
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme?.colors?.outlineVariant || (isDark ? '#3D3D3D' : '#E8E8E8'),
    marginHorizontal: 14,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuIconBox: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuText: {
    fontSize: 15,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
  },
  menuDescription: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    marginTop: 2,
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectedText: {
    color: theme?.colors?.primary || '#6750A4',
    fontWeight: '600',
  },
  selectedOption: {
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#4F378B' : '#EADDFF'),
  },

  // 滑动条样式
  sliderCard: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    borderRadius: 12,
    padding: 16,
    // 投影效果
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 8,
    elevation: 3,
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
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    minWidth: 32,
    textAlign: 'center',
  },

  // 开关样式
  switchCard: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // 投影效果
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  switchTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
  },

  // 提示框样式
  hintBox: {
    backgroundColor: `${theme?.colors?.primary || '#6750A4'}08`,
    borderRadius: 8,
    padding: 12,
    marginTop: -10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: `${theme?.colors?.primary || '#6750A4'}20`,
  },
  hintText: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    lineHeight: 18,
  },

  // 下拉菜单样式
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme?.colors?.outline || (isDark ? '#49454F' : '#B0B0B0'),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  dropdownButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  dropdownButtonText: {
    flex: 1,
  },
  dropdownButtonLabel: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    marginBottom: 2,
  },
  dropdownButtonValue: {
    fontSize: 16,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
  },
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