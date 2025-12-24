import React, { useState, useCallback, useEffect, useMemo, memo, useRef, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  useWindowDimensions,
  TouchableOpacity,
  Platform, // 新增
  ActivityIndicator, // 【新增】用于加载更多指示器
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { HomeStackScreenProps } from '../../navigation/types';
import { useThemeContext } from '../../theme';
import { typography } from '../../theme/typography';
import { useRSSSource } from '../../contexts/RSSSourceContext';
import { articleService, RSSService } from '../../services';
import { SettingsService } from '../../services/SettingsService';
import cacheEventEmitter from '../../services/CacheEventEmitter';
import { useReadingSettings } from '../../contexts/ReadingSettingsContext';
import type { Article } from '../../types';
import CustomTabBar from '../../components/CustomTabBar';
import CustomTabContent, { CustomTabContentHandle } from '../../components/CustomTabContent';
import { useSharedValue } from 'react-native-reanimated';

// 🔥 防盗链域名列表
const ANTI_HOTLINK_DOMAINS = [
  'cdnfile.sspai.com', 'cdn.sspai.com', 'sspai.com',
  's3.ifanr.com', 'images.ifanr.cn', 'ifanr.com',
  'cnbetacdn.com', 'static.cnbetacdn.com',
  'twimg.com', 'pbs.twimg.com',
  'miro.medium.com',
];

/**
 * 检查图片 URL 是否需要代理
 */
function needsProxy(url: string): boolean {
  if (!url || url.startsWith('data:')) return false;
  const urlLower = url.toLowerCase();
  return ANTI_HOTLINK_DOMAINS.some(domain => urlLower.includes(domain));
}

/**
 * 将图片 URL 转换为代理 URL
 */
function toProxyUrl(url: string, proxyServerUrl: string): string {
  if (!url || !proxyServerUrl) return url;
  return `${proxyServerUrl}/api/image?url=${encodeURIComponent(url)}`;
}

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
  needRefreshOnReturn = true; // 【新增】进入详情页后，返回时需要刷新
};

export const getPendingScrollInfo = () => {
  const shouldScroll = didSwitchArticle;
  const articleId = lastViewedArticleId;
  const shouldRefresh = needRefreshOnReturn; // 【新增】获取是否需要刷新
  // 清空状态
  didSwitchArticle = false;
  initialArticleId = null;
  lastViewedArticleId = null;
  needRefreshOnReturn = false; // 【新增】清空刷新标记
  return { shouldScroll, articleId, shouldRefresh };
};

type Props = HomeStackScreenProps<'HomeMain'>;

