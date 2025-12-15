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
  Animated,
  ScrollView,
  LayoutChangeEvent,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { TabView } from 'react-native-tab-view';
import type { HomeStackScreenProps } from '../../navigation/types';
import { useThemeContext } from '../../theme';
import { useRSSSource } from '../../contexts/RSSSourceContext';
import { articleService, RSSService } from '../../services';
import type { Article } from '../../types';

type Props = HomeStackScreenProps<'HomeMain'>;

// 文章列表场景组件的 Props
interface ArticleListSceneProps {
  sourceName: string;
  articles: Article[];
  isRefreshing: boolean;
  onRefresh: () => void;
  onArticlePress: (articleId: number) => void;
  isDark: boolean;
  theme: any;
  isActive: boolean;
}

// 文章列表场景组件 - 使用 memo 优化性能
const ArticleListScene = memo(({ 
  sourceName, 
  articles, 
  isRefreshing, 
  onRefresh, 
  onArticlePress, 
  isDark, 
  theme,
  isActive 
}: ArticleListSceneProps) => {
  const styles = createStyles(isDark, theme);
  
  // 懒加载：如果不是当前激活的 Tab，返回空视图
  if (!isActive) {
    return <View style={styles.lazyPlaceholder} />;
  }

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
        <TouchableOpacity
          style={styles.articleItem}
          onPress={() => onArticlePress(item.id)}
        >
          <View style={styles.articleContent}>
            <View style={styles.titleContainer}>
              <Text style={styles.articleTitle}>
                {item.title}
              </Text>
              {!item.isRead && (
                <View style={styles.unreadDot} />
              )}
            </View>
            
            {item.titleCn && (
              <Text style={styles.articleSubtitle}>
                {item.titleCn}
              </Text>
            )}
            
            <View style={styles.articleMeta}>
              <Text style={styles.metaText}>{item.sourceName}</Text>
              <Text style={styles.metaText}>•</Text>
              <Text style={styles.metaText}>{item.wordCount || 0} 词</Text>
              <Text style={styles.metaText}>•</Text>
              <Text style={styles.metaText}>
                {item.publishedAt.toLocaleDateString('zh-CN', {
                  month: 'short',
                  day: 'numeric'
                })}
              </Text>
            </View>
          </View>
          
          {item.imageUrl && (
            <Image
              source={{ uri: item.imageUrl }}
              style={styles.articleImage}
              resizeMode="cover"
            />
          )}
        </TouchableOpacity>
      )}
      ListEmptyComponent={() => (
        <View style={styles.emptyContainer}>
          <MaterialIcons 
            name="article" 
            size={48} 
            color={isDark ? '#938F99' : '#79747E'} 
          />
          <Text style={styles.emptyText}>
            {sourceName === '全部' ? '暂无文章，下拉刷新获取最新内容' : `${sourceName} 暂无文章`}
          </Text>
        </View>
      )}
    />
  );
});

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, isDark } = useThemeContext();
  const { rssSources } = useRSSSource();
  const layout = useWindowDimensions();
  
  const [index, setIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadedTabs, setLoadedTabs] = useState<Set<number>>(new Set([0]));

  const styles = createStyles(isDark, theme);
  const rssService = RSSService.getInstance();
  
  // 标签栏滚动引用和标签位置记录
  const tabScrollRef = useRef<ScrollView>(null);
  const tabLayouts = useRef<{ x: number; width: number }[]>([]);
  const screenWidth = layout.width;

  // 动态生成 routes
  const routes = useMemo(() => {
    const baseRoutes = [{ key: 'all', title: '全部' }];
    const sourceRoutes = rssSources.map(source => ({
      key: `source-${source.id}`,
      title: source.name
    }));
    return [...baseRoutes, ...sourceRoutes];
  }, [rssSources]);

  // 根据当前 Tab 获取对应的源名称
  const getCurrentSourceName = useCallback((tabIndex: number) => {
    if (tabIndex === 0) return '全部';
    return rssSources[tabIndex - 1]?.name || '全部';
  }, [rssSources]);

  // 根据 Tab 索引过滤文章
  const getFilteredArticles = useCallback((tabIndex: number) => {
    if (tabIndex === 0) return articles;
    const sourceName = rssSources[tabIndex - 1]?.name;
    return articles.filter(article => article.sourceName === sourceName);
  }, [articles, rssSources]);

  // 加载文章数据
  const loadArticles = async () => {
    try {
      const allArticles = await articleService.getArticles({ limit: 500 });
      setArticles(allArticles);
    } catch (error) {
      console.error('Failed to load articles:', error);
    }
  };

  // 初始化加载
  useEffect(() => {
    loadArticles();
  }, []);
  
  // 屏幕获得焦点时刷新数据
  useFocusEffect(
    useCallback(() => {
      loadArticles();
    }, [])
  );

  // 滚动到指定标签
  const scrollToTab = useCallback((tabIndex: number) => {
    if (!tabScrollRef.current || !tabLayouts.current[tabIndex]) return;
    
    const tabLayout = tabLayouts.current[tabIndex];
    const padding = 12; // tabBarContent 的 paddingHorizontal
    const tabCenter = tabLayout.x + tabLayout.width / 2;
    const scrollOffset = Math.max(0, tabCenter - screenWidth / 2 + padding);
    
    tabScrollRef.current.scrollTo({
      x: scrollOffset,
      animated: true,
    });
  }, [screenWidth]);

  // 当 Tab 切换时，标记该 Tab 已加载，并自动滚动标签栏
  const handleIndexChange = useCallback((newIndex: number) => {
    setIndex(newIndex);
    setLoadedTabs(prev => new Set(prev).add(newIndex));
    
    // 自动滚动标签栏使当前标签可见
    scrollToTab(newIndex);
  }, [scrollToTab]);
  
  // 记录标签布局
  const handleTabLayout = useCallback((index: number, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    tabLayouts.current[index] = { x, width };
  }, []);

  // 自定义胶囊样式 TabBar - 平滑过渡动画
  const renderTabBar = useCallback((props: any) => {
    const { position, navigationState } = props;
    const currentIndex = navigationState.index;
    const routeCount = navigationState.routes.length;
    
    return (
      <View style={styles.tabBarContainer}>
        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
          bounces={false}
        >
          {navigationState.routes.map((route: any, i: number) => {
            // 判断是否为当前选中的标签
            const isActive = i === currentIndex;
            
            // 背景透明度动画 - 平滑过渡
            const bgOpacity = position.interpolate({
              inputRange: [i - 1, i, i + 1],
              outputRange: [0, 1, 0],
              extrapolate: 'clamp',
            });
            
            return (
              <TouchableOpacity
                key={route.key}
                style={styles.tabItem}
                onPress={() => handleIndexChange(i)}
                onLayout={(e) => handleTabLayout(i, e)}
                activeOpacity={0.7}
              >
                {/* 非活跃背景 - 灰色底色 */}
                <View style={styles.tabItemInactiveBg} />
                
                {/* 活跃背景 - 蓝色 */}
                {/* 使用 isActive 确保当前标签始终显示正确 */}
                {isActive ? (
                  <View style={styles.tabItemActiveBg} />
                ) : (
                  <Animated.View
                    style={[
                      styles.tabItemActiveBg,
                      { opacity: bgOpacity }
                    ]}
                  />
                )}
                
                {/* 文字层 */}
                <View style={styles.tabLabelContainer}>
                  {/* 非活跃文字 - 深色，始终显示 */}
                  <Text style={styles.tabLabelInactive}>
                    {route.title}
                  </Text>
                  {/* 活跃文字 - 白色，只在当前标签时显示 */}
                  {isActive && (
                    <Text style={styles.tabLabelActive}>
                      {route.title}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }, [isDark, theme, styles, handleIndexChange, handleTabLayout]);

  // 处理下拉刷新
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    const currentSourceName = getCurrentSourceName(index);

    try {
      let result;
      
      if (currentSourceName === '全部') {
        result = await rssService.refreshAllSourcesBackground({
          maxConcurrent: 3,
          onProgress: (current, total, sourceName) => {
            // 可以添加进度显示
          },
          onError: (error, sourceName) => {
            console.warn(`Failed to refresh ${sourceName}:`, error.message);
          },
          onArticlesReady: async (newArticles, sourceName) => {
            const updatedArticles = await articleService.getArticles({ limit: 500 });
            setArticles(updatedArticles);
          }
        });
      } else {
        const source = rssSources.find(s => s.name === currentSourceName);
        if (source) {
          const fetchedArticles = await rssService.fetchArticlesFromSource(source);
          result = {
            success: 1,
            failed: 0,
            totalArticles: fetchedArticles.length,
            errors: []
          };
          const updatedArticles = await articleService.getArticles({ limit: 500 });
          setArticles(updatedArticles);
        }
      }

      if (result && result.failed > 0) {
        Alert.alert(
          '刷新完成',
          `成功: ${result.success}个源, 失败: ${result.failed}个源\n新增文章: ${result.totalArticles}篇`,
          [{ text: '确定' }]
        );
      }
    } catch (error) {
      Alert.alert('刷新失败', error instanceof Error ? error.message : '未知错误');
    } finally {
      setIsRefreshing(false);
    }
  }, [index, rssSources, rssService, getCurrentSourceName]);

  const handleNavigateToArticle = (articleId: number) => {
    navigation.navigate('ArticleDetail', { articleId });
  };

  // 渲染每个 Tab 的场景
  const renderScene = useCallback(({ route }: { route: { key: string; title: string } }) => {
    const tabIndex = routes.findIndex(r => r.key === route.key);
    const isActive = loadedTabs.has(tabIndex);
    
    return (
      <ArticleListScene
        sourceName={route.title}
        articles={getFilteredArticles(tabIndex)}
        isRefreshing={isRefreshing && index === tabIndex}
        onRefresh={handleRefresh}
        onArticlePress={handleNavigateToArticle}
        isDark={isDark}
        theme={theme}
        isActive={isActive}
      />
    );
  }, [routes, loadedTabs, getFilteredArticles, isRefreshing, index, handleRefresh, isDark, theme]);

  return (
    <View style={styles.container}>
      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        onIndexChange={handleIndexChange}
        initialLayout={{ width: layout.width }}
        renderTabBar={renderTabBar}
        lazy
        lazyPreloadDistance={0}
      />
    </View>
  );
};

const createStyles = (isDark: boolean, theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
    },
    // TabBar 样式
    tabBarContainer: {
      backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
      paddingVertical: 3,  // 上下留白减少为 3px，上下对称
      // 添加阴影效果分离文章列表
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      zIndex: 10,
    },
    tabBarContent: {
      paddingHorizontal: 12,
      gap: 8,
      // 稍平衡预步推身的空间
      paddingVertical: 2,
    },
    tabItem: {
      position: 'relative',
      paddingHorizontal: 16,
      paddingVertical: 6,  // 上下留白渐递减少为 6px，上下对称
      borderRadius: 20,
      overflow: 'hidden',
    },
    tabItemInactiveBg: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F3F3F3'),
      borderRadius: 20,
    },
    tabItemActiveBg: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme?.colors?.primary || '#3B82F6',
      borderRadius: 20,
      zIndex: 1,
    },
    tabLabelContainer: {
      position: 'relative',
      zIndex: 2,
    },
    tabLabelInactive: {
      fontSize: 14,
      fontWeight: '500',
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
    },
    tabLabelActive: {
      position: 'absolute',
      top: 0,
      left: 0,
      fontSize: 14,
      fontWeight: '500',
      color: '#FFFFFF',
    },
    // 懒加载占位
    lazyPlaceholder: {
      flex: 1,
      backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
    },
    // 文章列表样式
    articleListContainer: {
      padding: 12,
      paddingTop: 6,
      gap: 8,
    },
    articleItem: {
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
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      marginBottom: 3,
      lineHeight: 24,
    },
    articleSubtitle: {
      fontSize: 15,
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