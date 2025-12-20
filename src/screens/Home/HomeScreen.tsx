import React, { useState, useCallback, useEffect, useMemo, memo, useRef } from 'react';
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
import { useReadingSettings } from '../../contexts/ReadingSettingsContext';
import type { Article } from '../../types';
import CustomTabBar from '../../components/CustomTabBar';
import CustomTabContent, { CustomTabContentHandle } from '../../components/CustomTabContent';
import { useSharedValue } from 'react-native-reanimated';

type Props = HomeStackScreenProps<'HomeMain'>;

// 【优化】提取单独的 ArticleItem 组件，性能更好且代码更清晰
const ArticleItem = memo(({ item, onPress, styles, isDark, theme }: any) => {
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
      {item.imageUrl && (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.articleImage}
          resizeMode="cover"
        />
      )}
    </TouchableOpacity>
  );
});

const ArticleListScene = memo(({
  sourceName,
  articles,
  isRefreshing,
  onRefresh,
  onArticlePress,
  isDark,
  theme,
  isActive
}: any) => {
  const styles = useMemo(() => createStyles(isDark, theme), [isDark, theme]);

  if (!isActive) return <View style={styles.lazyPlaceholder} />;

  return (
    <FlatList
      data={articles}
      keyExtractor={(item) => item.id.toString()}
      contentContainerStyle={styles.articleListContainer}
      showsVerticalScrollIndicator={false}
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
});

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, isDark } = useThemeContext();
  const { rssSources, syncAllSources, syncSource } = useRSSSource();
  const { settings } = useReadingSettings();
  const tabContentRef = useRef<CustomTabContentHandle>(null);
  const scrollX = useSharedValue(0);
  const { width: screenWidth } = useWindowDimensions();

  const [index, setIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadedTabs, setLoadedTabs] = useState<Set<number>>(new Set([0]));

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
      const allArticles = await articleService.getArticles({ limit: 500 });
      setArticles(allArticles);
    } catch (error) {
      console.error('Failed to load articles:', error);
    }
  };

  useEffect(() => { loadArticles(); }, []);
  useFocusEffect(useCallback(() => { loadArticles(); }, []));

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
    const isCloseToFocus = Math.abs(index - tabIndex) <= 1;

    if (!isActive && !isCloseToFocus) {
      return <View style={[styles.lazyPlaceholder, { width: screenWidth }]} />;
    }

    return (
      <View style={{ width: screenWidth }}>
        <ArticleListScene
          sourceName={route.title}
          articles={getFilteredArticles(tabIndex)}
          isRefreshing={isRefreshing && index === tabIndex}
          onRefresh={handleRefresh}
          onArticlePress={(id: number) => navigation.navigate('ArticleDetail', { articleId: id })}
          isDark={isDark}
          theme={theme}
          isActive={true}
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
      paddingHorizontal: 16,
      paddingVertical: 12,
      paddingBottom: 40, // 底部留白
    },
    // 文章卡片样式优化
    articleItem: {
      backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
      borderRadius: 16,
      padding: 16,
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
      marginRight: 8,
    },
    articleTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      lineHeight: 22,
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      opacity: 0.9, // 已读文章稍微淡一点
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
