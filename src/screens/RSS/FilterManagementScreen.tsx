import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { DatabaseService } from '../../database/DatabaseService';
import { useRSSSource } from '../../contexts/RSSSourceContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type NavigationProp = NativeStackNavigationProp<any, 'FilterManagement'>;

interface FilterRule {
  id: number;
  keyword: string;
  is_regex: number;
  mode: 'include' | 'exclude';
  scope: 'global' | 'specific';
  created_at: string;
}

const FilterManagementScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const navigation = useNavigation<NavigationProp>();
  const db = DatabaseService.getInstance();
  const { rssSources } = useRSSSource();

  const [rules, setRules] = useState<FilterRule[]>([]);
  const [bindingsMap, setBindingsMap] = useState<Map<number, number[]>>(new Map());
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadRules();
    }, [])
  );

  const loadRules = async () => {
    try {
      setLoading(true);
      const allRules = await db.getAllRules();
      
      // 加载每个规则的绑定关系
      const bindingsData = new Map<number, number[]>();
      for (const rule of allRules) {
        if (rule.scope === 'specific') {
          const bindings = await db.getRuleBindings(rule.id);
          bindingsData.set(rule.id, bindings);
        }
      }

      setRules(allRules);
      setBindingsMap(bindingsData);
    } catch (error) {
      console.error('Error loading rules:', error);
      Alert.alert('错误', '加载规则失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (ruleId: number) => {
    Alert.alert(
      '删除规则',
      '确定要删除这条过滤规则吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.deleteRule(ruleId);
              await loadRules();
              Alert.alert('成功', '规则已删除');
            } catch (error) {
              console.error('Error deleting rule:', error);
              Alert.alert('错误', '删除规则失败');
            }
          },
        },
      ]
    );
  };

  const handleEdit = (ruleId: number) => {
    navigation.navigate('FilterRuleEditor', { ruleId });
  };

  const handleCreate = () => {
    navigation.navigate('FilterRuleEditor');
  };

  const getBindingSourceNames = (ruleId: number): string => {
    const bindings = bindingsMap.get(ruleId);
    if (!bindings || bindings.length === 0) return '';

    const sourceNames = bindings
      .map(sourceId => rssSources.find(s => s.id === sourceId)?.name)
      .filter(Boolean);

    if (sourceNames.length === 0) return '';
    if (sourceNames.length === 1) return sourceNames[0]!;
    if (sourceNames.length === 2) return `${sourceNames[0]}, ${sourceNames[1]}`;
    return `${sourceNames[0]}, ${sourceNames[1]} 等${sourceNames.length}个源`;
  };

  const renderRuleItem = ({ item }: { item: FilterRule }) => {
    const isGlobal = item.scope === 'global';
    const isInclude = item.mode === 'include';
    const isRegex = item.is_regex === 1;

    return (
      <View style={[styles.ruleCard, { backgroundColor: theme.colors.surface }]}>
        {/* 关键词 */}
        <View style={styles.ruleHeader}>
          <View style={styles.keywordRow}>
            {isRegex && (
              <View style={[styles.badge, { backgroundColor: theme.colors.secondaryContainer }]}>
                <Text style={[styles.badgeText, { color: theme.colors.onSecondaryContainer }]}>
                  正则
                </Text>
              </View>
            )}
            <Text style={styles.keyword} numberOfLines={2}>
              {item.keyword}
            </Text>
          </View>

          {/* 操作按钮 */}
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={() => handleEdit(item.id)}
              style={styles.actionBtn}
              activeOpacity={0.7}
            >
              <MaterialIcons name="edit" size={20} color={theme.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDelete(item.id)}
              style={styles.actionBtn}
              activeOpacity={0.7}
            >
              <MaterialIcons name="delete" size={20} color={theme.colors.error} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 详细信息 */}
        <View style={styles.ruleDetails}>
          {/* 模式徽章 */}
          <View
            style={[
              styles.badge,
              {
                backgroundColor: isInclude
                  ? theme.colors.primaryContainer
                  : theme.colors.errorContainer,
              },
            ]}
          >
            <MaterialIcons
              name={isInclude ? 'check-circle' : 'block'}
              size={14}
              color={isInclude ? theme.colors.primary : theme.colors.error}
            />
            <Text
              style={[
                styles.badgeText,
                { color: isInclude ? theme.colors.primary : theme.colors.error },
              ]}
            >
              {isInclude ? '保留' : '屏蔽'}
            </Text>
          </View>

          {/* 范围徽章 */}
          <View
            style={[
              styles.badge,
              {
                backgroundColor: isGlobal
                  ? theme.colors.tertiaryContainer
                  : theme.colors.surfaceContainerHigh,
              },
            ]}
          >
            <MaterialIcons
              name={isGlobal ? 'public' : 'radio-button-checked'}
              size={14}
              color={isGlobal ? theme.colors.tertiary : theme.colors.onSurfaceVariant}
            />
            <Text
              style={[
                styles.badgeText,
                {
                  color: isGlobal
                    ? theme.colors.tertiary
                    : theme.colors.onSurfaceVariant,
                },
              ]}
            >
              {isGlobal ? '全局' : `指定源: ${bindingsMap.get(item.id)?.length || 0}个`}
            </Text>
          </View>
        </View>

        {/* 显示绑定的源 */}
        {!isGlobal && bindingsMap.get(item.id)?.length && (
          <View style={styles.bindingInfo}>
            <MaterialIcons
              name="link"
              size={14}
              color={theme.colors.onSurfaceVariant}
            />
            <Text style={styles.bindingText} numberOfLines={1}>
              {getBindingSourceNames(item.id)}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const styles = createStyles(isDark, theme);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 头部说明 */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <MaterialIcons name="filter-list" size={28} color={theme.colors.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>过滤规则管理</Text>
          <Text style={styles.headerSubtitle}>
            已配置 {rules.length} 条规则，智能过滤文章内容
          </Text>
        </View>
      </View>

      {/* 规则列表 */}
      <FlatList
        data={rules}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderRuleItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="filter-list-off" size={64} color={theme.colors.outline} />
            <Text style={styles.emptyTitle}>暂无过滤规则</Text>
            <Text style={styles.emptyText}>
              点击下方"添加规则"按钮创建您的第一条过滤规则
            </Text>
          </View>
        }
      />

      {/* FAB 添加按钮 */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={handleCreate}
        activeOpacity={0.9}
      >
        <MaterialIcons name="add" size={28} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (isDark: boolean, theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
    },
    header: {
      flexDirection: 'row',
      padding: 20,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outlineVariant,
    },
    headerIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.colors.primaryContainer,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 16,
    },
    headerText: {
      flex: 1,
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.colors.onSurface,
    },
    headerSubtitle: {
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
      marginTop: 4,
    },
    listContent: {
      padding: 16,
      paddingBottom: 100,
    },
    ruleCard: {
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0 : 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    ruleHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    keywordRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    keyword: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.onSurface,
      flex: 1,
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
    },
    actionBtn: {
      padding: 6,
    },
    ruleDetails: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 8,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '600',
    },
    bindingInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.outlineVariant,
    },
    bindingText: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      flex: 1,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 60,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.onSurface,
      marginTop: 16,
    },
    emptyText: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      marginTop: 8,
      textAlign: 'center',
      paddingHorizontal: 40,
    },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 30,
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
  });

export default FilterManagementScreen;
