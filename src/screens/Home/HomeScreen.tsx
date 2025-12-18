import React, { useState, useCallback, useEffect, useMemo, memo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  Image,
  useWindowDimensions,
  TouchableOpacity,
  Animated, // 【新增】引入 Animated
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { TabView, TabBar } from 'react-native-tab-view';
import type { HomeStackScreenProps } from '../../navigation/types';
import { useThemeContext } from '../../theme';
import { useRSSSource } from '../../contexts/RSSSourceContext';
import { articleService, RSSService } from '../../services';
import { useReadingSettings } from '../../contexts/ReadingSettingsContext'; // 更改引用路径
import type { Article } from '../../types';
import CustomTabBar from '../../components/CustomTabBar';
import CustomTabContent, { CustomTabContentHandle } from '../../components/CustomTabContent'; // 导入 Handle 类型
import { useSharedValue } from 'react-native-reanimated';

type Props = HomeStackScreenProps<'HomeMain'>;

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
  // 【修复】使用 useMemo 确保样式在主题变化时重新计算
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
          title={sourceName === '全部' ? '下拉刷新所有文章' : `下拉刷新${sourceName}`}
          titleColor={isDark ? '#938F99' : '#79747E'}
          tintColor={theme?.colors?.primary || '#3B82F6'}
        />
      }
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.articleItem} onPress={() => onArticlePress(item.id)}>
          <View style={styles.articleContent}>
            <View style={styles.titleContainer}>
              <Text style={styles.articleTitle}>{item.title}</Text>
              {!item.isRead && <View style={styles.unreadDot} />}
            </View>
            {item.titleCn && <Text style={styles.articleSubtitle}>{item.titleCn}</Text>}
            <View style={styles.articleMeta}>
              <Text style={styles.metaText}>{item.sourceName}</Text>
              <Text style={styles.metaText}>•</Text>
              <Text style={styles.metaText}>{item.wordCount || 0} 词</Text>
              <Text style={styles.metaText}>•</Text>
              <Text style={styles.metaText}>
                {new Date(item.publishedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
          </View>
          {item.imageUrl && <Image source={{ uri: item.imageUrl }} style={styles.articleImage} resizeMode="cover" />}
        </TouchableOpacity>
      )}
      ListEmptyComponent={() => (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="article" size={48} color={isDark ? '#938F99' : '#79747E'} />
          <Text style={styles.emptyText}>{sourceName === '全部' ? '暂无文章' : `${sourceName} 暂无文章`}</Text>
        </View>
      )}
    />
  );
});
const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, isDark } = useThemeContext();
  const { rssSources } = useRSSSource();
  const { settings } = useReadingSettings(); // 获取设置
  const tabContentRef = useRef<CustomTabContentHandle>(null); // 创建 ref
  // 滑动进度跟踪 (Reanimated SharedValue)
  const scrollX = useSharedValue(0);
  const { width: screenWidth } = useWindowDimensions();

  const layout = useWindowDimensions();

  const [index, setIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadedTabs, setLoadedTabs] = useState<Set<number>>(new Set([0]));

  const styles = createStyles(isDark, theme);
  const rssService = RSSService.getInstance();

  const routes = useMemo(() => {
    let baseRoutes = [{ key: 'all', title: '全部' }];

    // 根据设置过滤"全部"标签
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

  const getCurrentSourceName = useCallback((tabIndex: number) => {
    const route = routes[tabIndex];
    if (!route) return '全部';
    if (route.key === 'all') return '全部';
    return route.title;
  }, [routes]);

  const getFilteredArticles = useCallback((tabIndex: number) => {
    const route = routes[tabIndex];
    if (!route || route.key === 'all') return articles;
    return articles.filter(article => article.sourceName === route.title);
  }, [articles, routes]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setTimeout(() => {
      loadArticles();
      setIsRefreshing(false);
    }, 1000);
  }, [index, rssSources]);

  const handleIndexChange = useCallback((newIndex: number) => {
    setIndex(newIndex);
    setLoadedTabs(prev => new Set(prev).add(newIndex));
  }, []);

  // 标签点击处理
  const handleTabPress = useCallback((tabIndex: number) => {
    setIndex(tabIndex);
    setLoadedTabs(prev => new Set(prev).add(tabIndex));
    // 主动触发内容滚动
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
      {/* 自定义 Tab Bar */}
      <CustomTabBar
        tabs={routes}
        scrollX={scrollX}
        screenWidth={screenWidth}
        activeIndex={index}
        onTabPress={handleTabPress}
      />

      {/* 自定义内容区域 */}
      <CustomTabContent
        ref={tabContentRef} // 绑定 ref
        tabs={routes}
        renderScene={renderScene}
        scrollX={scrollX}
        onIndexChange={handleIndexChange}
        initialIndex={0}
      />
    </View>
  );
};

const createStyles = (isDark: boolean, theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      // 【修复】背景颜色一定要针对不同主题
      backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
    },
    // 【清理】移除不再使用的 TabBar 样式
    lazyPlaceholder: {
      flex: 1,
      backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
    },
    articleListContainer: {
      padding: 12,
      paddingTop: 6,
      gap: 8,
    },
    articleItem: {
      // 【关键】谐纲颜色：深色背景下永远是深灰色，不能是纴黑色
      backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
      borderRadius: 12,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    titleContainer: {
      position: 'relative',
      marginBottom: 4,
    },
    unreadDot: {
      position: 'absolute',
      left: -8,
      top: -8,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#22C55E',
    },
    articleImage: {
      width: 56,
      height: 56,
      borderRadius: 6,
      backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#E6E0E9'),
    },
    articleContent: {
      flex: 1,
    },
    articleTitle: {
      fontSize: 17,
      fontWeight: '600',
      // 【关键】文字颜色一定要是浅色不是深色
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      marginBottom: 3,
      lineHeight: 24,
    },
    articleSubtitle: {
      fontSize: 15,
      // 副标题也是浅色文字
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
      marginBottom: 6,
      lineHeight: 22,
      fontStyle: 'italic',
    },
    articleMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 2,
    },
    metaText: {
      fontSize: 13,
      // 气数信息也是浅灰色
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 64,
    },
    emptyText: {
      fontSize: 16,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
      textAlign: 'center',
      marginTop: 16,
    },
  });

export default HomeScreen;
