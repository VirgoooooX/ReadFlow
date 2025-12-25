import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { typography } from '../../theme/typography';

interface SettingItemProps {
  icon?: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress?: () => void;
  color?: string;
  valueText?: string;
  showArrow?: boolean;
  rightElement?: React.ReactNode;
  isLast?: boolean;
  isDestructive?: boolean;
  disabled?: boolean;
}

/**
 * 基础设置选项组件
 */
export const SettingItem: React.FC<SettingItemProps> = ({
  icon,
  label,
  onPress,
  color,
  valueText,
  showArrow = true,
  rightElement,
  isLast = false,
  isDestructive = false,
  disabled = false,
}) => {
  const { theme, isDark } = useThemeContext();
  const styles = createStyles(isDark, theme);

  return (
    <>
      <TouchableOpacity
        style={styles.menuItem}
        onPress={onPress}
        activeOpacity={onPress ? 0.6 : 1}
        disabled={disabled || (!onPress && !rightElement)}
      >
        <View style={styles.menuLeft}>
          {icon && (
            <View style={styles.menuIconBox}>
              <MaterialIcons
                name={icon}
                size={20}
                color={
                  isDestructive
                    ? theme?.colors?.error || '#EF4444'
                    : color || theme?.colors?.onSurfaceVariant || '#666'
                }
              />
            </View>
          )}
          <Text
            style={[
              styles.menuText,
              isDestructive && { color: theme?.colors?.error || '#EF4444' },
            ]}
          >
            {label}
          </Text>
        </View>

        <View style={styles.menuRight}>
          {valueText && <Text style={styles.menuValueText}>{valueText}</Text>}
          {rightElement}
          {showArrow && !rightElement && (
            <MaterialIcons
              name="chevron-right"
              size={20}
              color={theme?.colors?.outline || '#999'}
            />
          )}
        </View>
      </TouchableOpacity>
      {!isLast && <View style={styles.menuDivider} />}
    </>
  );
};

interface SettingSliderItemProps {
  icon?: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (value: number) => void;
  unit?: string;
  isLast?: boolean;
}

/**
 * 带滑动条的设置选项组件
 */
export const SettingSliderItem: React.FC<SettingSliderItemProps> = ({
  icon,
  label,
  value,
  min,
  max,
  step,
  onValueChange,
  unit = '',
  isLast = false,
}) => {
  const { theme, isDark } = useThemeContext();
  const styles = createStyles(isDark, theme);

  return (
    <>
      <View style={styles.sliderItemContainer}>
        <View style={styles.sliderHeader}>
          <View style={styles.menuLeft}>
            {icon && (
              <View style={styles.menuIconBox}>
                <MaterialIcons
                  name={icon}
                  size={20}
                  color={theme?.colors?.primary || '#3B82F6'}
                />
              </View>
            )}
            <Text style={styles.menuText}>{label}</Text>
          </View>
          <Text style={styles.menuValueText}>{value.toFixed(step < 1 ? 1 : 0)}{unit}</Text>
        </View>
        <View style={styles.sliderBody}>
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
      {!isLast && <View style={styles.menuDivider} />}
    </>
  );
};

interface SettingGroupProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * 设置选项分组容器 (卡片外观)
 */
export const SettingGroup: React.FC<SettingGroupProps> = ({ children, style }) => {
  const { theme, isDark } = useThemeContext();
  const styles = createStyles(isDark, theme);

  return <View style={[styles.menuGroupCard, style]}>{children}</View>;
};

interface SettingSectionProps {
  title: string;
  children: React.ReactNode;
  containerStyle?: ViewStyle;
}

/**
 * 带标题的设置分组
 */
export const SettingSection: React.FC<SettingSectionProps> = ({
  title,
  children,
  containerStyle,
}) => {
  const { theme, isDark } = useThemeContext();
  const styles = createStyles(isDark, theme);

  return (
    <View style={[styles.menuGroupContainer, containerStyle]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <SettingGroup>{children}</SettingGroup>
    </View>
  );
};

const createStyles = (isDark: boolean, theme: any) =>
  StyleSheet.create({
    menuGroupContainer: {
      marginBottom: 20,
    },
    menuGroupCard: {
      backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
      borderRadius: 12,
      overflow: 'hidden',
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
      paddingVertical: 10,
      paddingHorizontal: 14,
      minHeight: 52, // 统一最小高度，确保一致性
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
      width: 32,
      height: 32,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    menuText: {
      ...typography.bodyLarge,
      fontWeight: '500',
      color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
    },
    menuRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    menuValueText: {
      ...typography.bodySmall,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
      fontWeight: '500',
    },
    sectionTitle: {
      ...typography.titleMedium,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
      marginBottom: 10,
      marginTop: -5,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    // Slider Item Specific Styles
    sliderItemContainer: {
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    sliderHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    sliderBody: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 42, // Align with text (32 icon + 10 margin)
    },
    slider: {
      flex: 1,
      height: 30,
    },
    sliderLabel: {
      fontSize: 10,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
      minWidth: 24,
      textAlign: 'center',
    },
  });
