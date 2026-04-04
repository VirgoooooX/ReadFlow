import React, { useState, useCallback, useEffect, useMemo, memo, useRef, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  useWindowDimensions,
  TouchableOpacity,
  ActivityIndicator, // 【新增】用于加载更多指示器
  Modal, // 新增
} from 'react-native';
import { Image } from 'expo-image';
import { FlashList, FlashListProps } from '@shopify/flash-list';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { HomeStackScreenProps } from '../../navigation/types';
import { useThemeContext } from '../../theme';
import { typography } from '../../theme/typography';
import { useReadingSettings } from '../../contexts/ReadingSettingsContext';
import { useRSSSource } from '../../contexts/RSSSourceContext';
import { articleService, RSSService } from '../../services';
import { dailyReportApiService } from '../../services/DailyReportApiService';
import { SettingsService } from '../../services/SettingsService';
import cacheEventEmitter from '../../services/CacheEventEmitter';
import { logger } from '../../services/rss/RSSUtils';
import type { Article } from '../../types';
import CustomTabBar from '../../components/CustomTabBar';
import CustomTabContent, { CustomTabContentHandle } from '../../components/CustomTabContent';
import { useSharedValue } from 'react-native-reanimated';
import ScreenWithCustomHeader from '../../components/ScreenWithCustomHeader';
import DailyReportCard from '../../components/DailyReportCard';
import { Alert, ToastAndroid, Platform } from 'react-native'; // 新增 Alert, ToastAndroid, Platform

// 【修改】全局状态，记录是否切换过文章
export let lastViewedArticleId: number | null = null;
export let didSwitchArticle: boolean = false; // 【新增】标记是否在详情页切换过文章
export let initialArticleId: number | null = null; // 【新增】记录初始打开的文章ID
export let needRefreshOnReturn: boolean = false; // 【新增】标记从详情页返回时需要刷新

export const setLastViewedArticleId = (id: number | null) => {
  if (initialArticleId === null) {
    // 第一次设置，记录初始文章
    initialArticleId = id;
    didSwitchArticle = false;
  } else if (initialArticleId !== id) {
    // 切换到了不同的文章
    didSwitchArticle = true;
  }
  lastViewedArticleId = id;
  // 【修复】只在实际切换文章时才设置为true，否则设置为false
  needRefreshOnReturn = didSwitchArticle;
};

export const getPendingScrollInfo = () => {
  const shouldScroll = didSwitchArticle;
  const articleId = lastViewedArticleId;
  const shouldRefresh = needRefreshOnReturn; // 【新增】获取是否需要刷新
  const didSwitchArticleFlag = didSwitchArticle; // 【新增】获取是否切换过文章
  // 清空状态
  didSwitchArticle = false;
  initialArticleId = null;
  lastViewedArticleId = null;
  needRefreshOnReturn = false; // 【新增】清空刷新标记
  return { shouldScroll, articleId, shouldRefresh, didSwitchArticle: didSwitchArticleFlag };
};

type Props = HomeStackScreenProps<'HomeMain'>;

const nowMs = () => {
  const p = (globalThis as any)?.performance;
  if (p && typeof p.now === 'function') return p.now();
  return Date.now();
};

