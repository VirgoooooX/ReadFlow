import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import {
  type ThemePreset,
  themePresetDescriptions,
  themePresetTags,
  themePresets,
  useThemeContext,
} from '../../theme';

interface ThemePresetCardProps {
  preset: ThemePreset;
  isSelected: boolean;
  onSelect: (preset: ThemePreset) => void;
  isDark?: boolean;
}

const { width } = Dimensions.get('window');
const cardWidth = (width - 48) / 2; // 两列布局，考虑边距

export const ThemePresetCard: React.FC<ThemePresetCardProps> = ({
  preset,
  isSelected,
  onSelect,
  isDark = false,
}) => {
  const { theme } = useThemeContext();
  const presetConfig = themePresets[preset];
  const description = themePresetDescriptions[preset];
  const tags = themePresetTags[preset];

  // 获取预设的主要颜色用于预览
  const getPreviewColors = () => {
    if (!presetConfig) {
      // 默认主题颜色 - 使用当前主题颜色
      return {
        primary: theme?.colors?.primary || (isDark ? '#BB86FC' : '#6200EE'),
        secondary: theme?.colors?.secondary || (isDark ? '#03DAC6' : '#03DAC5'),
        tertiary: theme?.colors?.tertiary || (isDark ? '#CF6679' : '#018786'),
        background: theme?.colors?.background || (isDark ? '#121212' : '#FFFFFF'),
        surface: theme?.colors?.surface || (isDark ? '#1E1E1E' : '#F5F5F5'),
      };
    }
    return {
      primary: presetConfig.primary || theme?.colors?.primary || (isDark ? '#BB86FC' : '#6200EE'),
      secondary: presetConfig.secondary || theme?.colors?.secondary || (isDark ? '#03DAC6' : '#03DAC5'),
      tertiary: presetConfig.tertiary || theme?.colors?.tertiary || (isDark ? '#CF6679' : '#018786'),
      background: presetConfig.background || theme?.colors?.background || (isDark ? '#121212' : '#FFFFFF'),
      surface: presetConfig.surface || theme?.colors?.surface || (isDark ? '#1E1E1E' : '#F5F5F5'),
    };
  };

  const colors = getPreviewColors();

  const handlePress = () => {
    onSelect(preset);
  };

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,

        },
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {/* 颜色预览区域 */}
      <View style={styles.colorPreview}>
        <View style={styles.colorRow}>
          <View
            style={[
              styles.colorSwatch,
              styles.primarySwatch,
              { backgroundColor: colors.primary },
            ]}
          />
          <View
            style={[
              styles.colorSwatch,
              styles.secondarySwatch,
              { backgroundColor: colors.secondary },
            ]}
          />
        </View>
        <View style={styles.colorRow}>
          <View
            style={[
              styles.colorSwatch,
              styles.tertiarySwatch,
              { backgroundColor: colors.tertiary },
            ]}
          />
          <View
            style={[
              styles.colorSwatch,
              styles.backgroundSwatch,
              { backgroundColor: colors.background },
            ]}
          />
        </View>
      </View>

      {/* 主题信息 */}
      <View style={styles.info}>
        <Text
          style={[
            styles.title,
            {
              color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
              fontWeight: isSelected ? '600' : '500',
            },
          ]}
        >
          {preset === 'default' ? '默认' : preset.charAt(0).toUpperCase() + preset.slice(1)}
        </Text>
        
        <Text
          style={[
            styles.description,
            { color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666') },
          ]}
          numberOfLines={2}
        >
          {description}
        </Text>

        {/* 标签 */}
        <View style={styles.tagsContainer}>
          {tags.slice(0, 2).map((tag, index) => (
            <View
              key={index}
              style={[
                styles.tag,
                {
                  backgroundColor: colors.primary + '20',
                },
              ]}
            >
              <Text
                style={[
                  styles.tagText,
                  { color: colors.primary },
                ]}
              >
                {tag}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* 选中指示器 */}
      {isSelected && (
        <View
          style={[
            styles.selectedIndicator,
            { backgroundColor: colors.primary },
          ]}
        >
          <Text style={[styles.selectedText, { color: theme?.colors?.onPrimary || '#FFFFFF' }]}>✓</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: cardWidth,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: theme?.colors?.shadow || '#000000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  colorPreview: {
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },
  colorRow: {
    flexDirection: 'row',
    flex: 1,
  },
  colorSwatch: {
    flex: 1,
  },
  primarySwatch: {
    borderTopLeftRadius: 8,
  },
  secondarySwatch: {
    borderTopRightRadius: 8,
  },
  tertiarySwatch: {
    borderBottomLeftRadius: 8,
  },
  backgroundSwatch: {
    borderBottomRightRadius: 8,
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '500',
  },
  selectedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default ThemePresetCard;