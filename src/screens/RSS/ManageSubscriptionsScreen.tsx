import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Switch,
  useWindowDimensions,
  InteractionManager,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRSSSource } from '../../contexts/RSSSourceContext';
import { useRSSGroup } from '../../contexts/RSSGroupContext';
import { rssService } from '../../services/rss';
import { DatabaseService } from '../../database/DatabaseService';
import type { RSSSource } from '../../types';
import { VIRTUAL_GROUPS } from '../../types';
import * as StyleUtils from '../../utils/styleUtils';
import CustomTabBar from '../../components/CustomTabBar';
import CustomTabContent, { CustomTabContentHandle } from '../../components/CustomTabContent';
import { useSharedValue } from 'react-native-reanimated';

type NavigationProp = NativeStackNavigationProp<any, 'ManageSubscriptions'>;

const ManageSubscriptionsScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const navigation = useNavigation<NavigationProp>();
  const { rssSources, refreshRSSSources, syncAllSources, syncSource } = useRSSSource();
  const { groups, moveSourcesToGroup, refreshGroups } = useRSSGroup();
  const { width: screenWidth } = useWindowDimensions();
  const tabContentRef = useRef<CustomTabContentHandle>(null);
  const scrollX = useSharedValue(0);

  const [refreshing, setRefreshing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false); // 🚀 直接使用 Context 数据，无需加载等待
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSources, setSelectedSources] = useState<Set<number>>(new Set());
  const [isReady, setIsReady] = useState(false); // 🚀 用于控制是否开始渲染重型列表

  // 📦 构建 Tab 列表（全部 + 分组们 + 未分组）
  const routes = useMemo(() => {
    const tabs = [
      { key: 'all', title: '全部', groupId: VIRTUAL_GROUPS.ALL.id },
      ...groups.map(g => ({ key: `group-${g.id}`, title: g.name, groupId: g.id })),
      { key: 'uncategorized', title: '未分组', groupId: VIRTUAL_GROUPS.UNCATEGORIZED.id },
    ];
    return tabs;
  }, [groups]);

  // 根据当前 Tab 获取过滤后的源
  const getFilteredSources = useCallback((tabIndex: number): RSSSource[] => {
    const route = routes[tabIndex];
    if (!route) return rssSources;
    
    if (route.groupId === VIRTUAL_GROUPS.ALL.id) {
      return rssSources;
    } else if (route.groupId === VIRTUAL_GROUPS.UNCATEGORIZED.id) {
      return rssSources.filter(s => !s.groupId);
    } else {
      return rssSources.filter(s => s.groupId === route.groupId);
    }
  }, [routes, rssSources]);

  const filteredSources = useMemo(() => getFilteredSources(activeIndex), [getFilteredSources, activeIndex]);

  const styles = createStyles(isDark, theme);

  const handleTabPress = useCallback((tabIndex: number) => {
    setActiveIndex(tabIndex);
    tabContentRef.current?.scrollToIndex(tabIndex);
    // 切换 Tab 时取消选择模式
    if (selectionMode) {
      setSelectionMode(false);
      setSelectedSources(new Set());
    }
  }, [selectionMode]);

  const handleIndexChange = useCallback((newIndex: number) => {
    setActiveIndex(newIndex);
  }, []);

  // 🚀 关键优化：在转场动画结束后再渲染列表
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setIsReady(true);
    });
    return () => task.cancel();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await syncAllSources();
    } catch (error) {
      console.error('Refresh failed:', error);
      Alert.alert('刷新失败', '同步RSS源时出现错误');
    } finally {
      setRefreshing(false);
    }
  };

  const toggleSourceStatus = async (sourceId: number) => {
    try {
      const source = rssSources.find(s => s.id === sourceId);
      if (!source) return;

      const newStatus = !source.isActive;
      console.log(`Toggling source ${sourceId} from ${source.isActive} to ${newStatus}`);

      await rssService.updateRSSSource(sourceId, { isActive: newStatus });
      console.log(`Database update completed for source ${sourceId}`);

      await refreshRSSSources();

      console.log(`Local state updated for source ${sourceId}`);
    } catch (error) {
      console.error('Error toggling source status:', error);
      Alert.alert('操作失败', '无法更新RSS源状态');
    }
  };

  const deleteSource = (sourceId: number) => {
    const source = rssSources.find(s => s.id === sourceId);
    Alert.alert(
      '删除RSS源',
      `确定要删除 "${source?.name}" 吗？这将同时删除该源的所有文章。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await rssService.deleteRSSSource(sourceId);
              await refreshRSSSources();
            } catch (error) {
              console.error('Error deleting source:', error);
              Alert.alert('删除失败', '无法删除RSS源');
            }
          },
        },
      ]
    );
  };

  const clearSourceArticles = (sourceId: number) => {
    const source = rssSources.find(s => s.id === sourceId);
    Alert.alert(
      '清除文章',
      `确定要清除 "${source?.name}" 的所有文章和图片缓存吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清除',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = DatabaseService.getInstance();
              await db.executeStatement('DELETE FROM articles WHERE rss_source_id = ?', [sourceId]);
              // 更新计数
              await db.executeStatement(
                'UPDATE rss_sources SET article_count = 0, unread_count = 0 WHERE id = ?',
                [sourceId]
              );
              await refreshRSSSources();
              Alert.alert('成功', `已清除 "${source?.name}" 的所有文章`);
            } catch (error) {
              console.error('Error clearing source articles:', error);
              Alert.alert('清除失败', '无法清除文章');
            }
          },
        },
      ]
    );
  };

  const editSource = (sourceId: number) => {
    navigation.navigate('EditRSSSource', { sourceId });
  };

  const handleSyncSingleSource = async (sourceId: number) => {
    try {
      setLoading(true);
      await syncSource(sourceId);
      Alert.alert('刷新完成', '该源已成功更新');
    } catch (error) {
      console.error('Sync single source failed:', error);
      Alert.alert('刷新失败', '无法更新该RSS源');
    } finally {
      setLoading(false);
    }
  };

  const handleMoveSource = async (sourceId: number, direction: 'up' | 'down') => {
    try {
      const currentIndex = filteredSources.findIndex(s => s.id === sourceId);
      if ((direction === 'up' && currentIndex === 0) ||
        (direction === 'down' && currentIndex === filteredSources.length - 1)) {
        return; // 已经是首/尾
      }

      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      const sortedSources = [...filteredSources];
      [sortedSources[currentIndex], sortedSources[newIndex]] =
        [sortedSources[newIndex], sortedSources[currentIndex]];

      // 更新排序
      const updates = sortedSources.map((s, idx) => ({
        id: s.id,
        sortOrder: idx,
      }));

      await rssService.updateSourcesOrder(updates);
      await refreshRSSSources();
    } catch (error) {
      console.error('Error moving source:', error);
      Alert.alert('排序失败', '无法调整顺序');
    }
  };

  // 批量操作相关方法
  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedSources(new Set());
  };

  const toggleSourceSelection = (sourceId: number) => {
    const newSelection = new Set(selectedSources);
    if (newSelection.has(sourceId)) {
      newSelection.delete(sourceId);
    } else {
      newSelection.add(sourceId);
    }
    setSelectedSources(newSelection);
  };

  const selectAllSources = () => {
    const allIds = new Set(filteredSources.map(s => s.id));
    setSelectedSources(allIds);
  };

  const deselectAllSources = () => {
    setSelectedSources(new Set());
  };

  const handleBatchMoveToGroup = () => {
    if (selectedSources.size === 0) {
      Alert.alert('提示', '请选择至少一个源');
      return;
    }

    Alert.alert(
      '移动到分组',
      `选择目标分组（已选 ${selectedSources.size} 个源）`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '未分组',
          onPress: async () => {
            try {
              await moveSourcesToGroup(Array.from(selectedSources), null);
              Alert.alert('成功', '已移动到未分组');
              setSelectionMode(false);
              setSelectedSources(new Set());
              await refreshRSSSources();
            } catch (error) {
              console.error('Failed to move sources:', error);
              Alert.alert('失败', '移动源时出现错误');
            }
          },
        },
        ...groups.map(group => ({
          text: group.name,
          onPress: async () => {
            try {
              await moveSourcesToGroup(Array.from(selectedSources), group.id);
              Alert.alert('成功', `已移动到 "${group.name}"`);
              setSelectionMode(false);
              setSelectedSources(new Set());
              await refreshRSSSources();
            } catch (error) {
              console.error('Failed to move sources:', error);
              Alert.alert('失败', '移动源时出现错误');
            }
          },
        })),
      ]
    );
  };

  const handleBatchDelete = () => {
    if (selectedSources.size === 0) {
      Alert.alert('提示', '请选择至少一个源');
      return;
    }

    Alert.alert(
      '删除确认',
      `确定要删除选中的 ${selectedSources.size} 个源吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              for (const sourceId of selectedSources) {
                await rssService.deleteRSSSource(sourceId);
              }
              Alert.alert('成功', `已删除 ${selectedSources.size} 个源`);
              setSelectionMode(false);
              setSelectedSources(new Set());
              await refreshRSSSources();
            } catch (error) {
              console.error('Failed to delete sources:', error);
              Alert.alert('失败', '删除源时出现错误');
            }
          },
        },
      ]
    );
  };

  const formatLastUpdated = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return `${diffMins}分钟前`;
    } else if (diffHours < 24) {
      return `${diffHours}小时前`;
    } else {
      return `${diffDays}天前`;
    }
  };

  // 🎬 渲染每个 Tab 页面的内容
  const renderScene = useCallback(({ route, index: tabIndex }: { route: { key: string; title: string }; index: number }) => {
    // 从 routes 中查找对应的 groupId
    const routeData = routes[tabIndex];
    const sourcesForTab = getFilteredSources(tabIndex);
    
    // 🚀 关键优化 1：如果页面还没准备好（动画未结束），显示 Loading
    if (!isReady) {
      return (
        <View style={{ width: screenWidth, flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme?.colors?.primary} />
        </View>
      );
    }

    // 🚀 关键优化 2：使用 FlatList 替代 ScrollView
    return (
      <View style={{ width: screenWidth, flex: 1 }}>
        <FlatList
          data={sourcesForTab}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item, index }) => {
            const isSelected = selectedSources.has(item.id);
            return (
              <View style={{ paddingHorizontal: 16 }}>
                {renderSourceItem(item, index, isSelected, sourcesForTab.length)}
              </View>
            );
          }}
          // 将头部内容放入 ListHeaderComponent
          ListHeaderComponent={() => (
            <View style={styles.sourcesSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{route.title}</Text>
                <View style={styles.headerButtons}>
                  {/* 分组管理按钮 */}
                  <TouchableOpacity
                    style={styles.groupManageButton}
                    onPress={() => navigation.navigate('GroupManagement')}
                  >
                    <MaterialIcons
                      name="folder"
                      size={20}
                      color={theme?.colors?.primary}
                    />
                    <Text style={styles.groupManageButtonText}>分组</Text>
                  </TouchableOpacity>
                  
                  {/* 批量操作按钮 */}
                  <TouchableOpacity
                    style={[
                      styles.batchButton,
                      selectionMode && styles.batchButtonActive
                    ]}
                    onPress={toggleSelectionMode}
                  >
                    <MaterialIcons
                      name={selectionMode ? 'close' : 'checklist'}
                      size={20}
                      color={selectionMode ? theme?.colors?.onPrimary : theme?.colors?.primary}
                    />
                    <Text style={[
                      styles.batchButtonText,
                      selectionMode && styles.batchButtonTextActive
                    ]}>
                      {selectionMode ? '取消' : '批量'}
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => navigation.navigate('AddRSSSource')}
                  >
                    <MaterialIcons name="add" size={20} color={theme?.colors?.primary} />
                    <Text style={styles.addButtonText}>添加</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 批量操作工具栏 */}
              {selectionMode && (
                <View style={styles.batchToolbar}>
                  <View style={styles.batchInfo}>
                    <Text style={styles.batchInfoText}>
                      已选 {selectedSources.size} / {sourcesForTab.length}
                    </Text>
                    <TouchableOpacity onPress={selectedSources.size === sourcesForTab.length ? deselectAllSources : selectAllSources}>
                      <Text style={styles.batchSelectAllText}>
                        {selectedSources.size === sourcesForTab.length ? '取消全选' : '全选'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.batchActions}>
                    <TouchableOpacity
                      style={styles.batchActionButton}
                      onPress={handleBatchMoveToGroup}
                      disabled={selectedSources.size === 0}
                    >
                      <MaterialIcons name="folder" size={20} color={theme?.colors?.primary} />
                      <Text style={styles.batchActionText}>移动</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.batchActionButton, styles.batchDeleteButton]}
                      onPress={handleBatchDelete}
                      disabled={selectedSources.size === 0}
                    >
                      <MaterialIcons name="delete" size={20} color={theme?.colors?.error} />
                      <Text style={[styles.batchActionText, styles.batchDeleteText]}>删除</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
          // 将空状态放入 ListEmptyComponent
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <MaterialIcons
                name="rss-feed"
                size={48}
                color={theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E')}
              />
              <Text style={styles.emptyStateTitle}>暂无订阅源</Text>
              <Text style={styles.emptyStateText}>
                {routeData?.key === 'all' ? '还没有添加任何RSS源' : `${route.title}下暂无订阅源`}
              </Text>
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={() => navigation.navigate('AddRSSSource')}
              >
                <Text style={styles.emptyStateButtonText}>添加第一个RSS源</Text>
              </TouchableOpacity>
            </View>
          )}
          // 性能优化属性
          initialNumToRender={8}
          windowSize={5}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={true}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80 }}
          ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      </View>
    );
  }, [getFilteredSources, screenWidth, isReady, refreshing, onRefresh, selectionMode, selectedSources, styles, theme, isDark, navigation, groups, routes]);

  // 🎬 渲染单个源项
  const handleSourcePress = (source: RSSSource) => {
    if (selectionMode) {
      toggleSourceSelection(source.id);
    } else {
      // 🔀 穿透到首页，显示该源的标签
      navigation.navigate('Articles' as any, { 
        screen: 'HomeMain',
        params: {
          sourceId: source.id,
          sourceName: source.name
        }
      } as any);
    }
  };

  const renderSourceItem = (source: RSSSource, index: number, isSelected: boolean, totalCount: number) => (
    <TouchableOpacity
      key={source.id}
      style={[
        styles.sourceItem,
        selectionMode && isSelected && styles.sourceItemSelected,
      ]}
      onPress={() => handleSourcePress(source)}
      onLongPress={() => !selectionMode && toggleSelectionMode()}
      activeOpacity={selectionMode ? 0.7 : 1}
    >
      {/* 选择框 */}
      {selectionMode && (
        <View style={styles.selectionCheckbox}>
          <MaterialIcons
            name={isSelected ? 'check-box' : 'check-box-outline-blank'}
            size={24}
            color={isSelected ? theme?.colors?.primary : theme?.colors?.outline}
          />
        </View>
      )}
      
      {/* 主内容区域 */}
      <View style={styles.sourceContent}>
        <View style={styles.sourceHeader}>
          <View style={styles.sourceInfo}>
            <View style={styles.sourceTitleRow}>
              <View style={styles.sourceNameContainer}>
                <Text style={styles.sourceName}>{source.name}</Text>
                <View style={styles.contentTypeBadge}>
                  <MaterialIcons
                    name={source.contentType === 'text' ? 'text-fields' : 'image'}
                    size={12}
                    color={theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E')}
                  />
                  <Text style={styles.contentTypeText}>
                    {source.contentType === 'text' ? '纯文本' : '多媒体'}
                  </Text>
                </View>
              </View>
              <View style={styles.badgesRow}>
                {source.sourceMode === 'proxy' && (
                  <View style={[styles.statusBadge, styles.proxyBadge]}>
                    <Text style={[styles.statusText, styles.proxyText]}>代理</Text>
                  </View>
                )}
                <View style={[
                  styles.statusBadge,
                  source.isActive ? styles.activeBadge : styles.inactiveBadge
                ]}>
                  <Text style={[
                    styles.statusText,
                    source.isActive ? styles.activeText : styles.inactiveText
                  ]}>
                    {source.isActive ? '活跃' : '暂停'}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.sourceUrl}>{source.url}</Text>
            {source.description && (
              <Text style={styles.sourceDescription}>{source.description}</Text>
            )}

            {(source.errorCount || 0) > 0 && (
              <View style={styles.sourceMetaRow}>
                <View style={styles.errorBadge}>
                  <MaterialIcons name="error" size={12} color={theme?.colors?.error} />
                  <Text style={styles.errorBadgeText}>{source.errorCount} 错误</Text>
                </View>
              </View>
            )}

            <View style={styles.sourceStats}>
              <Text style={styles.sourceStatsText}>
                {source.article_count || 0} 篇文章 • {source.unread_count || 0} 篇未读 • {formatLastUpdated(new Date(source.last_updated || Date.now()))}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.sourceActions}>
          <View style={styles.sortMoveContainer}>
            <TouchableOpacity
              style={[styles.moveButton, index === 0 && styles.moveButtonDisabled]}
              onPress={() => handleMoveSource(source.id, 'up')}
              disabled={index === 0}
            >
              <MaterialIcons
                name="arrow-upward"
                size={18}
                color={index === 0 ? theme?.colors?.outline : theme?.colors?.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.moveButton, index === totalCount - 1 && styles.moveButtonDisabled]}
              onPress={() => handleMoveSource(source.id, 'down')}
              disabled={index === totalCount - 1}
            >
              <MaterialIcons
                name="arrow-downward"
                size={18}
                color={index === totalCount - 1 ? theme?.colors?.outline : theme?.colors?.primary}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.switchContainer}>
            <Text style={styles.switchLabel}>启用</Text>
            <Switch
              value={source.isActive}
              onValueChange={() => toggleSourceStatus(source.id)}
              trackColor={{
                false: theme?.colors?.outline || (isDark ? '#79747E' : '#79747E'),
                true: theme?.colors?.primary || '#3B82F6'
              }}
              thumbColor={source.isActive ? theme?.colors?.onPrimary : theme?.colors?.onSurfaceVariant}
            />
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => clearSourceArticles(source.id)}
            >
              <MaterialIcons
                name="clear-all"
                size={20}
                color={theme?.colors?.onSurfaceVariant}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleSyncSingleSource(source.id!)}
            >
              <MaterialIcons
                name="refresh"
                size={20}
                color={theme?.colors?.primary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => editSource(source.id)}
            >
              <MaterialIcons
                name="edit"
                size={20}
                color={theme?.colors?.onSurfaceVariant}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => deleteSource(source.id)}
            >
              <MaterialIcons
                name="delete"
                size={20}
                color={theme?.colors?.error || '#B3261E'}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  // 在 renderScene 之后不再重复声明 styles
  // const styles = createStyles(isDark, theme); // 已移至前面

  return (
    <View style={styles.container}>
      {/* 📌 固定 TabBar */}
      <CustomTabBar
        tabs={routes}
        scrollX={scrollX}
        screenWidth={screenWidth}
        activeIndex={activeIndex}
        onTabPress={handleTabPress}
      />

      {/* 👉 滑动内容区域 */}
      <CustomTabContent
        ref={tabContentRef}
        tabs={routes}
        renderScene={renderScene}
        scrollX={scrollX}
        onIndexChange={handleIndexChange}
        initialIndex={0}
      />
    </View>
  );
};

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme?.colors?.background || (isDark ? '#121212' : '#FFFFFF'),
  },
  statsSection: {},
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    height: 36,  // 🎯 匹配 sectionHeader 高度
    lineHeight: 36,  // 垂直居中
  },
  statsGrid: {},
  statCard: {},
  statNumber: {},
  statLabel: {},
  errorAlert: {},
  errorText: {},
  filterSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterChip: {
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipSelected: {
    backgroundColor: theme?.colors?.primary || '#3B82F6',
  },
  filterChipText: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  filterChipTextSelected: {
    color: theme?.colors?.onPrimary || '#FFFFFF',
    fontWeight: '500',
  },
  sourcesSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 0,  // 移除下边距，靠 ItemSeparatorComponent 处理
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    height: 36,  // 🎯 固定高度，与按钮对齐
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',  // 垂直居中
    height: 36,  // 🎯 与 sectionHeader 对齐
    gap: 8,
  },
  groupManageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme?.colors?.tertiaryContainer || (isDark ? '#633B48' : '#FFD8E4'),
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  groupManageButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme?.colors?.onTertiaryContainer || (isDark ? '#FFD8E4' : '#31111D'),
  },
  batchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  batchButtonActive: {
    backgroundColor: theme?.colors?.primary || '#6750A4',
  },
  batchButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme?.colors?.primary || '#6750A4',
  },
  batchButtonTextActive: {
    color: theme?.colors?.onPrimary || '#FFFFFF',
  },
  batchToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#4A4458' : '#E8DEF8'),
    borderRadius: 12,
    marginBottom: 12,
  },
  batchInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  batchInfoText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme?.colors?.onPrimaryContainer || (isDark ? '#E8DEF8' : '#21005D'),
  },
  batchSelectAllText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme?.colors?.primary || '#6750A4',
    textDecorationLine: 'underline',
  },
  batchActions: {
    flexDirection: 'row',
    gap: 8,
  },
  batchActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: theme?.colors?.surface || (isDark ? '#1C1B1F' : '#FFFBFE'),
    gap: 4,
  },
  batchActionText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme?.colors?.primary || '#6750A4',
  },
  batchDeleteButton: {
    // 特殊样式（可选）
  },
  batchDeleteText: {
    color: theme?.colors?.error || '#BA1A1A',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#004A77' : '#CCE7FF'),
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme?.colors?.primary || '#3B82F6',
  },
  sortButtonDisabled: {
    opacity: 0.3,
  },
  sortMoveContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  moveButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F5F5F5'),
    justifyContent: 'center',
    alignItems: 'center',
  },
  moveButtonDisabled: {
    opacity: 0.3,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#004A77' : '#CCE7FF'),
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme?.colors?.primary || '#3B82F6',
  },
  sourcesList: {
    gap: 12,
  },
  sourceItem: {
    ...StyleUtils.createCardStyle(isDark, theme),
    borderRadius: 16,  // 从 12 增加到 16
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sourceItemSelected: {
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#4A4458' : '#E8DEF8'),
    borderWidth: 2,
    borderColor: theme?.colors?.primary || '#6750A4',
  },
  selectionCheckbox: {
    marginRight: 12,
    paddingTop: 4,
  },
  sourceContent: {
    flex: 1,
  },
  sourceHeader: {
    marginBottom: 6,  // 从 8 减到 6，更紧凑
  },
  sourceInfo: {
    flex: 1,
  },
  sourceTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sourceNameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sourceName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  activeBadge: {
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#004A77' : '#CCE7FF'),
  },
  inactiveBadge: {
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#E7E0EC'),
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  activeText: {
    color: theme?.colors?.primary || '#3B82F6',
  },
  inactiveText: {
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  sourceUrl: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginBottom: 4,
  },
  sourceDescription: {
    fontSize: 14,
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 8,
  },
  sourceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  contentTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  contentTypeText: {
    fontSize: 10,
    fontWeight: '500',
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  proxyBadge: {
    backgroundColor: isDark ? '#2D2640' : '#EDE9FE',
  },
  proxyText: {
    color: '#8B5CF6',
  },
  sourceStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourceStatsText: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    flex: 1,
  },
  errorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme?.colors?.errorContainer || (isDark ? '#601410' : '#F9DEDC'),
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 2,
  },
  errorBadgeText: {
    fontSize: 10,
    color: theme?.colors?.onErrorContainer || (isDark ? '#F2B8B5' : '#601410'),
  },
  sourceActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,  // 从 8 减到 6
    borderTopWidth: 1,
    borderTopColor: theme?.colors?.outlineVariant || (isDark ? '#49454F' : '#CAC4D0'),
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchLabel: {
    fontSize: 14,
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#E7E0EC'),
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginTop: 16,
  },
  emptyStateText: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  emptyStateButton: {
    backgroundColor: theme?.colors?.primary || '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyStateButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme?.colors?.onPrimary || '#FFFFFF',
  },
});

export default ManageSubscriptionsScreen;