// 【优化】提取单独的 ArticleItem 组件，性能更好且代码更清晰
const ArticleItem = memo(({ item, onPress, styles, theme, proxyServerUrl }: any) => {
  // 格式化日期，看起来更友好
  const dateStr = useMemo(() => {
    const date = new Date(item.publishedAt);
    const now = new Date();
    // 如果是今天的文章，显示时间；否则显示日期
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }, [item.publishedAt]);

  // 🔥 处理防盗链图片代理
  const imageUri = useMemo(() => {
    if (!item.imageUrl) return null;
    return item.imageUrl;
  }, [item.imageUrl]);

  return (
    <TouchableOpacity
      style={[styles.articleItem, !item.isRead && styles.articleItemUnread]}
      onPress={() => onPress(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.articleContent}>
        {/* 标题区域：包含未读点 */}
        <View style={styles.titleRow}>
          {!item.isRead && <View style={styles.unreadDot} />}
          <Text
            style={[styles.articleTitle, !item.isRead && styles.articleTitleUnread]}
            numberOfLines={2} // 限制2行
            ellipsizeMode="tail"
          >
            {item.title}
          </Text>
        </View>

        {/* 副标题（中文标题） */}
        {item.titleCn ? (
          <Text style={styles.articleSubtitle} numberOfLines={2}>
            {item.titleCn}
          </Text>
        ) : null}

        {/* 底部元信息 */}
        <View style={styles.articleMeta}>
          <Text style={styles.sourceTag} numberOfLines={1}>{item.sourceName}</Text>
          <Text style={styles.metaDivider}>·</Text>
          <Text style={styles.metaText}>{item.wordCount || 0} 词</Text>
          <Text style={styles.metaDivider}>·</Text>
          <Text style={styles.metaText}>{dateStr}</Text>
        </View>
      </View>

      {/* 图片区域：固定尺寸，右侧展示 */}
      {imageUri && (
        <View style={styles.imageShadowWrapper}>
          <View style={styles.imageContainer}>
            <Image
              source={imageUri}
              style={styles.articleImage}
              contentFit="cover"
              transition={200}
            />
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
});

const ArticleListScene = memo(React.forwardRef(function ArticleListSceneComponent({
  sourceName,
  articles,
  isRefreshing,
  onRefresh,
  onArticlePress,
  theme,
  isActive,
  isNeighbor,
  onLoadMore, // 【新增】加载更多回调
  isLoadingMore, // 【新增】加载更多状态
  hasMore, // 【新增】是否还有更多
  autoMarkReadOnScroll, // 【新增】滚动自动标记已读
  onMarkRead, // 【新增】标记已读回调
}: {
  sourceName: string;
  articles: Article[];
  isRefreshing: boolean;
  onRefresh: () => void;
  onArticlePress: (id: number) => void;
  theme: any;
  isActive: boolean;
  isNeighbor: boolean;
  onLoadMore: () => void;
  isLoadingMore: boolean;
  hasMore: boolean;
  autoMarkReadOnScroll?: boolean;
  onMarkRead: (ids: number[]) => void;
}, ref: React.Ref<any>) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const flatListRef = useRef<any>(null);
  const ITEM_HEIGHT = 110;

  const hasTriedLoad = useRef(false);
  const pendingUiMarkIdsRef = useRef<Set<number>>(new Set());
  const pendingPersistMarkIdsRef = useRef<Set<number>>(new Set());
  const markReadUiTimerRef = useRef<NodeJS.Timeout | null>(null);
  const markReadPersistTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isScrollingRef = useRef(false);

  const flushPersistMarkRead = useCallback(() => {
    if (markReadPersistTimerRef.current) {
      clearTimeout(markReadPersistTimerRef.current);
      markReadPersistTimerRef.current = null;
    }

    const ids = Array.from(pendingPersistMarkIdsRef.current);
    pendingPersistMarkIdsRef.current.clear();
    if (ids.length === 0) return;

    articleService
      .markManyAsReadQuiet(ids)
      .catch(err => logger.error('Auto mark read persist failed:', err));
  }, []);

  const onViewableItemsChanged = useCallback(
    ({ changed, viewableItems }: { changed: any[]; viewableItems: any[] }) => {
      if (!autoMarkReadOnScroll || !onMarkRead) return;

      const firstViewable = viewableItems[0];
      if (!firstViewable) return;

      const pendingUi = pendingUiMarkIdsRef.current;
      const pendingPersist = pendingPersistMarkIdsRef.current;
      let hasNewUi = false;
      let hasNewPersist = false;

      for (let i = 0; i < changed.length; i++) {
        const change = changed[i];
        if (!change || change.isViewable) continue;
        if (change.index >= firstViewable.index) continue;
        if (change.item?.isRead) continue;

        const id = change.item.id as number;
        if (!pendingUi.has(id)) {
          pendingUi.add(id);
          hasNewUi = true;
        }
        if (!pendingPersist.has(id)) {
          pendingPersist.add(id);
          hasNewPersist = true;
        }
      }

      if (!hasNewUi && !hasNewPersist) return;

      if (hasNewUi) {
        if (markReadUiTimerRef.current) {
          clearTimeout(markReadUiTimerRef.current);
        }

        markReadUiTimerRef.current = setTimeout(() => {
          const ids = Array.from(pendingUiMarkIdsRef.current);
          pendingUiMarkIdsRef.current.clear();
          markReadUiTimerRef.current = null;

          if (ids.length === 0) return;
          onMarkRead(ids);
        }, 120);
      }

      if (hasNewPersist && !isScrollingRef.current) {
        if (markReadPersistTimerRef.current) {
          clearTimeout(markReadPersistTimerRef.current);
        }
        markReadPersistTimerRef.current = setTimeout(() => {
          flushPersistMarkRead();
        }, 600);
      }
    },
    [autoMarkReadOnScroll, onMarkRead, flushPersistMarkRead]
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 40,
    minimumViewTime: 300,
  }).current;

  // 【简化】直接滚动到指定文章，不做任何检查
  React.useImperativeHandle(ref, () => ({
    scrollToArticleId: (articleId: number) => {
      const index = articles.findIndex((a: Article) => a.id === articleId);
      if (index < 0 || !flatListRef.current) return;

      logger.info(`[ArticleListScene] Scrolling to article: ${articleId} index: ${index}`);
      // viewPosition: 0.5 让文章显示在屏幕中间
      flatListRef.current.scrollToIndex({ index, animated: false, viewPosition: 0.5 });
    }
  }), [articles]);

  useEffect(() => {
    return () => {
      if (markReadUiTimerRef.current) {
        clearTimeout(markReadUiTimerRef.current);
        markReadUiTimerRef.current = null;
      }
      if (markReadPersistTimerRef.current) {
        clearTimeout(markReadPersistTimerRef.current);
        markReadPersistTimerRef.current = null;
      }
      if (pendingPersistMarkIdsRef.current.size > 0) {
        flushPersistMarkRead();
      }
    };
  }, [flushPersistMarkRead]);

  // 【删除】不再需要 onViewableItemsChanged 和 handleScroll
  // -> 恢复用于 autoMarkReadOnScroll

  // 🌟 优化点：仅当是主页面或预加载时才渲染内容
  if (!isActive && !isNeighbor) return <View style={styles.lazyPlaceholder} />;

  return (
    <FlashList
      ref={flatListRef}
      data={articles}
      // @ts-ignore - estimatedItemSize is required by FlashList but may have type conflicts in some environments
      estimatedItemSize={ITEM_HEIGHT}
      keyExtractor={(item: Article) => item.id.toString()}
      style={{ flex: 1 }}
      contentContainerStyle={styles.articleListContainer}
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      onMomentumScrollBegin={() => {
        isScrollingRef.current = true;
      }}
      onMomentumScrollEnd={() => {
        isScrollingRef.current = false;
        flushPersistMarkRead();
      }}
      onScrollEndDrag={() => {
        if (isScrollingRef.current) return;
        flushPersistMarkRead();
      }}
      onScrollToIndexFailed={(info: any) => {
        // 处理滚动失败的情况
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: info.index,
            animated: false,
            viewPosition: 0.5,
          });
        }, 100);
      }}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          title={sourceName === '全部' ? '下拉刷新' : `刷新 ${sourceName}`}
          titleColor={theme.colors.outline}
          tintColor={theme.colors.primary}
        />
      }
      onEndReached={isActive && hasMore && !isLoadingMore ? onLoadMore : null}
      onEndReachedThreshold={0.5} // 【新增】提前加载（距离底部50%时）
      ListFooterComponent={() => // 【新增】列表底部加载指示器
        isLoadingMore ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <ArticleItem
          item={item}
          onPress={onArticlePress}
          styles={styles}
          theme={theme}
        />
      )}
      ListEmptyComponent={() => (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <MaterialIcons name="inbox" size={64} color={theme.colors.outlineVariant} />
          </View>
          <Text style={styles.emptyText}>
            {sourceName === '全部' ? '暂无文章' : `${sourceName} 暂无文章`}
          </Text>
          <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
            <Text style={styles.refreshButtonText}>刷新看看</Text>
          </TouchableOpacity>
        </View>
      )}
    />
  );
}));