// 【优化】提取单独的 ArticleItem 组件，性能更好且代码更清晰
const ArticleItem = memo(({ item, onPress, styles, isDark, theme, proxyServerUrl }: any) => {
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
    if (proxyServerUrl && needsProxy(item.imageUrl)) {
      return toProxyUrl(item.imageUrl, proxyServerUrl);
    }
    return item.imageUrl;
  }, [item.imageUrl, proxyServerUrl]);

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
        <Image
          source={{ uri: imageUri }}
          style={styles.articleImage}
          resizeMode="cover"
        />
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
  isDark,
  theme,
  isActive,
  isNeighbor,
  proxyServerUrl,
  onLoadMore, // 【新增】加载更多回调
  isLoadingMore, // 【新增】加载更多状态
  hasMore, // 【新增】是否还有更多
}: any, ref: React.Ref<any>) {
  const styles = useMemo(() => createStyles(isDark, theme), [isDark, theme]);
  const flatListRef = useRef<FlatList>(null);
  const ITEM_HEIGHT = 110;
  
  // 🌟 中間层优化：传入 isNeighbor 下，得以组件本身接收 props
  const hasTriedLoad = useRef(false);

  // 【删除】不再需要跟踪可见项和滚动位置
  
  // 【简化】直接滚动到指定文章，不做任何检查
  React.useImperativeHandle(ref, () => ({
    scrollToArticleId: (articleId: number) => {
      const index = articles.findIndex((a: any) => a.id === articleId);
      if (index < 0 || !flatListRef.current) return;
      
      console.log('[ArticleListScene] Scrolling to article:', articleId, 'index:', index);
      // viewPosition: 0.5 让文章显示在屏幕中間
      flatListRef.current.scrollToIndex({ index, animated: false, viewPosition: 0.5 });
    }
  }), [articles]);
  
  // 【删除】不再需要 onViewableItemsChanged 和 handleScroll

  // 🌟 优化点：仅当是主页面或预加载时才渲染内容
  if (!isActive && !isNeighbor) return <View style={styles.lazyPlaceholder} />;

  return (
    <FlatList
      ref={flatListRef}
      data={articles}
      keyExtractor={(item, index) => `${item.id}-${index}`}
      contentContainerStyle={styles.articleListContainer}
      showsVerticalScrollIndicator={false}
      getItemLayout={(data, index) => ({
        length: ITEM_HEIGHT,
        offset: ITEM_HEIGHT * index,
        index,
      })}
      onScrollToIndexFailed={(info) => {
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
          titleColor={theme?.colors?.outline}
          tintColor={theme?.colors?.primary}
        />
      }
      onEndReached={hasMore && !isLoadingMore ? onLoadMore : null} // 【新增】滚动到底部时加载更多
      onEndReachedThreshold={0.5} // 【新增】提前加载（距离底部50%时）
      ListFooterComponent={() => // 【新增】列表底部加载指示器
        isLoadingMore ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={theme?.colors?.primary} />
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <ArticleItem
          item={item}
          onPress={onArticlePress}
          styles={styles}
          isDark={isDark}
          theme={theme}
          proxyServerUrl={proxyServerUrl}
        />
      )}
      ListEmptyComponent={() => (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <MaterialIcons name="inbox" size={64} color={theme?.colors?.outlineVariant} />
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
  const { theme, isDark } = useThemeContext();
  const { rssSources, syncAllSources, syncSource } = useRSSSource();
  const { settings } = useReadingSettings();
  const tabContentRef = useRef<CustomTabContentHandle>(null);
  const sceneRefsMap = useRef<Map<string, any>>(new Map()).current;
  const scrollX = useSharedValue(0);
  const { width: screenWidth } = useWindowDimensions();
  const flatListRef = useRef<FlatList>(null);
  const currentSourceRef = useRef<string>('');

  const [index, setIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState<Set<number>>(new Set([0]));
  const [proxyServerUrl, setProxyServerUrl] = useState<string>(''); // 🔥 新增
  
  // 【重构】每个标签页独立管理文章数据和分页状态
  const [tabDataMap, setTabDataMap] = useState<Map<string, {
    articles: Article[];
    offset: number;
    hasMore: boolean;
    isLoadingMore: boolean;
  }>>(new Map());
  // 【删除】不再需要 scrollToArticleId 状态

  const styles = createStyles(isDark, theme);

  const routes = useMemo(() => {
    let baseRoutes = [{ key: 'all', title: '全部' }];
    if (settings && settings.showAllTab === false) {
      baseRoutes = [];
    }
    const sourceRoutes = rssSources.map(source => ({
      key: `source-${source.id}`,
      title: source.name
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
  const loadArticles = async (tabKey: string, append: boolean = false) => {
    try {
      const tabData = getTabData(tabKey);
      const offset = append ? tabData.articles.length : 0;
      const limit = 20;
      
      let newArticles: Article[];
      
      // 根据 tabKey 决定加载哪个源的数据
      if (tabKey === 'all') {
        // 全部标签：加载所有源的文章
        newArticles = await articleService.getArticles({
          limit,
          offset,
          sortBy: 'published_at',
          sortOrder: 'DESC',
        });
      } else if (tabKey.startsWith('source-')) {
        // 特定源标签：加载该源的文章
        const sourceId = parseInt(tabKey.replace('source-', ''), 10);
        newArticles = await articleService.getArticles({
          rssSourceId: sourceId,
          limit,
          offset,
          sortBy: 'published_at',
          sortOrder: 'DESC',
        });
      } else {
        newArticles = [];
      }
      
      // 更新该标签的数据
      setTabDataMap(prev => {
        const updated = new Map(prev);
        const currentData = updated.get(tabKey) || getTabData(tabKey);
        updated.set(tabKey, {
          articles: append ? [...currentData.articles, ...newArticles] : newArticles,
          offset: offset + newArticles.length,
          hasMore: newArticles.length >= limit,
          isLoadingMore: false,
        });
        return updated;
      });
      
      console.log(`[HomeScreen] Loaded ${newArticles.length} articles for tab "${tabKey}", append: ${append}`);
    } catch (error) {
      console.error(`Failed to load articles for tab "${tabKey}":`, error);
    }
  };

  // 【修改】初始化时加载第一个标签的数据
  useEffect(() => {
    if (routes.length > 0 && !tabDataMap.has(routes[0].key)) {
      loadArticles(routes[0].key);
    }
  }, [routes]);
  
  // 🔥 获取代理配置
  useEffect(() => {
    const loadProxyConfig = async () => {
      try {
        const config = await SettingsService.getInstance().getProxyModeConfig();
        if (config.enabled && config.serverUrl) {
          setProxyServerUrl(config.serverUrl);
        }
      } catch (error) {
        console.error('Failed to load proxy config:', error);
      }
    };
    loadProxyConfig();
  }, []);
  
  // 🌟 【修复】后台刷新定时器：只在组件挂载时启动一次，避免频繁重置
  useEffect(() => {
    let refreshTimer: NodeJS.Timeout | null = null;
    let refreshInterval: NodeJS.Timeout | null = null;
    
    const triggerBackgroundSync = async () => {
      // 检查是否有活跃源（避免在无源时刷新）
      if (rssSources.length === 0) {
        console.log('[HomeScreen] ⚠️ 无活跃源，跳过后台刷新');
        return;
      }
      
      console.log('[HomeScreen] 🔄 启动静默后台刷新...');
      try {
        await RSSService.getInstance().refreshAllSourcesBackground({
          maxConcurrent: 3,
          onProgress: (current, total, sourceName) => {
            console.log(`[HomeScreen] 🔄 正在刷新: ${sourceName} (${current}/${total})`);
          },
          onArticlesReady: (articles, sourceName) => {
            console.log(`[HomeScreen] ✅ ${sourceName} 刷新完成，新增 ${articles.length} 篇文章`);
          },
        });
        
        // 【修改】后台刷新完成后，清空所有标签缓存，下次访问时重新加载
        console.log('[HomeScreen] 🔄 清空标签缓存，等待用户触发刷新');
        setTabDataMap(new Map());
        
        console.log('[HomeScreen] ✅ 后台刷新完成');
      } catch (error) {
        console.warn('[HomeScreen] ⚠️ 后台刷新失败（可忽略）:', error);
      }
    };

    // 【修复】只在组件挂载时启动定时器，不依赖 rssSources 变化
    if (rssSources.length > 0) {
      // 延迟 500ms 启动首次刷新
      refreshTimer = setTimeout(triggerBackgroundSync, 500);
      
      // 每 10 分钟刷新一次（600000ms）
      refreshInterval = setInterval(triggerBackgroundSync, 10 * 60 * 1000);
      
      console.log('[HomeScreen] ⏰ 后台刷新定时器已启动（10分钟一次）');
    }
    
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (refreshInterval) clearInterval(refreshInterval);
      console.log('[HomeScreen] ⏰ 后台刷新定时器已清理');
    };
  }, []); // 【关键修复】空依赖数组，只在挂载/卸载时执行
  
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
          console.log(`[HomeScreen] 🗑️ 清理已删除源的缓存: ${key}`);
          updated.delete(key);
          hasChanges = true;
        }
      }
      
      // 【关键修复】如果有源被删除，也清理"全部"标签的缓存
      if (hasChanges && updated.has('all')) {
        console.log(`[HomeScreen] 🗑️ 清理"全部"标签缓存（源已变更）`);
        updated.delete('all');
      }
      
      return hasChanges ? updated : prev;
    });
  }, [rssSources]);
  
  // 【新增】监听全局缓存清除事件
  useEffect(() => {
    const unsubscribe = cacheEventEmitter.subscribe((event) => {
      if (event === 'clearAll') {
        console.log('[HomeScreen] 🧹 收到全局清除缓存事件，清除 tabDataMap');
        setTabDataMap(new Map());
      } else if (event === 'clearArticles') {
        console.log('[HomeScreen] 🧹 收到清除文章缓存事件，清除所有标签的文章数据');
        setTabDataMap(new Map());
      }
    });
    
    return unsubscribe; // 组件卸载时自动取消订阅
  }, []);
  useFocusEffect(useCallback(() => {
    // 获取滚动信息和刷新标记
    const { shouldScroll, articleId, shouldRefresh } = getPendingScrollInfo();
    console.log('[HomeScreen] useFocusEffect, shouldScroll:', shouldScroll, 'articleId:', articleId, 'shouldRefresh:', shouldRefresh);
    
    // 【新增】如果从详情页返回，刷新当前标签的数据以更新已读状态
    if (shouldRefresh) {
      const currentRoute = routes[index];
      if (currentRoute) {
        console.log('[HomeScreen] Refreshing articles after returning from detail page');
        loadArticles(currentRoute.key, false);
      }
    }
    
    // 🔀 检查是否从订阅源管理页穿透过来
    const sourceId = (route?.params as any)?.sourceId;
    const sourceName = (route?.params as any)?.sourceName;
    
    if (sourceId && sourceName) {
      // 找到对应源的 tab 索引
      const sourceTabIndex = routes.findIndex(r => r.key === `source-${sourceId}`);
      if (sourceTabIndex !== -1) {
        console.log(`[HomeScreen] 🔀 穿透到源标签: ${sourceName} (index: ${sourceTabIndex})`);
        setIndex(sourceTabIndex);
        setLoadedTabs(prev => new Set(prev).add(sourceTabIndex));
        // 使用 setImmediate 确保 UI 更新后再滚动
        setImmediate(() => {
          tabContentRef.current?.scrollToIndex(sourceTabIndex);
        });
      }
      // 清除参数，避免重复触发
      navigation.setParams({ sourceId: null, sourceName: null } as any);
      return;
    }
    
    if (shouldScroll && articleId !== null) {
      console.log('[HomeScreen] Article was switched, scrolling to:', articleId);
      // 直接调用当前 tab 的 scene ref 滚动
      const currentRoute = routes[index];
      if (currentRoute) {
        const sceneRef = sceneRefsMap.get(currentRoute.key);
        if (sceneRef) {
          // 使用 setImmediate 确保 scene 已经渲染
          setImmediate(() => {
            sceneRef.scrollToArticleId(articleId);
          });
        }
      }
    }
  }, [index, routes, sceneRefsMap, navigation, route]));

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const currentRoute = routes[index];
      if (currentRoute) {
        if (currentRoute.key === 'all') {
          await syncAllSources();
        } else if (currentRoute.key.startsWith('source-')) {
          const sourceId = parseInt(currentRoute.key.replace('source-', ''), 10);
          if (!isNaN(sourceId)) await syncSource(sourceId);
        }
        // 重新加载当前标签的数据
        await loadArticles(currentRoute.key, false);
      }
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [index, routes, syncAllSources, syncSource]);
  
  // 【重构】加载更多回调（支持每个标签独立加载）
  const handleLoadMore = useCallback(async (tabKey: string) => {
    const tabData = getTabData(tabKey);
    if (tabData.isLoadingMore || !tabData.hasMore || isRefreshing) return;
    
    console.log(`[HomeScreen] Loading more articles for tab "${tabKey}"...`);
    
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
      console.error('Load more failed:', error);
    }
  }, [isRefreshing, getTabData]);

  const handleIndexChange = useCallback((newIndex: number) => {
    setIndex(newIndex);
    setLoadedTabs(prev => new Set(prev).add(newIndex));
    
    // 切换标签时，如果该标签还没加载过数据，则加载
    const route = routes[newIndex];
    if (route && !tabDataMap.has(route.key)) {
      loadArticles(route.key);
    }
  }, [routes, tabDataMap]);

  const handleTabPress = useCallback((tabIndex: number) => {
    setIndex(tabIndex);
    setLoadedTabs(prev => new Set(prev).add(tabIndex));
    tabContentRef.current?.scrollToIndex(tabIndex);
    
    // 点击标签时，如果该标签还没加载过数据，则加载
    const route = routes[tabIndex];
    if (route && !tabDataMap.has(route.key)) {
      loadArticles(route.key);
    }
  }, [routes, tabDataMap]);

  const renderScene = useCallback(({ route, index: tabIndex }: { route: { key: string; title: string }; index: number }) => {
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
      <View style={{ width: screenWidth }}>
        <ArticleListScene
          ref={(ref: any) => {
            if (ref) sceneRefsMap.set(route.key, ref);
          }}
          sourceName={route.title}
          articles={tabData.articles}
          isRefreshing={isRefreshing && index === tabIndex}
          onRefresh={handleRefresh}
          onArticlePress={(id: number) => {
            const currentIndex = articleIds.indexOf(id);
            setLastViewedArticleId(id);
            navigation.navigate('ArticleDetail', { 
              articleId: id,
              articleIds,
              currentIndex: currentIndex >= 0 ? currentIndex : 0
            });
          }}
          isDark={isDark}
          theme={theme}
          isActive={isActive}
          isNeighbor={isNeighbor}
          proxyServerUrl={proxyServerUrl}
          onLoadMore={() => handleLoadMore(route.key)}
          isLoadingMore={tabData.isLoadingMore}
          hasMore={tabData.hasMore}
        />
      </View>
    );
  }, [routes, loadedTabs, isRefreshing, index, handleRefresh, isDark, theme, navigation, screenWidth, tabDataMap, handleLoadMore, getTabData]);

  return (
    <View style={styles.container}>
      <CustomTabBar
        tabs={routes}
        scrollX={scrollX}
        screenWidth={screenWidth}
        activeIndex={index}
        onTabPress={handleTabPress}
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
  );
};

