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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { HomeStackScreenProps } from '../../navigation/types';
import { useThemeContext } from '../../theme';
import { useRSSSource } from '../../contexts/RSSSourceContext';
import { articleService, RSSService } from '../../services';
import { SettingsService } from '../../services/SettingsService';
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
};

export const getPendingScrollInfo = () => {
  const shouldScroll = didSwitchArticle;
  const articleId = lastViewedArticleId;
  // 清空状态
  didSwitchArticle = false;
  initialArticleId = null;
  lastViewedArticleId = null;
  return { shouldScroll, articleId };
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
      keyExtractor={(item) => item.id.toString()}
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

const HomeScreen: React.FC<Props> = ({ navigation }) => {
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
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadedTabs, setLoadedTabs] = useState<Set<number>>(new Set([0]));
  const [proxyServerUrl, setProxyServerUrl] = useState<string>(''); // 🔥 新增
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

  const loadArticles = async () => {
    try {
      // 🌟 优化点：对聚合页使用公平聚合查询
      const allArticles = await articleService.getInitialFairFeed(10);
      setArticles(allArticles);
      console.log('[HomeScreen] Loaded articles with fair feed:', allArticles.length);
    } catch (error) {
      console.error('Failed to load articles:', error);
    }
  };

  useEffect(() => { loadArticles(); }, []);
  
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
  
  // 🌟 【新增】第四层优化：启动时静默后台刷新 RSS 源
  useEffect(() => {
    const triggerBackgroundSync = async () => {
      console.log('[HomeScreen] 🔄 启动静默后台刷新...');
      try {
        const { rssSources, refreshAllSourcesBackground } = require('../../contexts/RSSSourceContext');
        // 注意：这里需要从 RSSSourceContext 中导出 refreshAllSourcesBackground
        // 或直接调用 RSSService.getInstance().refreshAllSourcesBackground()
        await RSSService.getInstance().refreshAllSourcesBackground({
          maxConcurrent: 3, // 核心并发控制
          onProgress: (current, total, sourceName) => {
            console.log(`[HomeScreen] 🔄 正在刷新: ${sourceName} (${current}/${total})`);
          },
          onArticlesReady: (articles, sourceName) => {
            console.log(`[HomeScreen] ✅ ${sourceName} 刷新完成，新增 ${articles.length} 篇文章`);
          },
        });
        // 后台刷新完成后，重新加载前台数据
        await loadArticles();
        console.log('[HomeScreen] ✅ 后台刷新完成，前台数据已更新');
      } catch (error) {
        console.warn('[HomeScreen] ⚠️ 后台刷新失败（可忽略，已有缓存）:', error);
      }
    };

    // 仅在首页加载完成且有活跃源时，才启动后台刷新
    if (rssSources.length > 0) {
      // 延迟 500ms 启动，给 UI 充分时间展示缓存数据
      const timer = setTimeout(triggerBackgroundSync, 500);
      return () => clearTimeout(timer);
    }
  }, [rssSources]);
  
  // 【修改】返回时检查是否需要重定位
  useFocusEffect(useCallback(() => { 
    loadArticles();
    
    // 获取滚动信息
    const { shouldScroll, articleId } = getPendingScrollInfo();
    console.log('[HomeScreen] useFocusEffect, shouldScroll:', shouldScroll, 'articleId:', articleId);
    
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
    } else {
      console.log('[HomeScreen] No article switch, skip scrolling');
    }
  }, [index, routes, sceneRefsMap]));

  const getFilteredArticles = useCallback((tabIndex: number) => {
    const route = routes[tabIndex];
    if (!route || route.key === 'all') return articles;
    return articles.filter(article => article.sourceName === route.title);
  }, [articles, routes]);

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
      }
      await loadArticles();
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [index, routes, syncAllSources, syncSource]);

  const handleIndexChange = useCallback((newIndex: number) => {
    setIndex(newIndex);
    setLoadedTabs(prev => new Set(prev).add(newIndex));
  }, []);

  const handleTabPress = useCallback((tabIndex: number) => {
    setIndex(tabIndex);
    setLoadedTabs(prev => new Set(prev).add(tabIndex));
    tabContentRef.current?.scrollToIndex(tabIndex);
  }, []);

  const renderScene = useCallback(({ route, index: tabIndex }: { route: { key: string; title: string }; index: number }) => {
    const isActive = loadedTabs.has(tabIndex);
    // 🌟 中間层优化：计算是否是主页灾邻页（预加载）
    const isCloseToFocus = Math.abs(index - tabIndex) <= 1;
    const isNeighbor = !isActive && isCloseToFocus; // 预加载标记
  
    if (!isActive && !isCloseToFocus) {
      return <View style={[styles.lazyPlaceholder, { width: screenWidth }]} />;
    }
  
    const filteredArticles = getFilteredArticles(tabIndex);
    const articleIds = filteredArticles.map(a => a.id);
      
    // 【修改】推送 isNeighbor 参数直接给 ArticleListScene
  
    return (
      <View style={{ width: screenWidth }}>
        <ArticleListScene
          ref={(ref: any) => {
            if (ref) sceneRefsMap.set(route.key, ref);
          }}
          sourceName={route.title}
          articles={filteredArticles}
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
        />
      </View>
    );
  }, [routes, loadedTabs, getFilteredArticles, isRefreshing, index, handleRefresh, isDark, theme, navigation, screenWidth]);

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
      fontSize: 16,
      fontWeight: '600',
      lineHeight: 22,
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      opacity: 0.6, // 已读文章稍微淡一点
    },
    articleTitleUnread: {
      fontWeight: '700',
      opacity: 1,
    },
    articleSubtitle: {
      fontSize: 14,
      lineHeight: 20,
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
      fontSize: 12,
      fontWeight: '500',
      color: theme?.colors?.primary || '#3B82F6',
      maxWidth: 100,
    },
    metaDivider: {
      fontSize: 12,
      color: theme?.colors?.outline || '#999',
      marginHorizontal: 6,
    },
    metaText: {
      fontSize: 12,
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
      fontSize: 16,
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
      fontSize: 14,
      fontWeight: '600',
      color: theme?.colors?.onPrimaryContainer,
    },
  });

export default HomeScreen;