const HomeScreen: React.FC<Props> = ({ navigation, route }) => {
  const { theme } = useThemeContext();
  const { rssSources, syncAllSources, syncSource } = useRSSSource();
  const { settings: readingSettings } = useReadingSettings();
  const { settings } = useReadingSettings();
  const tabContentRef = useRef<CustomTabContentHandle>(null);
  const sceneRefsMap = useRef<Map<string, any>>(new Map()).current;
  const scrollX = useSharedValue(0);
  const { width: screenWidth } = useWindowDimensions();
  const flatListRef = useRef<FlatList>(null);
  const currentSourceRef = useRef<string>('');

  const [index, setIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isRefreshingRef = useRef(false); // 🔥 用于在事件回调中同步读取状态
  const isBatchSyncingRef = useRef(false); // 🔥 新增：用于标记是否正在进行后台批量刷新
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null); // 🔥 防抖定时器

  // 同步 isRefreshing 到 ref
  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  const [loadedTabs, setLoadedTabs] = useState<Set<number>>(new Set([0]));
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);

  // 【重构】每个标签页独立管理文章数据和分页状态
  const [tabDataMap, setTabDataMap] = useState<Map<string, {
    articles: Article[];
    offset: number;
    hasMore: boolean;
    isLoadingMore: boolean;
  }>>(new Map());
  // 【删除】不再需要 scrollToArticleId 状态
  const didInitialPreloadRef = useRef(false);
  const loadRequestSeqRef = useRef(0);
  const latestLoadRequestRef = useRef<Map<string, number>>(new Map());

  const styles = createStyles(theme);

  const routes = useMemo(() => {
    let baseRoutes: Array<{ key: string; title: string; unreadCount?: number }> = [{ key: 'all', title: '全部' }];
    if (settings && settings.showAllTab === false) {
      baseRoutes = [];
    }

    // 计算"全部"tab的未读数（所有活跃源的未读数总和）
    const totalUnread = rssSources
      .filter(s => s.isActive)
      .reduce((sum, s) => sum + (s.unread_count || 0), 0);

    // 为"全部"tab添加未读数
    if (baseRoutes.length > 0) {
      baseRoutes[0] = { ...baseRoutes[0], unreadCount: totalUnread };
    }

    // 为各源tab添加未读数
    const sourceRoutes = rssSources.map(source => ({
      key: `source-${source.id}`,
      title: source.name,
      unreadCount: source.unread_count || 0
    }));

    return [...baseRoutes, ...sourceRoutes];
  }, [rssSources, settings?.showAllTab]);

  // 【重构】获取或初始化标签页数据
  const getTabData = useCallback((tabKey: string) => {
    if (!tabDataMap.has(tabKey)) {
      return {
        articles: [],
        offset: 0,
        hasMore: true,
        isLoadingMore: false,
      };
    }
    return tabDataMap.get(tabKey)!;
  }, [tabDataMap]);

  // 【重构】加载文章（支持每个标签独立分页）
  const loadArticles = useCallback(async (tabKey: string, append: boolean = false) => {
    const requestId = ++loadRequestSeqRef.current;
    latestLoadRequestRef.current.set(tabKey, requestId);
    try {
      const tabData = getTabData(tabKey);
      const offset = append ? tabData.articles.length : 0;
      const limit = 15;

      let newArticles: Article[];

      // 【新增】构建过滤条件
      const filterOptions: any = {
        limit,
        offset,
        sortBy: 'published_at',
        sortOrder: 'DESC',
      };

      if (showOnlyUnread) {
        filterOptions.isRead = false;
      }

      // 根据 tabKey 决定加载哪个源的数据
      if (tabKey === 'all') {
        // 全部标签：加载所有源的文章
        newArticles = await articleService.getArticles({
          ...filterOptions
        });
      } else if (tabKey.startsWith('source-')) {
        // 特定源标签：加载该源的文章
        const sourceId = parseInt(tabKey.replace('source-', ''), 10);
        newArticles = await articleService.getArticles({
          rssSourceId: sourceId,
          ...filterOptions
        });
      } else {
        newArticles = [];
      }

      // 更新该标签的数据
      setTabDataMap(prev => {
        if (latestLoadRequestRef.current.get(tabKey) !== requestId) return prev;
        const updated = new Map(prev);
        const currentData = updated.get(tabKey) || {
          articles: [],
          offset: 0,
          hasMore: true,
          isLoadingMore: false,
        };

        if (!append && currentData.articles.length > 0 && newArticles.length > 0) {
          const latestExistingId = currentData.articles[0].id;
          const latestNewId = newArticles[0].id;
          if (latestExistingId === latestNewId) {
            if (currentData.isLoadingMore) {
              updated.set(tabKey, { ...currentData, isLoadingMore: false });
              return updated;
            }
            return prev;
          }
        }

        const mergedArticles = append ? [...currentData.articles, ...newArticles] : newArticles;
        const seenIds = new Set<number>();
        const dedupedArticles = mergedArticles.filter(a => {
          if (seenIds.has(a.id)) return false;
          seenIds.add(a.id);
          return true;
        });

        updated.set(tabKey, {
          articles: dedupedArticles,
          offset: dedupedArticles.length,
          hasMore: newArticles.length >= limit,
          isLoadingMore: false,
        });
        return updated;
      });

      logger.info(`[HomeScreen] Loaded ${newArticles.length} articles for tab "${tabKey}", append: ${append}`);
    } catch (error) {
      logger.error(`Failed to load articles for tab "${tabKey}":`, error);
    }
  }, [getTabData, showOnlyUnread]);

  // 使用 ref 追踪最新状态，避免闭包陷阱
  const currentIndexRef = useRef(index);
  const routesRef = useRef(routes);
  const loadArticlesRef = useRef(loadArticles);

  useEffect(() => {
    currentIndexRef.current = index;
    routesRef.current = routes;
    loadArticlesRef.current = loadArticles;
  }, [index, routes, loadArticles]);

  // 【修改】初始化时加载首屏及预加载相邻标签
  useEffect(() => {
    if (didInitialPreloadRef.current) return;
    if (routes.length === 0) return;
    didInitialPreloadRef.current = true;
    if (!tabDataMap.has(routes[0].key)) {
      loadArticles(routes[0].key);
    }
    if (routes.length > 1 && !tabDataMap.has(routes[1].key)) {
      logger.info(`[HomeScreen] Initial preloading neighbor: ${routes[1].title}`);
      loadArticles(routes[1].key);
    }
  }, [routes, loadArticles, tabDataMap]);

  // 🌟 【已移除】原有的强制后台刷新逻辑已移除，改由 RSSStartupSettings 控制
  // 详见 AppNavigator.tsx 中的 triggerStartupRefresh 调用

  // 【分离】监听配置变化，仅管理定时器，不触发立即刷新
  useEffect(() => {
    let refreshInterval: NodeJS.Timeout | null = null;

    const triggerBackgroundSync = async () => {
      if (rssSources.length === 0) return;
      logger.info('[HomeScreen] ⏰ 触发定时后台刷新...');
      cacheEventEmitter.batchSyncStart();

      try {
        await RSSService.getInstance().refreshAllSourcesBackground({
          maxConcurrent: 3,
          onArticlesReady: (articles, sourceName) => {
            // 可选：这里可以不做任何事，因为 refreshAllSourcesBackground 完成后不自动清除缓存
            // 我们依赖 cacheEventEmitter 来通知更新
          }
        });
        cacheEventEmitter.refreshAllSources();
        logger.info('[HomeScreen] ⏰ 定时刷新完成');
      } catch (e) {
        logger.warn('Background sync failed:', e);
      } finally {
        cacheEventEmitter.batchSyncEnd();
      }
    };

    const intervalMinutes = readingSettings?.autoRefreshInterval ?? 10;
    if (intervalMinutes > 0 && rssSources.length > 0) {
      const intervalMs = intervalMinutes * 60 * 1000;
      refreshInterval = setInterval(triggerBackgroundSync, intervalMs);
      logger.info(`[HomeScreen] ⏰ 后台刷新定时器已更新（${intervalMinutes}分钟一次）`);
    } else {
      logger.info('[HomeScreen] ⏰ 自动刷新已关闭');
    }

    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  }, [readingSettings?.autoRefreshInterval, rssSources.length]);

  // 【新增】监听 rssSources 变化，清理已删除源的缓存和"全部"标签缓存
  useEffect(() => {
    const currentSourceKeys = new Set([
      'all',
      ...rssSources.map(source => `source-${source.id}`)
    ]);

    // 清理不存在的源的缓存
    setTabDataMap(prev => {
      const updated = new Map(prev);
      let hasChanges = false;

      for (const key of updated.keys()) {
        if (!currentSourceKeys.has(key)) {
          logger.info(`[HomeScreen] 🗑️ 清理已删除源的缓存: ${key}`);
          updated.delete(key);
          hasChanges = true;
        }
      }

      // 【关键修复】如果有源被删除，也清理"全部"标签的缓存
      if (hasChanges && updated.has('all')) {
        logger.info(`[HomeScreen] 🗑️ 清理"全部"标签缓存（源已变更）`);
        updated.delete('all');
      }

      return hasChanges ? updated : prev;
    });
  }, [rssSources]);

  // 【升级】监听全局缓存事件，支持细粒度刷新
  useEffect(() => {
    const unsubscribe = cacheEventEmitter.subscribe((eventData) => {
      const { type, sourceId, sourceIds, sourceName } = eventData;

      // 辅助函数：重新加载当前标签（如果匹配条件）
      const reloadCurrentIfMatches = (shouldReload: (currentKey: string) => boolean) => {
        const currentRoute = routesRef.current[currentIndexRef.current];
        if (currentRoute && shouldReload(currentRoute.key)) {
          logger.info(`[HomeScreen] 🔄 事件触发自动刷新: ${currentRoute.title}`);

          // 【优化】如果有正在等待的防抖刷新，取消它，因为我们要立即刷新了
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
          }

          // 稍微延迟一下确保 map 已清空（虽然 React 批处理通常会处理好，但为了保险）
          setTimeout(() => {
            loadArticlesRef.current(currentRoute.key, false);
          }, 50);
        }
      };

      switch (type) {
        case 'clearAll':
          // 清除所有缓存：清空所有标签数据
          logger.info('[HomeScreen] 🧹 收到全局清除缓存事件，清除 tabDataMap');
          setTabDataMap(new Map());
          reloadCurrentIfMatches(() => true);
          break;

        case 'clearArticles':
          // 清除所有文章缓存
          logger.info('[HomeScreen] 🧹 收到清除文章缓存事件，清除所有标签的文章数据');
          setTabDataMap(new Map());
          reloadCurrentIfMatches(() => true);
          break;

        case 'clearSourceArticles':
          // 清除单个源的文章缓存：同时刷新该源tab和"全部"tab
          if (sourceId) {
            logger.info(`[HomeScreen] 🧹 收到清除单源缓存事件: ${sourceName || sourceId}`);
            setTabDataMap(prev => {
              const updated = new Map(prev);
              updated.delete(`source-${sourceId}`);
              updated.delete('all'); // 同时刷新"全部"tab
              return updated;
            });
            reloadCurrentIfMatches(key => key === 'all' || key === `source-${sourceId}`);
          }
          break;

        case 'refreshSource':
          // 单个源刷新完成：刷新该源tab和"全部"tab
          if (sourceId) {
            logger.info(`[HomeScreen] 🔄 收到单源刷新事件: ${sourceName || sourceId}`);
            const hasAllTab = routesRef.current.some(r => r.key === 'all');
            setTabDataMap(prev => {
              const updated = new Map(prev);
              updated.delete(`source-${sourceId}`);
              if (hasAllTab) {
                updated.delete('all');
              }
              return updated;
            });
            reloadCurrentIfMatches(key => (hasAllTab && key === 'all') || key === `source-${sourceId}`);
          }
          break;

        case 'batchSyncStart':
          logger.info('[HomeScreen] 🔒 收到批量同步开始事件，屏蔽中间自动刷新');
          isBatchSyncingRef.current = true;
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
          }
          break;

        case 'batchSyncEnd':
          logger.info('[HomeScreen] 🔓 收到批量同步结束事件');
          isBatchSyncingRef.current = false;
          break;

        case 'refreshSources':
          if (sourceIds && sourceIds.length > 0) {
            const idSet = new Set(sourceIds);
            const hasAllTab = routesRef.current.some(r => r.key === 'all');
            logger.info(`[HomeScreen] 🔄 收到批量源刷新完成事件: ${sourceIds.length} 个源`);

            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
              debounceTimerRef.current = null;
            }

            setTabDataMap(prev => {
              const updated = new Map(prev);
              for (const id of idSet) {
                updated.delete(`source-${id}`);
              }
              if (hasAllTab) {
                updated.delete('all');
              }
              return updated;
            });

            reloadCurrentIfMatches(key => {
              if (hasAllTab && key === 'all') return true;
              if (!key.startsWith('source-')) return false;
              const id = parseInt(key.replace('source-', ''), 10);
              return !isNaN(id) && idSet.has(id);
            });
          }
          break;

        case 'refreshAllSources':
          // 所有源刷新完成：清空所有缓存
          logger.info('[HomeScreen] 🔄 收到全部刷新事件，清除所有标签缓存');
          setTabDataMap(new Map());
          reloadCurrentIfMatches(() => true);
          break;

        case 'sourceDeleted':
          // 源被删除：移除该源缓存，刷新"全部"tab
          if (sourceId) {
            logger.info(`[HomeScreen] 🗑️ 收到源删除事件: ${sourceName || sourceId}`);
            setTabDataMap(prev => {
              const updated = new Map(prev);
              updated.delete(`source-${sourceId}`);
              updated.delete('all'); // 同时刷新"全部"tab
              return updated;
            });
            reloadCurrentIfMatches(key => key === 'all'); // 源删了，不需要刷新该源的 tab（会消失），只刷新 all
          }
          break;

        case 'sourceUpdated':
          // 源被更新：刷新该源tab
          if (sourceId) {
            logger.info(`[HomeScreen] ✏️ 收到源更新事件: ${sourceName || sourceId}`);
            setTabDataMap(prev => {
              const updated = new Map(prev);
              updated.delete(`source-${sourceId}`);
              return updated;
            });
            reloadCurrentIfMatches(key => key === `source-${sourceId}`);
          }
          break;

        case 'updateRSSStats':
          // RSS统计更新：说明有新数据写入，需要刷新当前视图
          // 🛑 优化：如果是手动下拉刷新 或 后台批量刷新中，忽略此事件
          if (isRefreshingRef.current || isBatchSyncingRef.current) {
            logger.info('[HomeScreen] 📊 收到RSS统计更新事件，但正在批量操作中，跳过自动刷新');
            break;
          }

          // 【修复】完全跳过标记已读/未读事件，不清除缓存，不重新加载列表
          // 这些事件只影响统计数据，不影响列表结构或内容
          if (eventData.reason === 'markRead' || eventData.reason === 'markUnread' || eventData.reason === 'markAllRead') {
            logger.info(`[HomeScreen] 📊 收到 ${eventData.reason} 触发的统计更新，完全跳过缓存清除和列表重新加载`);
            break;
          }

          // 【新增】如果是后台恢复（没有待处理的滚动信息），不要清空缓存
          // 这样可以避免后台时的缓存事件导致列表被清空
          if (lastViewedArticleId === null && initialArticleId === null && !didSwitchArticle) {
            logger.info('[HomeScreen] 📊 后台恢复，跳过缓存清空');
            break;
          }

          logger.info('[HomeScreen] 📊 收到RSS统计更新事件，准备刷新（防抖处理）');

          // 🛑 防抖：2秒内多次收到事件，只刷新一次
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }

          debounceTimerRef.current = setTimeout(() => {
            logger.info('[HomeScreen] 📊 执行防抖后的刷新');
            // 既然统计数据变了，说明有新文章或状态变更，清除所有缓存是安全的
            setTabDataMap(new Map());
            reloadCurrentIfMatches(() => true);
          }, 1000); // 1秒防抖，足够覆盖大部分并发写入
          break;

        case 'articleRead':
          // 单篇文章标记为已读：更新本地状态，避免刷新列表
          if (eventData.articleId) {
            const id = eventData.articleId;
            logger.info(`[HomeScreen] 📖 收到文章已读事件: ${id}`);
            setTabDataMap(prev => {
              const updated = new Map(prev);

              // 遍历所有 tab，找到包含该文章的列表并更新
              for (const [key, data] of updated.entries()) {
                const articleIndex = data.articles.findIndex(a => a.id === id);
                if (articleIndex !== -1) {
                  // 创建新的文章数组
                  const newArticles = [...data.articles];
                  newArticles[articleIndex] = { ...newArticles[articleIndex], isRead: true };
                  updated.set(key, { ...data, articles: newArticles });
                  logger.info(`[HomeScreen] ✅ 更新了 Tab ${key} 中的文章状态`);
                }
              }
              return updated;
            });
          }
          break;
      }
    });

    return unsubscribe; // 组件卸载时自动取消订阅
  }, []);
  useFocusEffect(useCallback(() => {
    // 获取滚动信息和刷新标记
    const { shouldScroll, articleId, shouldRefresh, didSwitchArticle: didSwitch } = getPendingScrollInfo();
    logger.info('[HomeScreen] useFocusEffect, shouldScroll:', shouldScroll, 'articleId:', articleId, 'shouldRefresh:', shouldRefresh, 'didSwitchArticle:', didSwitch);

    const currentRoute = routes[index];

    // 定义滚动操作
    const performScroll = () => {
      if (shouldScroll && articleId !== null && currentRoute) {
        logger.info('[HomeScreen] Article was switched, scrolling to:', articleId);
        const sceneRef = sceneRefsMap.get(currentRoute.key);
        if (sceneRef) {
          // 延时确保列表渲染完成
          setTimeout(() => {
            sceneRef.scrollToArticleId(articleId);
          }, 200);
        }
      }
    };

    // 【修复】只在shouldRefresh=true AND didSwitchArticle=true时才刷新
    // 如果shouldRefresh=true但didSwitchArticle=false，说明是后台恢复，不需要刷新
    if (shouldRefresh && didSwitch && currentRoute) {
      logger.info('[HomeScreen] Refreshing articles after returning from detail page (article was switched)');
      loadArticles(currentRoute.key, false).then(() => {
        // 刷新完成后再滚动
        performScroll();
      });
    } else {
      // 不需要刷新，直接滚动
      performScroll();
    }

    // 🔀 检查是否从订阅源管理页穿透过来
    const sourceId = (route?.params as any)?.sourceId;
    const sourceName = (route?.params as any)?.sourceName;

    if (sourceId && sourceName) {
      // 找到对应源的 tab 索引
      const sourceTabIndex = routes.findIndex(r => r.key === `source-${sourceId}`);
      if (sourceTabIndex !== -1) {
        logger.info(`[HomeScreen] 🔀 穿透到源标签: ${sourceName} (index: ${sourceTabIndex})`);
        setIndex(sourceTabIndex);
        setLoadedTabs(prev => new Set(prev).add(sourceTabIndex));

        // 🔥 修复：明确加载目标标签的数据，防止出现空页面
        if (routes[sourceTabIndex]) {
          loadArticles(routes[sourceTabIndex].key);
        }

        // 使用 setImmediate 确保 UI 更新后再滚动
        setImmediate(() => {
          tabContentRef.current?.scrollToIndex(sourceTabIndex);
        });
      }
      // 清除参数，避免重复触发
      navigation.setParams({ sourceId: null, sourceName: null } as any);
      return;
    }
  }, [index, routes, sceneRefsMap, navigation, route, loadArticles]));

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    // 立即同步状态到 ref，确保事件监听器能读到最新状态
    isRefreshingRef.current = true;

    try {
      const currentRoute = routes[index];
      if (currentRoute) {
        if (currentRoute.key === 'all') {
          await syncAllSources();
        } else if (currentRoute.key.startsWith('source-')) {
          const sourceId = parseInt(currentRoute.key.replace('source-', ''), 10);
          if (!isNaN(sourceId)) {
            await syncSource(sourceId);
          }
        }
      }
    } catch (error) {
      logger.error('Refresh failed:', error);
      ToastAndroid.show('刷新失败，请重试', ToastAndroid.SHORT);
    } finally {
      setIsRefreshing(false);
      isRefreshingRef.current = false;
    }
  }, [index, routes, syncAllSources, syncSource]);

  // 【重构】加载更多回调（支持每个标签独立加载）
  const handleLoadMore = useCallback(async (tabKey: string) => {
    const tabData = getTabData(tabKey);
    if (tabData.isLoadingMore || !tabData.hasMore || isRefreshing) return;

    logger.info(`[HomeScreen] Loading more articles for tab "${tabKey}"...`);

    // 设置加载状态
    setTabDataMap(prev => {
      const updated = new Map(prev);
      const currentData = updated.get(tabKey) || getTabData(tabKey);
      updated.set(tabKey, { ...currentData, isLoadingMore: true });
      return updated;
    });

    try {
      await loadArticles(tabKey, true); // 追加加载
    } catch (error) {
      logger.error('Load more failed:', error);
    }
  }, [isRefreshing, getTabData]);

  const handleIndexChange = useCallback((newIndex: number) => {
    setIndex(newIndex);
    setLoadedTabs(prev => new Set(prev).add(newIndex));

    // 切换标签时，如果该标签或相邻标签还没加载过数据，则加载
    [newIndex, newIndex - 1, newIndex + 1].forEach(idx => {
      if (idx >= 0 && idx < routes.length) {
        const route = routes[idx];
        if (route && !tabDataMap.has(route.key)) {
          loadArticles(route.key);
        }
      }
    });
  }, [routes, tabDataMap, loadArticles]);

  const handleTabPress = useCallback((tabIndex: number) => {
    setIndex(tabIndex);
    setLoadedTabs(prev => new Set(prev).add(tabIndex));
    tabContentRef.current?.scrollToIndex(tabIndex);

    // 点击标签时，预加载该标签及其相邻标签
    [tabIndex, tabIndex - 1, tabIndex + 1].forEach(idx => {
      if (idx >= 0 && idx < routes.length) {
        const route = routes[idx];
        if (route && !tabDataMap.has(route.key)) {
          loadArticles(route.key);
        }
      }
    });
  }, [routes, tabDataMap, loadArticles]);

  const renderScene = useCallback(({ route, index: tabIndex }: { route: { key: string; title: string; unreadCount?: number }; index: number }) => {
    const isActive = loadedTabs.has(tabIndex);
    const isCloseToFocus = Math.abs(index - tabIndex) <= 1;
    const isNeighbor = !isActive && isCloseToFocus;

    if (!isActive && !isCloseToFocus) {
      return <View style={[styles.lazyPlaceholder, { width: screenWidth }]} />;
    }

    // 【修改】从 tabDataMap 获取该标签的数据
    const tabData = getTabData(route.key);
    const articleIds = tabData.articles.map(a => a.id);

    return (
      <View style={{ width: screenWidth, flex: 1 }}>
        <ArticleListScene
          ref={(ref: any) => {
            if (ref) sceneRefsMap.set(route.key, ref);
          }}
          sourceName={route.title}
          articles={tabData.articles}
          isRefreshing={isRefreshing && index === tabIndex}
          onRefresh={handleRefresh}
          onArticlePress={(id: number) => {
            const tPressMs = nowMs();
            const perfId = `${id}-${Math.round(tPressMs)}`;

            // 立即在本地标记为已读（乐观更新），无需等待返回刷新
            setTabDataMap(prev => {
              const updated = new Map(prev);
              const currentData = updated.get(route.key);
              if (currentData) {
                const newArticles = currentData.articles.map(a =>
                  a.id === id ? { ...a, isRead: true } : a
                );
                updated.set(route.key, { ...currentData, articles: newArticles });
              }
              // 同时更新"全部"标签中的状态
              if (route.key !== 'all' && updated.has('all')) {
                const allData = updated.get('all');
                if (allData) {
                  const newAllArticles = allData.articles.map(a =>
                    a.id === id ? { ...a, isRead: true } : a
                  );
                  updated.set('all', { ...allData, articles: newAllArticles });
                }
              }
              return updated;
            });

            const currentIndex = articleIds.indexOf(id);
            setLastViewedArticleId(id);
            const quickArticle = tabData.articles.find(a => a.id === id);
            const tNavigateMs = nowMs();
            logger.info(
              `[Perf] [List->Detail] press id=${perfId} dtBeforeNavigateMs=${Math.round(
                tNavigateMs - tPressMs
              )} tab=${route.key} listCount=${tabData.articles.length} articleId=${id}`
            );
            navigation.navigate('ArticleDetail', {
              articleId: id,
              articleIds,
              currentIndex: currentIndex >= 0 ? currentIndex : 0,
              perf: { id: perfId, tPressMs, tNavigateMs, sourceTabKey: route.key },
              article: quickArticle
                ? {
                  ...quickArticle,
                  publishedAt:
                    quickArticle.publishedAt instanceof Date
                      ? quickArticle.publishedAt.toISOString()
                      : new Date((quickArticle as any).publishedAt).toISOString(),
                  readAt: quickArticle.readAt
                    ? (quickArticle.readAt instanceof Date
                      ? quickArticle.readAt.toISOString()
                      : new Date((quickArticle as any).readAt).toISOString())
                    : undefined,
                }
                : undefined
            });
          }}
          theme={theme}
          isActive={isActive}
          isNeighbor={isNeighbor}
          onLoadMore={() => handleLoadMore(route.key)}
          isLoadingMore={tabData.isLoadingMore}
          hasMore={tabData.hasMore}
          autoMarkReadOnScroll={settings?.autoMarkReadOnScroll}
          onMarkRead={(ids: number[]) => {
            const idSet = new Set(ids);
            setTabDataMap(prev => {
              const updated = new Map(prev);
              const currentData = updated.get(route.key);
              if (currentData) {
                const newArticles = currentData.articles.map(a =>
                  idSet.has(a.id) ? { ...a, isRead: true } : a
                );
                updated.set(route.key, { ...currentData, articles: newArticles });
              }
              // 同时更新"全部"标签中的状态
              if (route.key !== 'all' && updated.has('all')) {
                const allData = updated.get('all');
                if (allData) {
                  const newAllArticles = allData.articles.map(a =>
                    idSet.has(a.id) ? { ...a, isRead: true } : a
                  );
                  updated.set('all', { ...allData, articles: newAllArticles });
                }
              }
              return updated;
            });
          }}
        />
      </View>
    );
  }, [routes, loadedTabs, isRefreshing, index, handleRefresh, theme, navigation, screenWidth, tabDataMap, handleLoadMore, getTabData, settings]);

  const handleMarkAllRead = useCallback(async () => {
    Alert.alert(
      '全部标记已读',
      '确定要将当前列表中的所有文章标记为已读吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            try {
              const currentRoute = routes[index];
              let sourceId: number | undefined;

              if (currentRoute.key.startsWith('source-')) {
                sourceId = parseInt(currentRoute.key.replace('source-', ''), 10);
              }

              await articleService.markAllAsRead(sourceId);
              setTabDataMap(prev => {
                const updated = new Map(prev);
                const tabKey = currentRoute.key;

                const applyToKey = (key: string) => {
                  const data = updated.get(key);
                  if (!data) return;

                  if (showOnlyUnread) {
                    updated.set(key, { ...data, articles: [] });
                    return;
                  }

                  let hasChange = false;
                  const newArticles = data.articles.map(a => {
                    if (a.isRead) return a;
                    hasChange = true;
                    return { ...a, isRead: true };
                  });

                  if (hasChange) {
                    updated.set(key, { ...data, articles: newArticles });
                  }
                };

                applyToKey(tabKey);
                if (tabKey !== 'all') applyToKey('all');
                return updated;
              });
            } catch (error) {
              logger.error('Mark all read failed:', error);
            }
          }
        }
      ]
    );
  }, [routes, index, showOnlyUnread]); // Added showOnlyUnread to deps

  const toggleShowOnlyUnread = useCallback(() => {
    setShowOnlyUnread(prev => !prev);
  }, []);

  // 监听过滤条件变化重新加载
  useEffect(() => {
    setTabDataMap(new Map());
    const currentRoute = routes[index];
    if (currentRoute) {
      loadArticles(currentRoute.key, false);
    }
  }, [showOnlyUnread]);

  const handleGenerateReport = useCallback(async () => {
    if (generatingReport) return;
    setGeneratingReport(true);
    try {
      const result = await dailyReportApiService.generateReport();
      if (result) {
        Alert.alert(
          '生成成功',
          'AI 日报已生成，是否前往查看？',
          [
            { text: '稍后', style: 'cancel' },
            { text: '前往', onPress: () => navigation.navigate('DailyReportList' as any) }
          ]
        );
      } else {
        Alert.alert('生成失败', '暂无足够的新闻素材或未配置 AI');
      }
    } catch (error) {
      Alert.alert('生成失败', (error as Error).message);
    } finally {
      setGeneratingReport(false);
    }
  }, [generatingReport, navigation]);

  return (
    <ScreenWithCustomHeader
      title="文章"
      showBackButton={false}
      rightComponent={
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: '100%',
          paddingRight: 12,
          marginTop: -1.5
        }}>
          <TouchableOpacity
            onPress={handleGenerateReport}
            disabled={generatingReport}
            style={{
              width: 24,
              height: 24,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              marginRight: 10,
              borderWidth: 0,
              backgroundColor: 'transparent',
            }}
            hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
          >
            {generatingReport ? (
              <ActivityIndicator size="small" color={theme.isDark ? theme.colors.primary : '#FFFFFF'} />
            ) : (
              <MaterialIcons
                name="auto-awesome"
                size={18}
                color={theme.isDark ? theme.colors.onSurfaceVariant : '#FFFFFF'}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={toggleShowOnlyUnread}
            style={{
              width: 24,
              height: 24,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              marginRight: 10,
              // 描边风格
              borderWidth: 0,
              borderColor: showOnlyUnread ? (theme.isDark ? theme.colors.primary : '#FFFFFF') : (theme.isDark ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)'),
              backgroundColor: showOnlyUnread ? (theme.isDark ? theme.colors.primary : '#FFFFFF') : 'transparent',
            }}
            hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
          >
            <MaterialIcons
              name={showOnlyUnread ? "filter-list" : "filter-list-off"}
              size={18}
              color={showOnlyUnread ? (theme.isDark ? theme.colors.onPrimary : theme.colors.primary) : (theme.isDark ? theme.colors.onSurfaceVariant : '#FFFFFF')}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleMarkAllRead}
            style={{
              width: 24,
              height: 24,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              // 描边风格
              borderWidth: 0,
              borderColor: theme.isDark ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)',
              backgroundColor: 'transparent',
            }}
            hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
          >
            <MaterialIcons
              name="done-all"
              size={18}
              color={theme.isDark ? theme.colors.onSurface : theme.colors.onPrimary}
            />
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <CustomTabBar
            tabs={routes}
            scrollX={scrollX}
            screenWidth={screenWidth}
            activeIndex={index}
            onTabPress={handleTabPress}
          />
        </View>

        <DailyReportCard
          onPress={(reportId) => navigation.navigate('DailyReportDetail' as any, { reportId })}
        />

        <CustomTabContent
          ref={tabContentRef}
          tabs={routes}
          renderScene={renderScene}
          scrollX={scrollX}
          onIndexChange={handleIndexChange}
          initialIndex={0}
        />
      </View>
    </ScreenWithCustomHeader>
  );
};

