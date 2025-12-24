import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  StyleSheet,
  Alert,
  Keyboard,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { DatabaseService } from '../../database/DatabaseService';
import { useRSSSource } from '../../contexts/RSSSourceContext';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type RouteParams = {
  FilterRuleEditor: {
    sourceId?: number;
    ruleId?: number;
  };
};

type NavigationProp = NativeStackNavigationProp<any, 'FilterRuleEditor'>;
type FilterRuleEditorRouteProp = RouteProp<RouteParams, 'FilterRuleEditor'>;

const FilterRuleEditorScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<FilterRuleEditorRouteProp>();
  const db = DatabaseService.getInstance();
  const { rssSources } = useRSSSource();

  // 如果是从某个源跳过来的，默认选中它
  const initialSourceId = route.params?.sourceId;
  const editingRuleId = route.params?.ruleId;

  const [keyword, setKeyword] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [mode, setMode] = useState<'exclude' | 'include'>('exclude');
  const [scope, setScope] = useState<'global' | 'specific'>('global');
  const [selectedSources, setSelectedSources] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  // 加载编辑的规则
  useEffect(() => {
    if (editingRuleId) {
      loadRule();
    } else if (initialSourceId) {
      // 新建模式且指定了源
      setScope('specific');
      setSelectedSources(new Set([initialSourceId]));
    }
  }, [editingRuleId, initialSourceId]);

  const loadRule = async () => {
    if (!editingRuleId) return;

    try {
      const rules = await db.executeQuery(
        'SELECT * FROM filter_rules WHERE id = ?',
        [editingRuleId]
      );

      if (rules.length === 0) {
        Alert.alert('错误', '规则不存在');
        navigation.goBack();
        return;
      }

      const rule = rules[0];
      setKeyword(rule.keyword);
      setIsRegex(rule.is_regex === 1);
      setMode(rule.mode);
      setScope(rule.scope);

      if (rule.scope === 'specific') {
        const bindings = await db.getRuleBindings(rule.id);
        setSelectedSources(new Set(bindings));
      }
    } catch (error) {
      console.error('Error loading rule:', error);
      Alert.alert('错误', '加载规则失败');
    }
  };

  const handleSave = async () => {
    if (!keyword.trim()) {
      Alert.alert('错误', '请输入关键词');
      return;
    }

    if (scope === 'specific' && selectedSources.size === 0) {
      Alert.alert('错误', '请至少选择一个应用源，或切换为全局模式');
      return;
    }

    // 正则验证
    if (isRegex) {
      try {
        new RegExp(keyword);
      } catch (e) {
        Alert.alert('错误', '正则表达式语法无效');
        return;
      }
    }

    try {
      setLoading(true);
      Keyboard.dismiss();

      if (editingRuleId) {
        // 更新模式
        await db.updateRule(
          editingRuleId,
          keyword.trim(),
          isRegex,
          mode,
          scope,
          Array.from(selectedSources)
        );
        Alert.alert('成功', '规则已更新', [
          { text: '确定', onPress: () => navigation.goBack() }
        ]);
      } else {
        // 新建模式
        await db.createRule(
          keyword.trim(),
          isRegex,
          mode,
          scope,
          Array.from(selectedSources)
        );
        Alert.alert('成功', '规则已添加', [
          { text: '确定', onPress: () => navigation.goBack() }
        ]);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('失败', '保存规则时出错');
    } finally {
      setLoading(false);
    }
  };

  const toggleSource = (id: number) => {
    const newSet = new Set(selectedSources);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedSources(newSet);
  };

  const styles = createStyles(isDark, theme);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <MaterialIcons name="filter-list" size={32} color={theme.colors.primary} />
        <Text style={styles.headerTitle}>
          {editingRuleId ? '编辑过滤规则' : '新建过滤规则'}
        </Text>
        <Text style={styles.headerSubtitle}>
          配置智能过滤规则，自动筛选文章内容
        </Text>
      </View>

      {/* 1. 关键词输入 */}
      <View style={styles.card}>
        <Text style={styles.label}>关键词 / 正则表达式</Text>
        <TextInput
          style={styles.input}
          value={keyword}
          onChangeText={setKeyword}
          placeholder={isRegex ? "例如：^Apple.*Pro$" : "例如：广告"}
          placeholderTextColor={theme.colors.outline}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.row}>
          <View>
            <Text style={styles.subLabel}>使用正则表达式匹配</Text>
            <Text style={styles.hint}>启用后支持高级模式匹配</Text>
          </View>
          <Switch 
            value={isRegex} 
            onValueChange={setIsRegex}
            trackColor={{ true: theme.colors.primary }}
          />
        </View>
      </View>

      {/* 2. 模式选择 */}
      <View style={styles.card}>
        <Text style={styles.label}>处理模式</Text>
        <View style={styles.segmentRow}>
          <TouchableOpacity
            style={[styles.segment, mode === 'exclude' && styles.segmentActiveError]}
            onPress={() => setMode('exclude')}
            activeOpacity={0.8}
          >
            <MaterialIcons 
              name="block" 
              size={18} 
              color={mode === 'exclude' ? '#FFF' : theme.colors.onSurfaceVariant} 
            />
            <Text style={[styles.segmentText, mode === 'exclude' && styles.segmentTextActive]}>
              屏蔽 (黑名单)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segment, mode === 'include' && styles.segmentActivePrimary]}
            onPress={() => setMode('include')}
            activeOpacity={0.8}
          >
            <MaterialIcons 
              name="check-circle" 
              size={18} 
              color={mode === 'include' ? '#FFF' : theme.colors.onSurfaceVariant} 
            />
            <Text style={[styles.segmentText, mode === 'include' && styles.segmentTextActive]}>
              保留 (白名单)
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>
          {mode === 'exclude' 
            ? '匹配到该规则的文章将被过滤掉' 
            : '只保留匹配该规则的文章，其他文章将被过滤'}
        </Text>
      </View>

      {/* 3. 应用范围 (核心功能) */}
      <View style={styles.card}>
        <Text style={styles.label}>应用范围</Text>
        <View style={styles.segmentRow}>
          <TouchableOpacity
            style={[styles.segment, scope === 'global' && styles.segmentActiveStd]}
            onPress={() => setScope('global')}
            activeOpacity={0.8}
          >
            <MaterialIcons 
              name="public" 
              size={18} 
              color={scope === 'global' ? '#FFF' : theme.colors.onSurfaceVariant} 
            />
            <Text style={[styles.segmentText, scope === 'global' && styles.segmentTextActive]}>
              全局 (所有源)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segment, scope === 'specific' && styles.segmentActiveStd]}
            onPress={() => setScope('specific')}
            activeOpacity={0.8}
          >
            <MaterialIcons 
              name="radio-button-checked" 
              size={18} 
              color={scope === 'specific' ? '#FFF' : theme.colors.onSurfaceVariant} 
            />
            <Text style={[styles.segmentText, scope === 'specific' && styles.segmentTextActive]}>
              指定源
            </Text>
          </TouchableOpacity>
        </View>

        {/* 源选择列表 (仅在 specific 模式显示) */}
        {scope === 'specific' && (
          <View style={styles.sourceList}>
            <View style={styles.sourceListHeader}>
              <Text style={styles.subLabel}>选择应用该规则的订阅源：</Text>
              <Text style={styles.countBadge}>
                已选 {selectedSources.size}/{rssSources.length}
              </Text>
            </View>

            {rssSources.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="inbox" size={48} color={theme.colors.outline} />
                <Text style={styles.emptyText}>暂无订阅源</Text>
              </View>
            ) : (
              <ScrollView 
                style={styles.sourceScrollView}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
              >
                {rssSources.map((source) => {
                  const isSelected = selectedSources.has(source.id);
                  return (
                    <TouchableOpacity
                      key={source.id}
                      style={[styles.sourceItem, isSelected && styles.sourceItemSelected]}
                      onPress={() => toggleSource(source.id)}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name={isSelected ? 'check-box' : 'check-box-outline-blank'}
                        size={22}
                        color={isSelected ? theme.colors.primary : theme.colors.outline}
                      />
                      <View style={styles.sourceInfo}>
                        <Text style={[styles.sourceName, isSelected && { color: theme.colors.primary }]}>
                          {source.name}
                        </Text>
                        {source.description && (
                          <Text style={styles.sourceDesc} numberOfLines={1}>
                            {source.description}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}
      </View>

      {/* 保存按钮 */}
      <TouchableOpacity
        style={[styles.saveButton, loading && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={loading}
        activeOpacity={0.8}
      >
        <MaterialIcons name="save" size={20} color="#FFF" />
        <Text style={styles.saveButtonText}>
          {editingRuleId ? '保存更改' : '创建规则'}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const createStyles = (isDark: boolean, theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      padding: 20,
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      marginTop: 12,
      color: theme.colors.onSurface,
    },
    headerSubtitle: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      marginTop: 4,
      textAlign: 'center',
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 16,
      marginHorizontal: 16,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0 : 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    label: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.onSurface,
      marginBottom: 12,
    },
    subLabel: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      fontWeight: '500',
    },
    hint: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      marginTop: 4,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      color: theme.colors.onSurface,
      marginBottom: 12,
      backgroundColor: theme.colors.surfaceContainer,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    segmentRow: {
      flexDirection: 'row',
      backgroundColor: theme.colors.surfaceContainer,
      borderRadius: 12,
      padding: 4,
      marginBottom: 12,
    },
    segment: {
      flex: 1,
      flexDirection: 'row',
      gap: 6,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: 10,
    },
    segmentActiveError: {
      backgroundColor: theme.colors.error,
    },
    segmentActivePrimary: {
      backgroundColor: theme.colors.primary,
    },
    segmentActiveStd: {
      backgroundColor: theme.colors.secondary,
    },
    segmentText: {
      fontWeight: '600',
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
    },
    segmentTextActive: {
      color: '#FFF',
    },
    sourceList: {
      marginTop: 12,
      maxHeight: 400,
    },
    sourceScrollView: {
      maxHeight: 400,
    },
    sourceListHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    countBadge: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.primary,
      backgroundColor: theme.colors.primaryContainer,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    sourceItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 8,
      marginBottom: 6,
      backgroundColor: theme.colors.surfaceContainer,
    },
    sourceItemSelected: {
      backgroundColor: theme.colors.primaryContainer,
    },
    sourceInfo: {
      marginLeft: 12,
      flex: 1,
    },
    sourceName: {
      fontSize: 15,
      fontWeight: '500',
      color: theme.colors.onSurface,
    },
    sourceDesc: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      marginTop: 2,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 40,
    },
    emptyText: {
      marginTop: 12,
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
    },
    saveButton: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.colors.primary,
      paddingVertical: 16,
      borderRadius: 16,
      marginHorizontal: 16,
      marginTop: 8,
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    saveButtonDisabled: {
      opacity: 0.5,
    },
    saveButtonText: {
      color: '#FFF',
      fontSize: 16,
      fontWeight: 'bold',
    },
  });

export default FilterRuleEditorScreen;
