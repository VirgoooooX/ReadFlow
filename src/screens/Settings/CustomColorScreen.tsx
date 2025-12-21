import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useThemeContext, type CustomColorConfig } from '../../theme';

// 预定义颜色调色板
const COLOR_PALETTES = {
  primary: [
    '#3B82F6', // Blue
    '#6366F1', // Indigo
    '#8B5CF6', // Violet
    '#A855F7', // Purple
    '#D946EF', // Fuchsia
    '#EC4899', // Pink
    '#EF4444', // Red
    '#F97316', // Orange
    '#F59E0B', // Amber
    '#EAB308', // Yellow
    '#84CC16', // Lime
    '#22C55E', // Green
    '#10B981', // Emerald
    '#14B8A6', // Teal
    '#06B6D4', // Cyan
    '#0EA5E9', // Sky
  ],
  secondary: [
    '#64748B', // Slate
    '#6B7280', // Gray
    '#71717A', // Zinc
    '#737373', // Neutral
    '#78716C', // Stone
    '#78350F', // Brown
    '#4C1D95', // Purple dark
    '#1E3A8A', // Blue dark
    '#134E4A', // Teal dark
    '#14532D', // Green dark
  ],
};

const CustomColorScreen: React.FC = () => {
  const navigation = useNavigation();
  const { theme, isDark, customConfig, setCustomColors, currentPreset } = useThemeContext();
  const styles = useMemo(() => createStyles(isDark, theme), [isDark, theme]);

  // 状态管理
  const [primaryColor, setPrimaryColor] = useState(customConfig?.primary || theme?.colors?.primary || '#3B82F6');
  const [secondaryColor, setSecondaryColor] = useState(customConfig?.secondary || theme?.colors?.secondary || '#64748B');
  const [customPrimaryInput, setCustomPrimaryInput] = useState('');
  const [customSecondaryInput, setCustomSecondaryInput] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // 验证颜色格式
  const isValidHexColor = (color: string): boolean => {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  };

  // 选择主色
  const handleSelectPrimary = useCallback((color: string) => {
    setPrimaryColor(color);
    setHasChanges(true);
  }, []);

  // 选择次色
  const handleSelectSecondary = useCallback((color: string) => {
    setSecondaryColor(color);
    setHasChanges(true);
  }, []);

  // 输入自定义主色
  const handleCustomPrimarySubmit = useCallback(() => {
    const color = customPrimaryInput.startsWith('#') ? customPrimaryInput : `#${customPrimaryInput}`;
    if (isValidHexColor(color)) {
      setPrimaryColor(color.toUpperCase());
      setCustomPrimaryInput('');
      setHasChanges(true);
    } else {
      Alert.alert('格式错误', '请输入有效的十六进制颜色代码，如 #3B82F6');
    }
  }, [customPrimaryInput]);

  // 输入自定义次色
  const handleCustomSecondarySubmit = useCallback(() => {
    const color = customSecondaryInput.startsWith('#') ? customSecondaryInput : `#${customSecondaryInput}`;
    if (isValidHexColor(color)) {
      setSecondaryColor(color.toUpperCase());
      setCustomSecondaryInput('');
      setHasChanges(true);
    } else {
      Alert.alert('格式错误', '请输入有效的十六进制颜色代码，如 #64748B');
    }
  }, [customSecondaryInput]);

  // 保存自定义颜色
  const handleSave = useCallback(async () => {
    try {
      const config: CustomColorConfig = {
        primary: primaryColor,
        secondary: secondaryColor,
      };
      await setCustomColors(config);
      Alert.alert('保存成功', '自定义主题颜色已应用', [
        { text: '确定', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      console.error('保存自定义颜色失败:', error);
      Alert.alert('保存失败', '请重试');
    }
  }, [primaryColor, secondaryColor, setCustomColors, navigation]);

  // 重置为默认
  const handleReset = useCallback(() => {
    setPrimaryColor('#3B82F6');
    setSecondaryColor('#64748B');
    setHasChanges(true);
  }, []);

  // 颜色选择器组件
  const ColorPicker = ({ 
    title, 
    selectedColor, 
    onSelect, 
    palette, 
    customInput, 
    setCustomInput, 
    onCustomSubmit 
  }: any) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={[styles.currentColorPreview, { backgroundColor: selectedColor }]}>
          <Text style={styles.currentColorText}>{selectedColor}</Text>
        </View>
      </View>

      {/* 颜色网格 */}
      <View style={styles.colorGrid}>
        {palette.map((color: string) => (
          <TouchableOpacity
            key={color}
            style={[
              styles.colorItem,
              { backgroundColor: color },
              selectedColor === color && styles.colorItemSelected,
            ]}
            onPress={() => onSelect(color)}
          >
            {selectedColor === color && (
              <MaterialIcons name="check" size={20} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* 自定义输入 */}
      <View style={styles.customInputContainer}>
        <Text style={styles.customInputLabel}>自定义颜色</Text>
        <View style={styles.customInputRow}>
          <TextInput
            style={styles.customInput}
            placeholder="#RRGGBB"
            placeholderTextColor={theme?.colors?.onSurfaceVariant || '#999'}
            value={customInput}
            onChangeText={setCustomInput}
            maxLength={7}
            autoCapitalize="characters"
          />
          <TouchableOpacity style={styles.customInputButton} onPress={onCustomSubmit}>
            <MaterialIcons name="check" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* 预览卡片 */}
        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>主题预览</Text>
          <View style={styles.previewContent}>
            <View style={[styles.previewBox, { backgroundColor: primaryColor }]}>
              <Text style={styles.previewBoxText}>主色</Text>
            </View>
            <View style={[styles.previewBox, { backgroundColor: secondaryColor }]}>
              <Text style={styles.previewBoxText}>次色</Text>
            </View>
          </View>
          <View style={styles.previewButtons}>
            <TouchableOpacity style={[styles.previewButton, { backgroundColor: primaryColor }]}>
              <Text style={styles.previewButtonText}>主要按钮</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.previewButtonOutline, { borderColor: primaryColor }]}>
              <Text style={[styles.previewButtonOutlineText, { color: primaryColor }]}>次要按钮</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 主色选择器 */}
        <ColorPicker
          title="主色（Primary）"
          selectedColor={primaryColor}
          onSelect={handleSelectPrimary}
          palette={COLOR_PALETTES.primary}
          customInput={customPrimaryInput}
          setCustomInput={setCustomPrimaryInput}
          onCustomSubmit={handleCustomPrimarySubmit}
        />

        {/* 次色选择器 */}
        <ColorPicker
          title="次色（Secondary）"
          selectedColor={secondaryColor}
          onSelect={handleSelectSecondary}
          palette={COLOR_PALETTES.secondary}
          customInput={customSecondaryInput}
          setCustomInput={setCustomSecondaryInput}
          onCustomSubmit={handleCustomSecondarySubmit}
        />

        {/* 操作按钮 */}
        <View style={styles.actionSection}>
          <TouchableOpacity 
            style={[styles.saveButton, { backgroundColor: primaryColor }]} 
            onPress={handleSave}
          >
            <MaterialIcons name="save" size={20} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>保存并应用</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <MaterialIcons name="restore" size={20} color={theme?.colors?.onSurfaceVariant} />
            <Text style={styles.resetButtonText}>重置为默认</Text>
          </TouchableOpacity>
        </View>

        {/* 提示信息 */}
        <View style={styles.tipSection}>
          <MaterialIcons name="info" size={18} color={theme?.colors?.primary} />
          <Text style={styles.tipText}>
            主色用于按钮、链接等主要元素；次色用于辅助元素和图标。Material Design 3 会根据你选择的颜色自动生成完整的配色方案。
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme?.colors?.background || (isDark ? '#121212' : '#F5F5F5'),
  },
  content: {
    padding: 16,
  },

  // 预览卡片
  previewCard: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#1F2937' : '#FFFFFF'),
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
    marginBottom: 16,
  },
  previewContent: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  previewBox: {
    flex: 1,
    height: 60,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewBoxText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  previewButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  previewButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  previewButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  previewButtonOutline: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  previewButtonOutlineText: {
    fontWeight: '600',
  },

  // 分组
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
  },
  currentColorPreview: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  currentColorText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },

  // 颜色网格
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    backgroundColor: theme?.colors?.surface || (isDark ? '#1F2937' : '#FFFFFF'),
    padding: 12,
    borderRadius: 12,
  },
  colorItem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorItemSelected: {
    borderColor: theme?.colors?.onSurface || '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },

  // 自定义输入
  customInputContainer: {
    marginTop: 12,
    backgroundColor: theme?.colors?.surface || (isDark ? '#1F2937' : '#FFFFFF'),
    padding: 12,
    borderRadius: 12,
  },
  customInputLabel: {
    fontSize: 13,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    marginBottom: 8,
  },
  customInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  customInput: {
    flex: 1,
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#374151' : '#F3F4F6'),
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
    fontFamily: 'monospace',
  },
  customInputButton: {
    backgroundColor: theme?.colors?.primary || '#3B82F6',
    width: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 操作
  actionSection: {
    gap: 12,
    marginBottom: 24,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#1F2937' : '#F3F4F6'),
    gap: 8,
  },
  resetButtonText: {
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    fontSize: 16,
    fontWeight: '500',
  },

  // 提示
  tipSection: {
    flexDirection: 'row',
    backgroundColor: `${theme?.colors?.primary || '#3B82F6'}15`,
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginBottom: 40,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    lineHeight: 20,
  },
});

export default CustomColorScreen;