// 【样式重构】
const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
      // 移除 paddingHorizontal 和高度限制，让 TabBar 撑开
    },
    menuButton: {
      paddingHorizontal: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
      paddingTop: Platform.OS === 'ios' ? 60 : 40,
      paddingRight: 10,
    },
    menuContainer: {
      width: 160,
      borderRadius: 8,
      backgroundColor: theme.colors.surface,
      elevation: theme.isDark ? 6 : 5,
      shadowColor: theme.isDark ? '#000' : (theme.colors.shadow || '#000'),
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.isDark ? 0.3 : 0.25,
      shadowRadius: 3.84,
      paddingVertical: 4,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
    },
    menuText: {
      marginLeft: 12,
      fontSize: 16,
      lineHeight: 24,
      includeFontPadding: false,
    },
    menuDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.outlineVariant,
      marginHorizontal: 12,
    },
    lazyPlaceholder: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    articleListContainer: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      paddingBottom: 40, // 底部留白
    },
    // 文章卡片样式优化
    articleItem: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 12,
      marginBottom: 10, // 卡片间距
      flexDirection: 'row',
      // 阴影效果 (iOS)
      shadowColor: theme.isDark ? '#000' : (theme.colors.shadow || '#000'),
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.isDark ? 0.3 : 0.05,
      shadowRadius: 8,
      // 阴影效果 (Android)
      elevation: theme.isDark ? 3 : 2,
      // 深色模式下加可见边框
      borderWidth: theme.isDark ? 1 : 0,
      borderColor: theme.isDark ? theme.colors.outlineVariant : 'transparent',
    },
    // 未读文章背景稍微亮一点/不同一点 (可选)
    articleItemUnread: {
      backgroundColor: theme.colors.surfaceContainerLow,
    },
    articleContent: {
      flex: 1,
      marginRight: 12, // 文字和图片的间距
      justifyContent: 'space-between', // 上下撑开
    },
    // 标题行
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start', // 对齐顶部，防止多行时错位
      marginBottom: 6,
    },
    // 未读圆点
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.primary,
      marginTop: 6, // 视觉上与第一行文字居中
      marginRight: 4,
    },
    articleTitle: {
      flex: 1,
      ...typography.bodyLarge,
      fontWeight: '600',
      color: theme.colors.onSurface,
      opacity: 0.6, // 已读文章稍微淡一点
    },
    articleTitleUnread: {
      fontWeight: '700',
      opacity: 1,
    },
    articleSubtitle: {
      ...typography.bodyMedium,
      color: theme.colors.onSurfaceVariant,
      marginBottom: 10,
    },
    // 底部元信息行
    articleMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    sourceTag: {
      ...typography.bodySmall,
      fontWeight: '500',
      color: theme.colors.primary,
      maxWidth: 100,
    },
    metaDivider: {
      ...typography.bodySmall,
      color: theme.colors.outline,
      marginHorizontal: 6,
    },
    metaText: {
      ...typography.bodySmall,
      color: theme.colors.outline,
    },
    // 图片容器
    imageShadowWrapper: {
      width: 80,
      height: 80,
      borderRadius: 12,
      backgroundColor: theme.isDark ? 'transparent' : theme.colors.surface, // 必须有背景色阴影才会生效
      // iOS 阴影
      shadowColor: theme.isDark ? '#000' : (theme.colors.shadow || '#000'),
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: theme.isDark ? 0.5 : 0.2,
      shadowRadius: 8,
      // Android 阴影
      elevation: theme.isDark ? 8 : 6,
    },
    imageContainer: {
      width: '100%',
      height: '100%',
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceVariant,
      overflow: 'hidden',
    },
    articleImage: {
      width: '100%',
      height: '100%',
    },
    // 空状态
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 100,
    },
    emptyIconContainer: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: theme.colors.surfaceContainerHighest,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
    },
    emptyText: {
      ...typography.bodyLarge,
      color: theme.colors.onSurfaceVariant,
      marginBottom: 24,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    refreshButton: {
      paddingHorizontal: 24,
      paddingVertical: 10,
      borderRadius: 20,
      backgroundColor: theme.colors.primaryContainer,
    },
    refreshButtonText: {
      ...typography.labelMedium,
      fontWeight: '600',
      color: theme.colors.onPrimaryContainer,
    },
  });

export default HomeScreen;
