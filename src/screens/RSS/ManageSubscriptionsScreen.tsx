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
  Vibration,
  BackHandler,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { typography } from '../../theme/typography';
import { useRSSSource } from '../../contexts/RSSSourceContext';
import { useRSSGroup } from '../../contexts/RSSGroupContext';
import { rssService } from '../../services/rss';
import { logger } from '../../services/rss/RSSUtils';
import { DatabaseService } from '../../database/DatabaseService';
import cacheEventEmitter from '../../services/CacheEventEmitter';
import type { RSSSource } from '../../types';
import { VIRTUAL_GROUPS } from '../../types';
import * as StyleUtils from '../../utils/styleUtils';
import CustomTabBar from '../../components/CustomTabBar';
import CustomTabContent, { CustomTabContentHandle } from '../../components/CustomTabContent';
import GroupSelectionModal from '../../components/GroupSelectionModal';
import { useSharedValue } from 'react-native-reanimated';

type NavigationProp = NativeStackNavigationProp<any, 'ManageSubscriptions'>;

const ManageSubscriptionsScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const navigation = useNavigation<NavigationProp>();
  const { rssSources, refreshRSSSources, syncAllSources, syncSource, syncSources } = useRSSSource();
  const { groups, moveSourcesToGroup } = useRSSGroup();
  const { width: screenWidth } = useWindowDimensions();
  const tabContentRef = useRef<CustomTabContentHandle>(null);
  const scrollX = useSharedValue(0);

  const [refreshing, setRefreshing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  
  // 模式控制：普通浏览 vs 管理模式
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedSources, setSelectedSources] = useState<Set<number>>(new Set());
  const [showMoveGroupModal, setShowMoveGroupModal] = useState(false);
  const [activeSourceId, setActiveSourceId] = useState<number | null>(null); // 用于 ActionSheet
  const [showActionSheet, setShowActionSheet] = useState(false); // ActionSheet 显示状态

  // 1. 计算全局统计数据
  const stats = useMemo(() => {
    const total = rssSources.length;
    const unread = rssSources.reduce((acc, s) => acc + (s.unread_count || 0), 0);
    // 简单的今日更新计算 (过去24小时)
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const active = rssSources.filter(s => {
      const last = s.last_updated ? new Date(s.last_updated).getTime() : 0;
      return (now - last) < oneDay;
    }).length;
    
    return { total, unread, active };
  }, [rssSources]);

  // 2. 构建 Tab 列表
  const routes = useMemo(() => {
    const tabs = [
      { key: 'all', title: '全部', groupId: VIRTUAL_GROUPS.ALL.id },
      ...groups.map(g => ({ key: `group-${g.id}`, title: g.name, groupId: g.id })),
      { key: 'uncategorized', title: VIRTUAL_GROUPS.UNCATEGORIZED.name, groupId: VIRTUAL_GROUPS.UNCATEGORIZED.id },
    ];
    return tabs;
  }, [groups]);

  // 3. 过滤源
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

  // 初始化
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setIsReady(true);
    });
    return () => task.cancel();
  }, []);

  // 处理返回按钮：编辑模式下拦截返回，退出编辑模式
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!isEditMode) {
        // 非编辑模式，允许正常返回
        return;
      }

      // 编辑模式下，阻止返回行为
      e.preventDefault();

      // 退出编辑模式
      setIsEditMode(false);
      setSelectedSources(new Set());
    });

    return unsubscribe;
  }, [navigation, isEditMode]);

  // 处理 Android 硬件返回键
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isEditMode) {
        // 编辑模式下，拦截返回键，退出编辑模式
        setIsEditMode(false);
        setSelectedSources(new Set());
        return true; // 阻止默认返回行为
      }
      return false; // 允许默认返回行为
    });

    return () => backHandler.remove();
  }, [isEditMode]);

  const handleTabPress = useCallback((tabIndex: number) => {
    setActiveIndex(tabIndex);
    tabContentRef.current?.scrollToIndex(tabIndex);
    // 编辑模式下切换标签，保持编辑状态和选中项（可选，或者清除选中）
    if (isEditMode) {
       // 用户可能想跨分组批量操作，这里暂时不清空
    }
  }, [isEditMode]);

  const handleIndexChange = useCallback((newIndex: number) => {
    setActiveIndex(newIndex);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // 获取当前 Tab 对应的源列表
      const currentSources = getFilteredSources(activeIndex);
      // 过滤出活跃的源 ID
      const activeSourceIds = currentSources
        .filter(s => s.isActive)
        .map(s => s.id);

      if (activeSourceIds.length === 0) {
        console.log('[ManageSubscriptions] 当前分组没有活跃源，跳过刷新');
        setRefreshing(false);
        return;
      }

      console.log(`[ManageSubscriptions] 正在刷新当前分组 (${activeSourceIds.length} 个源)...`);
      
      // 使用批量同步方法
      await syncSources(activeSourceIds, (current, total, name) => {
         logger.info(`[ManageSubscriptions] 进度: ${current}/${total} - ${name}`);
      });
      
    } catch (error) {
      console.error('Refresh failed:', error);
      Alert.alert('刷新失败', '同步RSS源时出现错误');
    } finally {
      setRefreshing(false);
    }
  };

  // --- 业务逻辑 (完整保留) ---
  const toggleSourceStatus = async (sourceId: number) => {
    try {
      const source = rssSources.find(s => s.id === sourceId);
      if (!source) return;
      const newStatus = !source.isActive;
      await rssService.updateRSSSource(sourceId, { isActive: newStatus });
      await refreshRSSSources();
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
              // 【优化】触发更细粒度的源删除事件
              cacheEventEmitter.sourceDeleted(sourceId, source?.name);
              console.log(`✅ 已触发源删除事件: ${source?.name}`);
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
              await db.executeStatement(
                'UPDATE rss_sources SET article_count = 0, unread_count = 0 WHERE id = ?',
                [sourceId]
              );
              // 【优化】触发更细粒度的清除单源缓存事件
              cacheEventEmitter.clearSourceArticles(sourceId, source?.name);
              // 同时触发统计更新事件，刷新订阅源页面的未读数量
              cacheEventEmitter.updateRSSStats();
              console.log(`✅ 已触发清除单源缓存事件: ${source?.name}`);
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
      await syncSource(sourceId);
      Alert.alert('刷新完成', '该源已成功更新');
    } catch (error) {
      console.error('Sync single source failed:', error);
      Alert.alert('刷新失败', '无法更新该RSS源');
    }
  };
  
  const handleMoveSource = async (sourceId: number, direction: 'up' | 'down') => {
    try {
      const currentIndex = filteredSources.findIndex(s => s.id === sourceId);
      if ((direction === 'up' && currentIndex === 0) ||
        (direction === 'down' && currentIndex === filteredSources.length - 1)) {
        return;
      }

      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      const sortedSources = [...filteredSources];
      [sortedSources[currentIndex], sortedSources[newIndex]] =
        [sortedSources[newIndex], sortedSources[currentIndex]];

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

  // --- 批量操作逻辑 (完整保留) ---
  const toggleEditMode = () => {
    Vibration.vibrate(50);
    setIsEditMode(!isEditMode);
    setSelectedSources(new Set());
  };

  const toggleSelection = (id: number) => {
    const newSet = new Set(selectedSources);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedSources(newSet);
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
    setShowMoveGroupModal(true);
  };

  const handleBatchToggleStatus = async () => {
    if (selectedSources.size === 0) return;

    // 获取选中源的当前状态（如果大部分是开启的，则全部关闭，反之亦然）
    const sources = rssSources.filter(s => selectedSources.has(s.id));
    const activeCount = sources.filter(s => s.isActive).length;
    const shouldActivate = activeCount < sources.length / 2; // 超过一半关闭才开启，否则全部关闭

    try {
      // 并行更新
      const updates = sources.map(s => 
        rssService.updateRSSSource(s.id, { isActive: shouldActivate })
      );
      await Promise.all(updates);
      
      // 批量刷新
      await refreshRSSSources();
      
      Alert.alert('成功', `已${shouldActivate ? '启用' : '停用'} ${sources.length} 个源`);
      setIsEditMode(false);
      setSelectedSources(new Set());
    } catch (error) {
      console.error('Batch toggle failed:', error);
      Alert.alert('操作失败', '无法更新源状态');
    }
  };

  const handleBatchRefresh = async () => {
    if (selectedSources.size === 0) return;
    
    Alert.alert('提示', `准备刷新 ${selectedSources.size} 个源，这可能需要一点时间`, [
      { text: '取消', style: 'cancel' },
      { 
        text: '开始刷新', 
        onPress: async () => {
          const sourceIds = Array.from(selectedSources);
          setIsEditMode(false);
          setSelectedSources(new Set());
          try {
            await syncSources(sourceIds, (current, total, name) => {
              logger.info(`[ManageSubscriptions] 进度: ${current}/${total} - ${name}`);
            });
          } catch (e) {
            console.error(e);
          }
        } 
      }
    ]);
  };

  const handleMoveToGroup = async (groupId: number | null) => {
    try {
      await moveSourcesToGroup(Array.from(selectedSources), groupId);
      const groupName = groupId === null ? VIRTUAL_GROUPS.UNCATEGORIZED.name : groups.find(g => g.id === groupId)?.name || '目标分组';
      Alert.alert('成功', `已移动到 "${groupName}"`);
      setIsEditMode(false);
      setSelectedSources(new Set());
      setShowMoveGroupModal(false);
      await refreshRSSSources();
    } catch (error) {
      console.error('Failed to move sources:', error);
      Alert.alert('失败', '移动源时出现错误');
      setShowMoveGroupModal(false);
    }
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
                // 触发每个源的删除事件
                cacheEventEmitter.sourceDeleted(sourceId);
              }
              console.log(`✅ 已触发批量删除事件: ${selectedSources.size} 个源`);
              Alert.alert('成功', `已删除 ${selectedSources.size} 个源`);
              setIsEditMode(false);
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

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '从未更新';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = (now.getTime() - date.getTime()) / 1000; // seconds
    
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return `${Math.floor(diff / 86400)}天前`;
  };

  // --- 组件渲染 ---

  // 1. 顶部统计卡片 (复用 MineScreen 风格)
  const StatCard = ({ icon, value, label, color }: any) => (
    <View style={[styles.statCard, { backgroundColor: theme.colors.surface }]}>
      <View style={[styles.statIconCircle, { backgroundColor: `${color}15` }]}>
        <MaterialIcons name={icon} size={20} color={color} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );

  const renderToolbar = () => (
    <View style={styles.toolbar}>
      {isEditMode ? (
        <View style={{flexDirection: 'row', alignItems: 'center', height: '100%'}}>
          <TouchableOpacity 
             onPress={selectedSources.size === filteredSources.length ? deselectAllSources : selectAllSources}
             style={{flexDirection: 'row', alignItems: 'center', height: '100%', paddingRight: 8}}
          >
            <MaterialIcons 
               name={selectedSources.size === filteredSources.length ? "check-box" : "check-box-outline-blank"} 
               size={22} 
               color={theme.colors.primary} 
            />
            <Text style={{fontSize: 16, color: theme.colors.primary, fontWeight: '700', marginLeft: 6}}>
              全选
            </Text>
          </TouchableOpacity>
          <Text style={{fontSize: 14, color: theme.colors.onSurfaceVariant, marginLeft: 8}}>
            (已选 {selectedSources.size})
          </Text>
        </View>
      ) : (
        <Text style={styles.sectionTitle}>订阅列表</Text>
      )}

      <TouchableOpacity 
        style={styles.manageButton}
        onPress={() => {
           if (isEditMode) {
             setIsEditMode(false);
             setSelectedSources(new Set());
           } else {
             setIsEditMode(true);
             Vibration.vibrate(50);
           }
        }}
      >
        <Text style={styles.manageButtonText}>
          {isEditMode ? '完成' : '批量管理'}
        </Text>
        {!isEditMode && <MaterialIcons name="playlist-add-check" size={20} color={theme.colors.primary} style={{marginLeft: 4}} />}
        {/* 为了保持高度一致，编辑模式下添加一个透明的Icon占位，或者不做处理依靠flex布局 */}
        {isEditMode && <View style={{width: 24}} />} 
      </TouchableOpacity>
    </View>
  );

  const renderDashboard = () => (
    <View style={styles.dashboardContainer}>
      <StatCard icon="rss-feed" value={stats.total} label="总订阅" color={theme.colors.primary} />
      <StatCard icon="mark-email-unread" value={stats.unread} label="总未读" color={theme.colors.error} />
      <StatCard icon="update" value={stats.active} label="近日更新" color={theme.colors.tertiary} />
    </View>
  );

  const renderFooter = () => (
    <View style={styles.footerContainer}>
      <View style={{ height: 60 }} /> 
      {/* 底部留白给批量操作栏 */}
    </View>
  );

  // 3. 核心：源卡片 (浏览模式 & 管理模式)
  const SourceCard = React.memo(({ source, index, total }: { source: RSSSource, index: number, total: number }) => {
    const isSelected = selectedSources.has(source.id);
    // 生成伪随机颜色
    const iconColor = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'][source.id % 5];

    // 浏览模式点击 -> 进文章页；编辑模式点击 -> 选中
    const handlePress = () => {
      if (isEditMode) {
        toggleSelection(source.id);
      } else {
        navigation.navigate('Articles' as any, { 
          screen: 'HomeMain', 
          params: { sourceId: source.id, sourceName: source.name } 
        } as any);
      }
    };

    // 长按 -> 弹出操作菜单 (仅非编辑模式)
    const handleLongPress = () => {
      if (!isEditMode) {
        setActiveSourceId(source.id);
        setShowActionSheet(true);
        Vibration.vibrate(50);
      }
    };

    return (
      <TouchableOpacity
        style={[
          styles.card,
          isEditMode && isSelected && styles.cardSelected,
          // 禁用/停用状态样式
          !source.isActive && { opacity: 0.6 }
        ]}
        onPress={handlePress}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
      >
        <View style={styles.cardInner}>
          {/* 左侧图标或 Checkbox */}
          <View style={styles.cardLeft}>
            {isEditMode ? (
              <MaterialIcons 
                name={isSelected ? "check-circle" : "radio-button-unchecked"} 
                size={24} 
                color={isSelected ? theme.colors.primary : theme.colors.outline} 
              />
            ) : (
              <View style={[styles.iconBox, { backgroundColor: `${iconColor}15` }]}>
                <MaterialIcons name="rss-feed" size={20} color={iconColor} />
              </View>
            )}
          </View>

          {/* 中间：信息 */}
          <View style={styles.cardCenter}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
               <Text style={[styles.cardTitle, !source.isActive && {color: theme.colors.outline}]} numberOfLines={1}>
                 {source.name}
               </Text>
               {!source.isActive && (
                 <View style={styles.inactiveBadge}>
                   <Text style={styles.inactiveBadgeText}>已停用</Text>
                 </View>
               )}
            </View>
            <View style={styles.cardMetaRow}>
              <Text style={styles.metaText}>
                {formatTime(source.last_updated)}更新
              </Text>
            </View>
          </View>

          {/* 右侧：未读数字或排序按钮 */}
          <View style={styles.cardRight}>
            {isEditMode ? (
              // 编辑模式显示排序箭头
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                 <TouchableOpacity 
                   onPress={() => handleMoveSource(source.id, 'up')} 
                   disabled={index===0} 
                   style={styles.sortBtn}
                   hitSlop={{top:10, bottom:10, left:10, right:10}}
                 >
                   <MaterialIcons name="arrow-upward" size={20} color={index===0 ? theme.colors.outlineVariant : theme.colors.onSurfaceVariant} />
                 </TouchableOpacity>
                 <TouchableOpacity 
                   onPress={() => handleMoveSource(source.id, 'down')} 
                   disabled={index===total-1} 
                   style={styles.sortBtn}
                   hitSlop={{top:10, bottom:10, left:10, right:10}}
                 >
                   <MaterialIcons name="arrow-downward" size={20} color={index===total-1 ? theme.colors.outlineVariant : theme.colors.onSurfaceVariant} />
                 </TouchableOpacity>
              </View>
            ) : (
              // 浏览模式显示未读数或箭头
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                {/* 显示未读计数 */}
                {(source.unread_count ?? 0) > 0 && source.isActive && (
                  <View style={[styles.unreadBadge, { backgroundColor: theme.colors.error }]}>
                    <Text style={styles.unreadBadgeText}>
                      {(source.unread_count ?? 0) > 99 ? '99+' : source.unread_count}
                    </Text>
                  </View>
                )}
                {/* 右箭头 */}
                <MaterialIcons name="chevron-right" size={20} color={theme.colors.outline} />
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  });

  const SourceActionSheet = ({ sourceId, visible, onClose }: { sourceId: number | null, visible: boolean, onClose: () => void }) => {
    if (!sourceId || !visible) return null;
    const source = rssSources.find(s => s.id === sourceId);
    if (!source) return null;

    const actions = [
      {
        icon: 'edit',
        label: '编辑源',
        onPress: () => {
          onClose();
          editSource(sourceId);
        }
      },
      {
        icon: 'sync',
        label: '立即刷新',
        onPress: () => {
          onClose();
          handleSyncSingleSource(sourceId);
        }
      },
      {
        icon: source.isActive ? 'toggle-on' : 'toggle-off',
        label: source.isActive ? '停用源' : '启用源',
        color: source.isActive ? theme.colors.primary : theme.colors.outline,
        onPress: () => {
          onClose();
          toggleSourceStatus(sourceId);
        }
      },
      {
        icon: 'cleaning-services',
        label: '清空文章缓存',
        onPress: () => {
          onClose();
          clearSourceArticles(sourceId);
        }
      },
      {
        icon: 'delete',
        label: '删除源',
        color: theme.colors.error,
        onPress: () => {
          onClose();
          setTimeout(() => deleteSource(sourceId), 200);
        }
      }
    ];

    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
          <View style={styles.actionSheetContainer}>
            <View style={styles.actionSheetHeader}>
              <Text style={styles.actionSheetTitle} numberOfLines={1}>{source.name}</Text>
            </View>
            {actions.map((action, idx) => (
              <TouchableOpacity key={idx} style={styles.actionSheetItem} onPress={action.onPress}>
                <MaterialIcons name={action.icon as any} size={24} color={action.color || theme.colors.onSurface} />
                <Text style={[styles.actionSheetText, action.color && { color: action.color }]}>{action.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={{height: 20}} />
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  // 4. 列表渲染
  const renderScene = useCallback(({ route, index: tabIndex }: any) => {
    const sourcesForTab = getFilteredSources(tabIndex);

    if (!isReady) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      );
    }

    return (
      <View style={{ width: screenWidth, flex: 1 }}>
        <FlatList
          data={sourcesForTab}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item, index }) => (
            <SourceCard source={item} index={index} total={sourcesForTab.length} />
          )}
          ListHeaderComponent={() => (
            <View style={styles.listHeader} />
          )}
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <MaterialIcons name="rss-feed" size={48} color={theme.colors.outline} />
              <Text style={styles.emptyText}>暂无订阅源</Text>
            </View>
          )}
          ListFooterComponent={renderFooter}
          // 优化滚动性能
          initialNumToRender={10}
          windowSize={5}
          maxToRenderPerBatch={10}
          removeClippedSubviews={true}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  }, [getFilteredSources, screenWidth, isReady, refreshing, isEditMode, selectedSources, styles, theme]);

  return (
    <View style={styles.container}>
      {/* 顶部统计区 (固定) */}
      {renderDashboard()}
      
      {/* 工具栏 (订阅列表标题 / 批量操作控制) */}
      {renderToolbar()}

      {/* Tab 栏 */}
      <CustomTabBar
        tabs={routes}
        scrollX={scrollX}
        screenWidth={screenWidth}
        activeIndex={activeIndex}
        onTabPress={handleTabPress}
      />

      {/* 列表内容 */}
      <CustomTabContent
        ref={tabContentRef}
        tabs={routes}
        renderScene={renderScene}
        scrollX={scrollX}
        onIndexChange={handleIndexChange}
        initialIndex={0}
      />
      
      {/* 底部批量操作栏 (编辑模式显示) */}
      {isEditMode && selectedSources.size > 0 && (
         <View style={styles.bottomActionBar}>
            <TouchableOpacity style={styles.bottomActionBtn} onPress={handleBatchMoveToGroup}>
               <MaterialIcons name="folder" size={20} color="#FFF" />
               <Text style={styles.bottomActionText}>移动</Text>
            </TouchableOpacity>
            
            <View style={styles.verticalDivider} />

            <TouchableOpacity style={styles.bottomActionBtn} onPress={handleBatchToggleStatus}>
               <MaterialIcons name="toggle-on" size={20} color="#FFF" />
               <Text style={styles.bottomActionText}>启/停</Text>
            </TouchableOpacity>

            <View style={styles.verticalDivider} />

            <TouchableOpacity style={styles.bottomActionBtn} onPress={handleBatchRefresh}>
               <MaterialIcons name="sync" size={20} color="#FFF" />
               <Text style={styles.bottomActionText}>刷新</Text>
            </TouchableOpacity>
            
            <View style={styles.verticalDivider} />
            
            <TouchableOpacity style={styles.bottomActionBtn} onPress={handleBatchDelete}>
               <MaterialIcons name="delete" size={20} color="#FF8A80" />
               <Text style={[styles.bottomActionText, {color: '#FF8A80'}]}>删除</Text>
            </TouchableOpacity>
         </View>
      )}

      {/* 分组选择弹窗 */}
      <GroupSelectionModal
        visible={showMoveGroupModal}
        groups={groups}
        onClose={() => setShowMoveGroupModal(false)}
        onSelect={handleMoveToGroup}
        theme={theme}
        isDark={isDark}
      />

      {/* 动作菜单 ActionSheet */}
      <SourceActionSheet 
        sourceId={activeSourceId} 
        visible={showActionSheet} 
        onClose={() => setShowActionSheet(false)} 
      />
    </View>
  );
};

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.onSurface,
  },
  addButton: {
    padding: 8,
    marginRight: -8,
  },
  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 44, // 固定高度
    marginTop: -12, // 移除顶部间距，紧贴 Dashboard
    marginBottom: 0, // 稍微留一点底部间距
  },
  sectionTitle: {
    fontSize: 16, // 调整为与编辑模式一致的大小
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%', // 充满容器高度
    paddingLeft: 12, // 增加点击区域
  },
  manageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },

  loadingContainer: {
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center'
  },
  // Action Sheet 样式
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionSheetContainer: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  actionSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outlineVariant,
    marginBottom: 8,
  },
  actionSheetTitle: {
    ...typography.titleMedium,
    color: theme.colors.onSurface,
    fontWeight: '600',
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  actionSheetText: {
    ...typography.bodyLarge,
    color: theme.colors.onSurface,
    marginLeft: 16,
  },
  // 停用标记
  inactiveBadge: {
    backgroundColor: theme.colors.surfaceVariant,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  inactiveBadgeText: {
    ...typography.labelSmall,
    color: theme.colors.onSurfaceVariant,
    fontSize: 10,
  },
  // 排序按钮
  sortBtn: {
    padding: 8,
  },
  
  // Dashboard
  dashboardContainer: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    // 阴影
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0 : 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  statValue: {
    ...typography.bodyLarge,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  statLabel: {
    ...typography.labelSmall,
    color: theme.colors.onSurfaceVariant,
  },

  // List Header
  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  batchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.outlineVariant,
  },

  // Source Card
  card: {
      marginHorizontal: 16,
      marginBottom: 10,
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 12,
      borderWidth: 2, // 始终保留 2px 边框，但平时透明
      borderColor: 'transparent',
      // 阴影
      shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: isDark ? 0 : 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardSelected: {
      backgroundColor: isDark ? theme.colors.surfaceContainerHigh : theme.colors.primaryContainer,
      borderColor: theme.colors.primary, // 选中时显示边框，但因为基准样式已有2px，所以不会撑开
    },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardLeft: {
    marginRight: 12,
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardCenter: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTitle: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: theme.colors.onSurface,
    marginBottom: 4,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    ...typography.bodySmall,
    color: theme.colors.onSurfaceVariant,
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.error,
    marginRight: 8,
  },
  // 未读数量徽章
  unreadBadge: {
    width: 25,
    height: 25,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadgeText: {
    ...typography.labelSmall,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  editActionBar: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.outlineVariant,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionBtnSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: 4,
  },

  // Footer Menu
  footerContainer: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  menuGroup: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    marginTop: 8,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  menuBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outlineVariant,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuText: {
    ...typography.bodyLarge,
    fontWeight: '500',
    color: theme.colors.onSurface,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyText: {
    marginTop: 12,
    color: theme.colors.onSurfaceVariant,
  },

  // Bottom Action Bar
  bottomActionBar: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    backgroundColor: '#333',
    borderRadius: 28,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  bottomActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  bottomActionText: {
    color: '#FFF',
    fontWeight: '600',
    marginLeft: 6,
  },
  verticalDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  }
});

export default ManageSubscriptionsScreen;
