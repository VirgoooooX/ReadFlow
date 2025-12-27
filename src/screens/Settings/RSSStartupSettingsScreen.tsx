import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useRSSSource } from '../../contexts/RSSSourceContext';
import { SettingItem, SettingGroup, SettingSection } from '../../components/ui';
import { typography } from '../../theme/typography';
import ScreenWithCustomHeader from '../../components/ScreenWithCustomHeader';

const RSSStartupSettingsScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const { rssSources, startupSettings, updateStartupSettings } = useRSSSource();
  const styles = createStyles(isDark, theme);

  // 本地状态，用于快速响应 UI
  const [enabled, setEnabled] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // 初始化状态
  useEffect(() => {
    setEnabled(startupSettings.enabled);
    setSelectedIds(new Set(startupSettings.sourceIds));
  }, [startupSettings]);

  // 切换总开关
  const handleToggleEnable = async (value: boolean) => {
    setEnabled(value);
    await updateStartupSettings({
      enabled: value,
      sourceIds: Array.from(selectedIds),
    });
  };

  // 切换单个源
  const handleToggleSource = async (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
    
    // 自动保存
    await updateStartupSettings({
      enabled,
      sourceIds: Array.from(newSet),
    });
  };

  // 全选
  const handleSelectAll = async () => {
    const allIds = rssSources.map(s => s.id);
    const newSet = new Set(allIds);
    setSelectedIds(newSet);
    await updateStartupSettings({
      enabled,
      sourceIds: allIds,
    });
  };

  // 全不选
  const handleDeselectAll = async () => {
    setSelectedIds(new Set());
    await updateStartupSettings({
      enabled,
      sourceIds: [],
    });
  };

  const renderItem = ({ item }: { item: any }) => {
    const isSelected = selectedIds.has(item.id);
    
    return (
      <TouchableOpacity
        style={[styles.sourceItem, !enabled && styles.disabledItem]}
        onPress={() => enabled && handleToggleSource(item.id)}
        disabled={!enabled}
        activeOpacity={0.7}
      >
        <View style={styles.sourceInfo}>
          {item.iconUrl ? (
            <MaterialIcons name="rss-feed" size={20} color={theme.colors.primary} />
          ) : (
            <MaterialIcons name="rss-feed" size={20} color={theme.colors.onSurfaceVariant} />
          )}
          <Text style={[styles.sourceName, !enabled && styles.disabledText]} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
        <MaterialIcons
          name={isSelected ? 'check-box' : 'check-box-outline-blank'}
          size={24}
          color={enabled 
            ? (isSelected ? theme.colors.primary : theme.colors.onSurfaceVariant)
            : theme.colors.outline
          }
        />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* 顶部开关区域 */}
      <View style={styles.headerSection}>
        <SettingGroup>
          <SettingItem
            label="开机自动后台刷新"
            icon="autorenew"
            isLast
            rightElement={
              <Switch
                value={enabled}
                onValueChange={handleToggleEnable}
                trackColor={{ false: '#767577', true: theme.colors.primary }}
                thumbColor={enabled ? '#fff' : '#f4f3f4'}
              />
            }
          />
        </SettingGroup>
        
        <Text style={styles.helperText}>
          开启后，App 启动时会自动在后台刷新选中的 RSS 源。
        </Text>
      </View>

      {/* 源选择列表 */}
      <View style={styles.listContainer}>
        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>
            选择要刷新的源 ({selectedIds.size}/{rssSources.length})
          </Text>
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              onPress={handleSelectAll} 
              disabled={!enabled}
              style={styles.actionBtn}
            >
              <Text style={[styles.actionBtnText, !enabled && styles.disabledText]}>全选</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity 
              onPress={handleDeselectAll} 
              disabled={!enabled}
              style={styles.actionBtn}
            >
              <Text style={[styles.actionBtnText, !enabled && styles.disabledText]}>清空</Text>
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={rssSources}
          renderItem={renderItem}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>暂无订阅源</Text>
            </View>
          }
        />
      </View>
    </View>
  );
};

const createStyles = (isDark: boolean, theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background || (isDark ? '#121212' : '#F5F5F5'),
    },
    headerSection: {
      padding: 16,
      paddingBottom: 8,
    },
    helperText: {
      ...typography.bodySmall,
      color: theme.colors.onSurfaceVariant,
      marginTop: 8,
      marginLeft: 4,
    },
    listContainer: {
      flex: 1,
      marginTop: 8,
      marginHorizontal: 16,
      marginBottom: 16,
      backgroundColor: theme.colors.surface,
      borderRadius: 24,
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      overflow: 'hidden',
    },
    listHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outlineVariant,
    },
    sectionTitle: {
      ...typography.titleMedium,
      color: theme.colors.onSurface,
      fontWeight: '600',
    },
    actionButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 16,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    actionBtn: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    actionBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.primary,
    },
    divider: {
      width: 1,
      height: 12,
      backgroundColor: theme.colors.outline,
      marginHorizontal: 2,
    },
    listContent: {
      padding: 16,
      paddingBottom: 32,
    },
    sourceItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outlineVariant,
    },
    sourceInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 16,
    },
    sourceName: {
      ...typography.bodyLarge,
      color: theme.colors.onSurface,
      marginLeft: 12,
    },
    disabledItem: {
      opacity: 0.5,
    },
    disabledText: {
      color: theme.colors.outline,
    },
    emptyContainer: {
      padding: 32,
      alignItems: 'center',
    },
    emptyText: {
      color: theme.colors.onSurfaceVariant,
    },
  });

export default RSSStartupSettingsScreen;
