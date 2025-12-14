import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import { SettingsService } from '../../services/SettingsService';

interface ThemeSettings {
  themeMode: string;
  currentPreset: string;
  customConfig: any;
  autoNightMode: boolean;
  nightModeStartTime: string;
  nightModeEndTime: string;
}

const ThemeSettingsScreen: React.FC = () => {
  const { theme, isDark, themeMode, setThemeMode, currentPreset, setThemePreset, customConfig, setCustomColors } = useThemeContext();
  const navigation = useNavigation();
  const styles = createStyles(isDark, theme);

  const [selectedPreset, setSelectedPreset] = useState(currentPreset);
  const [autoNightMode, setAutoNightMode] = useState(false);
  const [nightModeStartTime, setNightModeStartTime] = useState('22:00');
  const [nightModeEndTime, setNightModeEndTime] = useState('06:00');
  const [loading, setLoading] = useState(true);

  // 加载设置
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // 主题设置已经在 ThemeProvider 中加载
      // 这里只需要更新本地 UI 状态
      setSelectedPreset(currentPreset);
      setAutoNightMode(false);
      setNightModeStartTime('22:00');
      setNightModeEndTime('06:00');
    } catch (error) {
      console.error('Failed to load theme settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      // 主题设置已通过 ThemeProvider 的回调自动保存
      // 无需额外的 saveThemeSettings 调用
    } catch (error) {
      console.error('Failed to save theme settings:', error);
    }
  };

  const themePresets = [
    { id: 'default', name: '默认主题', colors: { primary: '#6750A4', secondary: '#625B71' } },
    { id: 'blue', name: '蓝色主题', colors: { primary: '#1976D2', secondary: '#1565C0' } },
    { id: 'green', name: '绿色主题', colors: { primary: '#388E3C', secondary: '#2E7D32' } },
    { id: 'orange', name: '橙色主题', colors: { primary: '#F57C00', secondary: '#EF6C00' } },
    { id: 'purple', name: '紫色主题', colors: { primary: '#7B1FA2', secondary: '#6A1B9A' } },
    { id: 'custom', name: '自定义主题', colors: customConfig || { primary: '#6750A4', secondary: '#625B71' } },
  ];

  const handleThemeModeChange = async (mode: 'light' | 'dark' | 'system') => {
    await setThemeMode(mode);
    await saveSettings();
  };

  const handlePresetChange = async (presetId: string) => {
    setSelectedPreset(presetId as any);
    await setThemePreset(presetId as any);
    await saveSettings();
  };

  const handleAutoNightModeToggle = async (value: boolean) => {
    setAutoNightMode(value);
    await saveSettings();
  };

  const handleNightModeTimeChange = async (startTime: string, endTime: string) => {
    setNightModeStartTime(startTime);
    setNightModeEndTime(endTime);
    await saveSettings();
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
            setSelectedPreset('default');
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
            {themePresets.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                style={[styles.presetItem, selectedPreset === preset.id && styles.selectedPreset]}
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
                  <Text style={[styles.presetName, selectedPreset === preset.id && styles.selectedText]}>
                    {preset.name}
                  </Text>
                </View>
                {selectedPreset === preset.id && (
                  <MaterialIcons name="check" size={20} color={theme?.colors?.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 自定义选项 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>自定义选项</Text>
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
              <MaterialIcons name="chevron-right" size={20} color={theme?.colors?.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 预览区域 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>主题预览</Text>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>示例界面</Text>
              <MaterialIcons name="more-vert" size={20} color={theme?.colors?.onSurface} />
            </View>
            <View style={styles.previewContent}>
              <Text style={styles.previewText}>这是主要文本内容的示例</Text>
              <Text style={styles.previewSecondaryText}>这是次要文本内容的示例</Text>
              <TouchableOpacity style={styles.previewButton}>
                <Text style={styles.previewButtonText}>示例按钮</Text>
              </TouchableOpacity>
            </View>
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
  previewCard: {
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    padding: 16,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
  },
  previewContent: {
    gap: 12,
  },
  previewText: {
    fontSize: 16,
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    lineHeight: 24,
  },
  previewSecondaryText: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    lineHeight: 20,
  },
  previewButton: {
    backgroundColor: theme?.colors?.primary || '#6750A4',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  previewButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme?.colors?.onPrimary || '#FFFFFF',
  },
});

export default ThemeSettingsScreen;