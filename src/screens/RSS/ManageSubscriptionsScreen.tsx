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
  Animated,
  Vibration,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { typography } from '../../theme/typography';
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
  const { groups, moveSourcesToGroup } = useRSSGroup();
  const { width: screenWidth } = useWindowDimensions();
  const tabContentRef = useRef<CustomTabContentHandle>(null);
  const scrollX = useSharedValue(0);

  const [refreshing, setRefreshing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  
  // FAB 动画值 - 主按钮旋转
  const fabRotation = useRef(new Animated.Value(0)).current;
  // 每个按钮独立的动画值
  const button1Anim = useRef(new Animated.Value(0)).current;  // 同步
  const button2Anim = useRef(new Animated.Value(0)).current;  // 分组
  const button3Anim = useRef(new Animated.Value(0)).current;  // 添加
  const buttonAnims = [button1Anim, button2Anim, button3Anim];
  
  // 模式控制：普通浏览 vs 管理模式
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedSources, setSelectedSources] = useState<Set<number>>(new Set());

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
      { key: 'uncategorized', title: '未分组', groupId: VIRTUAL_GROUPS.UNCATEGORIZED.id },
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

  const handleTabPress = useCallback((tabIndex: number) => {
    setActiveIndex(tabIndex);
    tabContentRef.current?.scrollToIndex(tabIndex);
    if (isEditMode) {
      setIsEditMode(false);
      setSelectedSources(new Set());
    }
  }, [isEditMode]);

  const handleIndexChange = useCallback((newIndex: number) => {
    setActiveIndex(newIndex);
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

  // 切换设置菜单 - 丝滑交错动画
  const toggleSettingsMenu = () => {
    const isOpening = !showSettingsMenu;
    
    if (isOpening) {
      // 展开动画：主按钮旋转 + 按钮依次弹出
      setShowSettingsMenu(true);
      
      // 主按钮旋转
      Animated.spring(fabRotation, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }).start();
      
      // 按钮依次弹出 - 交错延迟 80ms
      Animated.stagger(80, [
        Animated.spring(button1Anim, {
          toValue: 1,
          friction: 5,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.spring(button2Anim, {
          toValue: 1,
          friction: 5,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.spring(button3Anim, {
          toValue: 1,
          friction: 5,
          tension: 60,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // 收起动画：按钮先收回，再旋转主按钮
      // 按钮从远到近依次收回
      Animated.stagger(60, [
        Animated.timing(button3Anim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(button2Anim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(button1Anim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
      
      // 主按钮旋转回去
      Animated.spring(fabRotation, {
        toValue: 0,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }).start();
      
      // 延迟隐藏菜单
      setTimeout(() => {
        setShowSettingsMenu(false);
      }, 200);
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
              setIsEditMode(false);
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
              setIsEditMode(false);
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

  const renderDashboard = () => (
    <View style={styles.dashboardContainer}>
      <StatCard icon="rss-feed" value={stats.total} label="总订阅" color={theme.colors.primary} />
      <StatCard icon="mark-email-unread" value={stats.unread} label="总未读" color={theme.colors.error} />
      <StatCard icon="update" value={stats.active} label="近日更新" color={theme.colors.tertiary} />
    </View>
  );

  // 单个动作按钮 - 独立动画控制
  const ActionButton = ({ icon, onPress, animValue }: any) => {
    // 缩放动画 - 带过冲效果
    const scale = animValue.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 1.15, 1],
    });
    
    // 透明度动画
    const opacity = animValue.interpolate({
      inputRange: [0, 0.3, 1],
      outputRange: [0, 0.8, 1],
    });
    
    // 水平位移动画 - 从右边滑入
    const translateX = animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [40, 0],
    });

    return (
      <Animated.View 
        style={[
          styles.actionButton,
          {
            transform: [{ translateX }, { scale }],
            opacity,
          }
        ]}
      >
        <TouchableOpacity
          style={styles.actionButtonInner}
          onPress={onPress}
          activeOpacity={0.8}
        >
          <MaterialIcons name={icon} size={24} color="#FFF" />
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderFooter = () => (
    <View style={styles.footerContainer}>
      <View style={{ height: 120 }} /> 
      {/* 底部留白给批量操作栏 */}
    </View>
  );

  // 3. 核心：源卡片 (浏览模式 & 管理模式)
  const SourceCard = React.memo(({ source, index, total }: { source: RSSSource, index: number, total: number }) => {
    const isSelected = selectedSources.has(source.id);
    // 生成伪随机颜色
    const iconColor = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'][source.id % 5];

    // 浏览模式点击 -> 进文章页
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

    return (
      <TouchableOpacity
        style={[
          styles.card,
          isEditMode && isSelected && styles.cardSelected
        ]}
        onPress={handlePress}
        onLongPress={() => !isEditMode && toggleEditMode()}
        activeOpacity={0.7}
      >
        <View style={styles.cardInner}>
          {/* 左侧：选择框（编辑模式）或RSS图标（普通模式） */}
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
            <Text style={styles.cardTitle} numberOfLines={1}>{source.name}</Text>
            <View style={styles.cardMetaRow}>
              <Text style={styles.metaText}>
                {formatTime(source.last_updated)}更新
              </Text>
            </View>
          </View>

          {/* 右侧：未读数字或交互按钮 */}
          <View style={styles.cardRight}>
            {isEditMode ? (
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                 <TouchableOpacity onPress={() => handleMoveSource(source.id, 'up')} disabled={index===0} style={{padding:4}}>
                   <MaterialIcons name="arrow-upward" size={20} color={theme.colors.outline} />
                 </TouchableOpacity>
                 <TouchableOpacity onPress={() => handleMoveSource(source.id, 'down')} disabled={index===total-1} style={{padding:4}}>
                   <MaterialIcons name="arrow-downward" size={20} color={theme.colors.outline} />
                 </TouchableOpacity>
                 <TouchableOpacity onPress={() => editSource(source.id)} style={{padding:4, marginLeft:4}}>
                   <MaterialIcons name="edit" size={20} color={theme.colors.primary} />
                 </TouchableOpacity>
              </View>
            ) : (
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                {/* 显示未读计数：醒目的数字徽章 */}
                {(source.unread_count ?? 0) > 0 && (
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
        
        {/* 管理模式下的额外操作栏 */}
        {isEditMode && (
          <View style={styles.editActionBar}>
             <View style={{flexDirection:'row', alignItems:'center'}}>
                <Text style={{fontSize:12, color:theme.colors.onSurfaceVariant, marginRight: 8}}>启用</Text>
                <Switch 
                  value={source.isActive} 
                  onValueChange={() => toggleSourceStatus(source.id)}
                  trackColor={{ false: theme.colors.outlineVariant, true: theme.colors.primary }}
                  thumbColor={'#FFF'}
                  style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }} 
                />
             </View>
             
             <View style={{flexDirection:'row', gap: 12}}>
                 <TouchableOpacity onPress={() => handleSyncSingleSource(source.id)} style={styles.actionBtnSmall}>
                    <Text style={{fontSize:12, color: theme.colors.primary}}>刷新</Text>
                 </TouchableOpacity>
                 <TouchableOpacity onPress={() => clearSourceArticles(source.id)} style={styles.actionBtnSmall}>
                    <Text style={{fontSize:12, color: theme.colors.onSurfaceVariant}}>清空</Text>
                 </TouchableOpacity>
                 <TouchableOpacity onPress={() => deleteSource(source.id)} style={[styles.actionBtnSmall, {backgroundColor: theme.colors.errorContainer}]}>
                    <Text style={{fontSize:12, color: theme.colors.error}}>删除</Text>
                 </TouchableOpacity>
             </View>
          </View>
        )}
      </TouchableOpacity>
    );
  });

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
            <View style={styles.listHeader}>
              <View style={styles.headerRow}>
                 <Text style={styles.sectionTitle}>
                   {route.title} ({sourcesForTab.length})
                 </Text>
                 {sourcesForTab.length > 0 && (
                   <TouchableOpacity onPress={toggleEditMode} style={styles.manageBtn}>
                      <Text style={styles.manageBtnText}>{isEditMode ? '完成' : '管理'}</Text>
                   </TouchableOpacity>
                 )}
              </View>
              {isEditMode && (
                <View style={styles.batchHeader}>
                   <Text style={{fontSize:13, color: theme.colors.onSurfaceVariant}}>
                     已选 {selectedSources.size} 项
                   </Text>
                   <TouchableOpacity onPress={selectedSources.size === sourcesForTab.length ? deselectAllSources : selectAllSources}>
                      <Text style={{fontSize:13, color: theme.colors.primary, fontWeight:'600'}}>
                        {selectedSources.size === sourcesForTab.length ? '取消全选' : '全选'}
                      </Text>
                   </TouchableOpacity>
                </View>
              )}
            </View>
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

      {/* FAB 设置按钮 (非编辑模式显示) */}
      {!isEditMode && (
        <View style={styles.fabContainer}>
          {/* 主FAB按钮 - 放第一个，因为 row-reverse 所以它在最右边 */}
          <Animated.View
            style={[
              styles.fabWrapper,
              {
                transform: [
                  {
                    rotate: fabRotation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '135deg'],
                    }),
                  },
                ],
              },
            ]}
          >
            <TouchableOpacity
              style={styles.fabInner}
              onPress={toggleSettingsMenu}
              activeOpacity={0.8}
            >
              <MaterialIcons name="add" size={24} color="#FFF" />
            </TouchableOpacity>
          </Animated.View>
          
          {/* 展开的动作按钮 - 从右到左：同步、分组、添加 */}
          {showSettingsMenu && (
            <>
              <ActionButton 
                icon="sync"
                animValue={button1Anim}
                onPress={() => {
                  toggleSettingsMenu();
                }}
              />
              <ActionButton 
                icon="folder-open"
                animValue={button2Anim}
                onPress={() => {
                  navigation.navigate('GroupManagement');
                  toggleSettingsMenu();
                }}
              />
              <ActionButton 
                icon="add-circle-outline"
                animValue={button3Anim}
                onPress={() => {
                  navigation.navigate('AddRSSSource');
                  toggleSettingsMenu();
                }}
              />
            </>
          )}
        </View>
      )}
      
      {/* 底部批量操作栏 (编辑模式显示) */}
      {isEditMode && selectedSources.size > 0 && (
         <View style={styles.bottomActionBar}>
            <TouchableOpacity style={styles.bottomActionBtn} onPress={handleBatchMoveToGroup}>
               <MaterialIcons name="folder" size={20} color="#FFF" />
               <Text style={styles.bottomActionText}>移动</Text>
            </TouchableOpacity>
            
            <View style={styles.verticalDivider} />
            
            <TouchableOpacity style={styles.bottomActionBtn} onPress={handleBatchDelete}>
               <MaterialIcons name="delete" size={20} color="#FF8A80" />
               <Text style={[styles.bottomActionText, {color: '#FF8A80'}]}>删除</Text>
            </TouchableOpacity>
         </View>
      )}
    </View>
  );
};

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center'
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
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    ...typography.titleMedium,
    color: theme.colors.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  manageBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: 12,
  },
  manageBtnText: {
    ...typography.labelMedium,
    fontWeight: '600',
    color: theme.colors.primary,
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
    // 阴影
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: isDark ? 0 : 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surfaceContainer,
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
    padding: 16,
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

  // FAB Container - 包含主按钮和展开按钮
  fabContainer: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    flexDirection: 'row-reverse',  // 从右到左排列
    alignItems: 'center',
    gap: 12,  // 按钮间距
    zIndex: 100,
  },
  fabWrapper: {
    // 用于动画包装
  },
  fabInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  
  // Action Buttons - 与主FAB一致的样式
  actionButton: {
    // 简单布局
  },
  actionButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
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
