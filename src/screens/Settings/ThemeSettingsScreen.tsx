import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { THEME_PRESETS } from '../../theme/presets';
import * as StyleUtils from '../../utils/styleUtils';

const ThemeSettingsScreen: React.FC = () => {
  // 【优化】直接从 Context 解构所需状态，移除冗余本地 state
  const { theme, isDark, themeMode, setThemeMode, currentPreset, setThemePreset, customConfig } = useThemeContext();
  
  // 【优化】使用 useMemo 缓存样式，避免每次渲染重新创建
  const styles = useMemo(() => createStyles(isDark, theme), [isDark, theme]);

  // 【优化】合并预设列表：标准预设 + 自定义预设
  const displayPresets = useMemo(() => [
    ...THEME_PRESETS,
    {
      id: 'custom',
      name: '自定义主题',
      colors: customConfig || { primary: '#6750A4', secondary: '#625B71' },
    },
  ], [customConfig]);

  // 【优化】简化处理函数，直接调用 Context 方法，无需额外的 saveSettings
  const handleThemeModeChange = async (mode: 'light' | 'dark' | 'system') => {
    await setThemeMode(mode);
  };

  const handlePresetChange = async (presetId: string) => {
    await setThemePreset(presetId as any);
  };

  const handleCustomTheme = () => {
    Alert.alert('自定义主题', '自定义主题编辑器开发中...');
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
        {/* 主题模式 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>主题模式</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.optionItem, themeMode === 'light' && styles.selectedOption]}
              onPress={() => handleThemeModeChange('light')}
            >
              <View style={styles.optionLeft}>
                <MaterialIcons 
                  name="light-mode" 
                  size={24} 
                  color={themeMode === 'light' ? theme?.colors?.primary : theme?.colors?.onSurfaceVariant} 
                />
                <Text style={[styles.optionText, themeMode === 'light' && styles.selectedText]}>浅色模式</Text>
              </View>
              {themeMode === 'light' && (
                <MaterialIcons name="check" size={20} color={theme?.colors?.primary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionItem, themeMode === 'dark' && styles.selectedOption]}
              onPress={() => handleThemeModeChange('dark')}
            >
              <View style={styles.optionLeft}>
                <MaterialIcons 
                  name="dark-mode" 
                  size={24} 
                  color={themeMode === 'dark' ? theme?.colors?.primary : theme?.colors?.onSurfaceVariant} 
                />
                <Text style={[styles.optionText, themeMode === 'dark' && styles.selectedText]}>深色模式</Text>
              </View>
              {themeMode === 'dark' && (
                <MaterialIcons name="check" size={20} color={theme?.colors?.primary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionItem, themeMode === 'system' && styles.selectedOption]}
              onPress={() => handleThemeModeChange('system')}
            >
              <View style={styles.optionLeft}>
                <MaterialIcons 
                  name="settings-brightness" 
                  size={24} 
                  color={themeMode === 'system' ? theme?.colors?.primary : theme?.colors?.onSurfaceVariant} 
                />
                <Text style={[styles.optionText, themeMode === 'system' && styles.selectedText]}>跟随系统</Text>
              </View>
              {themeMode === 'system' && (
                <MaterialIcons name="check" size={20} color={theme?.colors?.primary} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* 主题预设 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>主题预设</Text>
          <View style={styles.card}>
            {displayPresets.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                style={[styles.presetItem, currentPreset === preset.id && styles.selectedPreset]}
                onPress={() => handlePresetChange(preset.id)}
              >
                <View style={styles.presetLeft}>
                  <View style={styles.colorPreview}>
                    <View 
                      style={[
                        styles.colorSample, 
                        { backgroundColor: preset.colors.primary }
                      ]} 
                    />
                    <View 
                      style={[
                        styles.colorSample, 
                        { backgroundColor: preset.colors.secondary }
                      ]} 
                    />
                  </View>
                  <Text style={[styles.presetName, currentPreset === preset.id && styles.selectedText]}>
                    {preset.name}
                  </Text>
                </View>
                {currentPreset === preset.id && (
                  <MaterialIcons name="check" size={20} color={theme?.colors?.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 高级设置 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>高级设置</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={handleCustomTheme}
            >
              <View style={styles.actionLeft}>
                <MaterialIcons name="palette" size={24} color={theme?.colors?.primary} />
                <Text style={styles.actionText}>自定义颜色</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={theme?.colors?.onSurfaceVariant} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionItem}
              onPress={resetToDefault}
            >
              <View style={styles.actionLeft}>
                <MaterialIcons name="restore" size={24} color={theme?.colors?.primary} />
                <Text style={styles.actionText}>重置为默认</Text>
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
    ...StyleUtils.createCardStyle(isDark, theme),
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
  selectedOption: {
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#4F378B' : '#EADDFF'),
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionText: {
    fontSize: 16,
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginLeft: 12,
  },
  selectedText: {
    color: theme?.colors?.primary || '#6750A4',
    fontWeight: '500',
  },
  presetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  selectedPreset: {
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#4F378B' : '#EADDFF'),
  },
  presetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  colorPreview: {
    flexDirection: 'row',
    marginRight: 12,
  },
  colorSample: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 4,
    borderWidth: 1,
    borderColor: theme?.colors?.outline || (isDark ? '#938F99' : '#79747E'),
  },
  presetName: {
    fontSize: 16,
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  actionText: {
    fontSize: 16,
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginLeft: 12,
  },
});

export default ThemeSettingsScreen;