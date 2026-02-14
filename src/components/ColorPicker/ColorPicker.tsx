import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useThemeContext } from '../../theme';
import type { Theme } from '../../theme';

interface ColorPickerProps {
  initialColor?: string;
  onColorChange: (color: string) => void;
  title?: string;
  showPresets?: boolean;
}

// 预设颜色 - 使用Material Design 3主题颜色
const getPresetColors = (theme: Theme) => [
  theme.colors.primary,
  theme.colors.secondary,
  theme.colors.tertiary,
  theme.colors.error,
  theme.semantic.success,
  theme.semantic.warning,
  theme.semantic.info,
];

// 颜色工具函数
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};

const rgbToHex = (r: number, g: number, b: number) => {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

const isValidHex = (hex: string) => {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
};

export const ColorPicker: React.FC<ColorPickerProps> = ({
  initialColor,
  onColorChange,
  title = '选择颜色',
  showPresets = true,
}) => {
  const { theme } = useThemeContext();
  const defaultColor = initialColor || theme.colors.primary;
  const [selectedColor, setSelectedColor] = useState(defaultColor);
  const [hexInput, setHexInput] = useState(defaultColor);
  const [rgbValues, setRgbValues] = useState(() => {
    const rgb = hexToRgb(defaultColor);
    return rgb || hexToRgb(theme.colors.primary) || { r: 0, g: 0, b: 0 };
  });
  
  const presetColors = getPresetColors(theme);

  const handleColorSelect = useCallback(
    (color: string) => {
      setSelectedColor(color);
      setHexInput(color);
      const rgb = hexToRgb(color);
      if (rgb) {
        setRgbValues(rgb);
      }
      onColorChange(color);
    },
    [onColorChange]
  );

  const handleHexInputChange = useCallback(
    (text: string) => {
      setHexInput(text);
      if (isValidHex(text)) {
        const rgb = hexToRgb(text);
        if (rgb) {
          setSelectedColor(text);
          setRgbValues(rgb);
          onColorChange(text);
        }
      }
    },
    [onColorChange]
  );

  const handleRgbChange = useCallback(
    (component: 'r' | 'g' | 'b', value: string) => {
      const numValue = Math.max(0, Math.min(255, parseInt(value) || 0));
      const newRgb = { ...rgbValues, [component]: numValue };
      setRgbValues(newRgb);
      
      const hexColor = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
      setSelectedColor(hexColor);
      setHexInput(hexColor);
      onColorChange(hexColor);
    },
    [rgbValues, onColorChange]
  );

  const styles = StyleSheet.create({
    container: {
      padding: 16,
      backgroundColor: theme.colors.surface,
    },
    title: {
      fontSize: 18,
      lineHeight: 26,
      includeFontPadding: false,
      fontWeight: 'bold',
      color: theme.colors.onSurface,
      marginBottom: 16,
      textAlign: 'center',
    },
    colorPreview: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignSelf: 'center',
      marginBottom: 20,

    },
    presetsContainer: {
      marginBottom: 20,
    },
    presetsTitle: {
      fontSize: 16,
      lineHeight: 24,
      includeFontPadding: false,
      fontWeight: '600',
      color: theme.colors.onSurface,
      marginBottom: 12,
    },
    presetsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    presetColor: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginBottom: 8,
    },
    selectedPreset: {
      transform: [{ scale: 1.1 }],
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 4,
    },
    inputSection: {
      marginBottom: 20,
    },
    inputLabel: {
      fontSize: 14,
      lineHeight: 20,
      includeFontPadding: false,
      fontWeight: '600',
      color: theme.colors.onSurface,
      marginBottom: 8,
    },
    hexInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    hexInput: {
      flex: 1,
      height: 44,

      borderRadius: 8,
      paddingHorizontal: 12,
      fontSize: 16,
      lineHeight: 24,
      includeFontPadding: false,
      color: theme.colors.onSurface,
      backgroundColor: theme.colors.surfaceVariant,
    },
    rgbContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    rgbInputContainer: {
      flex: 1,
      marginHorizontal: 4,
    },
    rgbLabel: {
      fontSize: 12,
      lineHeight: 18,
      includeFontPadding: false,
      fontWeight: '600',
      color: theme.colors.onSurfaceVariant,
      marginBottom: 4,
      textAlign: 'center',
    },
    rgbInput: {
      height: 40,

      borderRadius: 6,
      paddingHorizontal: 8,
      fontSize: 14,
      lineHeight: 20,
      includeFontPadding: false,
      color: theme.colors.onSurface,
      backgroundColor: theme.colors.surfaceVariant,
      textAlign: 'center',
    },
  });

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>{title}</Text>
      
      {/* 颜色预览 */}
      <View style={[styles.colorPreview, { backgroundColor: selectedColor }]} />
      
      {/* 预设颜色 */}
      {showPresets && (
        <View style={styles.presetsContainer}>
          <Text style={styles.presetsTitle}>预设颜色</Text>
          <View style={styles.presetsGrid}>
            {presetColors.map((color, index) => (
              <TouchableOpacity
                key={`${color}-${index}`}
                style={[
                  styles.presetColor,
                  { backgroundColor: color },
                  selectedColor.toLowerCase() === color.toLowerCase() && styles.selectedPreset,
                ]}
                onPress={() => handleColorSelect(color)}
                activeOpacity={0.7}
              />
            ))}
          </View>
        </View>
      )}
      
      {/* 十六进制输入 */}
      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>十六进制颜色值</Text>
        <View style={styles.hexInputContainer}>
          <TextInput
            style={styles.hexInput}
            value={hexInput}
            onChangeText={handleHexInputChange}
            placeholder={theme.colors.primary}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            autoCapitalize="characters"
            maxLength={7}
          />
        </View>
      </View>
      
      {/* RGB输入 */}
      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>RGB 值</Text>
        <View style={styles.rgbContainer}>
          <View style={styles.rgbInputContainer}>
            <Text style={styles.rgbLabel}>R</Text>
            <TextInput
              style={styles.rgbInput}
              value={rgbValues.r.toString()}
              onChangeText={(text) => handleRgbChange('r', text)}
              keyboardType="numeric"
              maxLength={3}
              placeholder="0"
              placeholderTextColor={theme.colors.onSurfaceVariant}
            />
          </View>
          <View style={styles.rgbInputContainer}>
            <Text style={styles.rgbLabel}>G</Text>
            <TextInput
              style={styles.rgbInput}
              value={rgbValues.g.toString()}
              onChangeText={(text) => handleRgbChange('g', text)}
              keyboardType="numeric"
              maxLength={3}
              placeholder="0"
              placeholderTextColor={theme.colors.onSurfaceVariant}
            />
          </View>
          <View style={styles.rgbInputContainer}>
            <Text style={styles.rgbLabel}>B</Text>
            <TextInput
              style={styles.rgbInput}
              value={rgbValues.b.toString()}
              onChangeText={(text) => handleRgbChange('b', text)}
              keyboardType="numeric"
              maxLength={3}
              placeholder="0"
              placeholderTextColor={theme.colors.onSurfaceVariant}
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

export default ColorPicker;