// 【样式重构】
const createStyles = (isDark: boolean, theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
    },
    lazyPlaceholder: {
      flex: 1,
      backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
    },
    articleListContainer: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      paddingBottom: 40, // 底部留白
    },
    // 文章卡片样式优化
    articleItem: {
      backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
      borderRadius: 16,
      padding: 12,
      marginBottom: 10, // 卡片间距
      flexDirection: 'row',
      // 阴影效果 (iOS)
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.05,
      shadowRadius: 8,
      // 阴影效果 (Android)
      elevation: isDark ? 0 : 2,
      // 深色模式下加个边框增加辨识度
      borderWidth: isDark ? 1 : 0,
      borderColor: theme?.colors?.outlineVariant || 'rgba(255,255,255,0.1)',
    },
    // 未读文章背景稍微亮一点/不同一点 (可选)
    articleItemUnread: {
      backgroundColor: theme?.colors?.surfaceContainerLow || (isDark ? '#36343B' : '#FEF7FF'),
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
      backgroundColor: theme?.colors?.primary || '#3B82F6',
      marginTop: 6, // 视觉上与第一行文字居中
      marginRight: 4,
    },
    articleTitle: {
      flex: 1,
      ...typography.bodyLarge,
      fontWeight: '600',
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      opacity: 0.6, // 已读文章稍微淡一点
    },
    articleTitleUnread: {
      fontWeight: '700',
      opacity: 1,
    },
    articleSubtitle: {
      ...typography.bodyMedium,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
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
      color: theme?.colors?.primary || '#3B82F6',
      maxWidth: 100,
    },
    metaDivider: {
      ...typography.bodySmall,
      color: theme?.colors?.outline || '#999',
      marginHorizontal: 6,
    },
    metaText: {
      ...typography.bodySmall,
      color: theme?.colors?.outline || (isDark ? '#938F99' : '#79747E'),
    },
    // 图片样式
    articleImage: {
      width: 80,
      height: 80,
      borderRadius: 12,
      backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#E6E0E9'),
      borderWidth: 0.5,
      borderColor: theme?.colors?.outlineVariant || 'rgba(0,0,0,0.05)',
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
      backgroundColor: theme?.colors?.surfaceContainerHighest || (isDark ? '#36343B' : '#F2F0F4'),
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
    },
    emptyText: {
      ...typography.bodyLarge,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
      marginBottom: 24,
    },
    refreshButton: {
      paddingHorizontal: 24,
      paddingVertical: 10,
      borderRadius: 20,
      backgroundColor: theme?.colors?.primaryContainer,
    },
    refreshButtonText: {
      ...typography.labelMedium,
      fontWeight: '600',
      color: theme?.colors?.onPrimaryContainer,
    },
  });

export default HomeScreen;
