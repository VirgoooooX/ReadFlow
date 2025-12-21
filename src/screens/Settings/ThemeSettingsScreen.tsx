import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useThemeContext } from '../../theme';
import { THEME_PRESETS } from '../../theme/presets';
import type { UserStackParamList } from '../../navigation/AppNavigator';

type ThemeSettingsNavigationProp = NativeStackNavigationProp<UserStackParamList>;

// 获取屏幕宽度用于计算网格
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CONTAINER_PADDING = 16;
const CARD_PADDING = 12;
const COLOR_ITEM_WIDTH = (SCREEN_WIDTH - (CONTAINER_PADDING * 2) - (CARD_PADDING * 2) - 30) / 4;

// 模式选择器组件
const ModeSelector = ({ mode, currentMode, onChange, theme, isDark }: any) => {
  const isSelected = currentMode === mode;
  const labels: Record<string, string> = { light: '浅色', dark: '深色', system: '自动' };
  const icons: Record<string, any> = { light: 'light-mode', dark: 'dark-mode', system: 'settings-brightness' };

  return (
    <TouchableOpacity
      style={[
        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, gap: 8 },
        { backgroundColor: isSelected ? (theme?.colors?.primaryContainer || (isDark ? '#4F378B' : '#EADDFF')) : (isDark ? '#3D3D3D' : '#F5F5F5') }
      ]}
      onPress={() => onChange(mode)}
      activeOpacity={0.7}
    >
      <MaterialIcons 
        name={icons[mode]} 
        size={24} 
        color={isSelected ? (theme?.colors?.primary || '#6750A4') : (theme?.colors?.onSurfaceVariant || '#999')} 
      />
      <Text style={{
        fontSize: 13,
        fontWeight: '600',
        color: isSelected ? (theme?.colors?.primary || '#6750A4') : (theme?.colors?.onSurface || '#000')
      }}>
        {labels[mode]}
      </Text>
    </TouchableOpacity>
  );
};

// 主题色卡组件
const ThemeCard = ({ preset, isSelected, onPress, theme }: any) => (
  <TouchableOpacity
    style={{ width: COLOR_ITEM_WIDTH, alignItems: 'center', marginBottom: 4 }}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={{
      width: 48, 
      height: 48, 
      borderRadius: 24, 
      padding: 3, 
      marginBottom: 8, 
      justifyContent: 'center', 
      alignItems: 'center', 
      borderWidth: 2, 
      borderColor: isSelected ? (theme?.colors?.primary || '#6750A4') : 'transparent'
    }}>
      <View style={{ width: '100%', height: '100%', borderRadius: 20, overflow: 'hidden', backgroundColor: preset.colors.primary }}>
        <View style={{ position: 'absolute', right: 0, bottom: 0, width: '50%', height: '100%', backgroundColor: preset.colors.secondary }} />
      </View>
    </View>
    <Text 
      style={{
        fontSize: 12,
        color: isSelected ? (theme?.colors?.primary || '#6750A4') : (theme?.colors?.onSurfaceVariant || '#999'),
        textAlign: 'center',
        fontWeight: isSelected ? '600' : '500',
      }} 
      numberOfLines={1}
    >
      {preset.name}
    </Text>
  </TouchableOpacity>
);

const ThemeSettingsScreen: React.FC = () => {
  const navigation = useNavigation<ThemeSettingsNavigationProp>();
  const { theme, isDark, themeMode, setThemeMode, currentPreset, setThemePreset, customConfig } = useThemeContext();
  
  const styles = useMemo(() => createStyles(isDark, theme), [isDark, theme]);

  const displayPresets = useMemo(() => [
    ...THEME_PRESETS,
    {
      id: 'custom',
      name: '自定义',
      colors: customConfig || { primary: '#6750A4', secondary: '#625B71' },
    },
  ], [customConfig]);

  const handleThemeModeChange = async (mode: 'light' | 'dark' | 'system') => {
    await setThemeMode(mode);
  };

  const handlePresetChange = async (presetId: string) => {
    await setThemePreset(presetId as any);
  };

  const handleCustomTheme = () => {
    navigation.navigate('CustomColor');
  };

  const resetToDefault = () => {
    Alert.alert(
      '重置主题',
      '确定要重置为默认主题吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            await setThemePreset('default');
            await setThemeMode('system');
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* 外观模式 - 横向三卡片 */}
        <View style={styles.menuGroupContainer}>
          <Text style={styles.sectionTitle}>外观模式</Text>
          <View style={[styles.menuGroupCard, { paddingHorizontal: CARD_PADDING, paddingVertical: 6 }]}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <ModeSelector mode="light" currentMode={themeMode} onChange={handleThemeModeChange} theme={theme} isDark={isDark} />
              <ModeSelector mode="dark" currentMode={themeMode} onChange={handleThemeModeChange} theme={theme} isDark={isDark} />
              <ModeSelector mode="system" currentMode={themeMode} onChange={handleThemeModeChange} theme={theme} isDark={isDark} />
            </View>
          </View>
        </View>

        {/* 色彩主题 - 网格布局 */}
        <View style={styles.menuGroupContainer}>
          <Text style={styles.sectionTitle}>色彩主题</Text>
          <View style={[styles.menuGroupCard, { padding: CARD_PADDING }]}>
            <View style={styles.themeGrid}>
              {displayPresets.map((preset) => (
                <ThemeCard
                  key={preset.id}
                  preset={preset}
                  isSelected={currentPreset === preset.id}
                  onPress={() => handlePresetChange(preset.id)}
                  theme={theme}
                />
              ))}
            </View>
          </View>
        </View>

        {/* 更多选项 */}
        <View style={styles.menuGroupContainer}>
          <Text style={styles.sectionTitle}>更多选项</Text>
          <View style={styles.menuGroupCard}>
            <TouchableOpacity style={styles.menuItem} onPress={handleCustomTheme}>
              <View style={styles.menuLeft}>
                <View style={[styles.menuIconBox, { backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#4F378B' : '#EADDFF') }]}>
                  <MaterialIcons name="palette" size={20} color={theme?.colors?.primary || '#6750A4'} />
                </View>
                <Text style={styles.menuText}>编辑自定义颜色</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={theme?.colors?.outline || '#999'} />
            </TouchableOpacity>
          
            <View style={styles.menuDivider} />
          
            <TouchableOpacity style={styles.menuItem} onPress={resetToDefault}>
              <View style={styles.menuLeft}>
                <View style={[styles.menuIconBox, { backgroundColor: theme?.colors?.errorContainer || (isDark ? '#93000A' : '#F9DEDC') }]}>
                  <MaterialIcons name="restore" size={20} color={theme?.colors?.error || '#B3261E'} />
                </View>
                <Text style={[styles.menuText, { color: theme?.colors?.error || '#B3261E' }]}>恢复默认设置</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme?.colors?.background || (isDark ? '#121212' : '#F5F7FA'),
    paddingHorizontal: CONTAINER_PADDING,
  },
  content: {
    paddingTop: 16,
    paddingBottom: 40,
  },

  menuGroupContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme?.colors?.primary || '#6750A4',
    marginBottom: 8,
    marginLeft: 4,
    opacity: 0.9,
  },
  menuGroupCard: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.3 : 0.04,
    shadowRadius: 12,
    elevation: 2,
    overflow: 'hidden',
  },

  // 列表菜单项
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  menuIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuText: {
    fontSize: 15,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme?.colors?.outlineVariant || (isDark ? '#3D3D3D' : '#E8E8E8'),
    marginLeft: 60,
  },

  // 主题网格
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 10,
  },
});

export default ThemeSettingsScreen;
