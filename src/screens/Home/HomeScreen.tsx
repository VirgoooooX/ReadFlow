import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { HomeStackScreenProps } from '../../navigation/types';
import { useThemeContext } from '../../theme';
import { useRSSSource } from '../../contexts/RSSSourceContext';
import { articleService, DatabaseService, RSSService } from '../../services';
import type { Article, RSSSource } from '../../types';

type Props = HomeStackScreenProps<'HomeMain'>;

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, isDark } = useThemeContext();
  const { rssSources } = useRSSSource();
  const [selectedSource, setSelectedSource] = useState('全部');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [articles, setArticles] = useState<Article[]>([]);
  const [refreshProgress, setRefreshProgress] = useState({ current: 0, total: 0, sourceName: '' });

  const styles = createStyles(isDark, theme);
  const rssService = RSSService.getInstance();

  // 获取RSS源列表（包含"全部"选项）
  const sourceOptions = ['全部', ...rssSources.map(source => source.name)];
  
  // 根据选中的订阅源过滤文章
  const filteredArticles = selectedSource === '全部' 
    ? articles 
    : articles.filter(article => {
        // 通过sourceName匹配，因为Article接口中有sourceName字段
        return article.sourceName === selectedSource;
      });





  // 初始化加载数据
  useEffect(() => {
    loadInitialData();
  }, []);
  
  // 屏幕获得焦点时刷新数据（显示最新的已读/未读状态）
  useFocusEffect(
    useCallback(() => {
      loadInitialData();
    }, [])
  );

  const loadInitialData = async () => {
    try {
      const allArticles = await articleService.getArticles({ limit: 500 });
      setArticles(allArticles);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  // 处理下拉刷新
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshProgress({ current: 0, total: 0, sourceName: '' });

    try {
      let result;
      
      if (selectedSource === '全部') {
        // 使用后台刷新所有活跃的RSS源
        result = await rssService.refreshAllSourcesBackground({
          maxConcurrent: 3,
          onProgress: (current, total, sourceName) => {
            setRefreshProgress({ current, total, sourceName });
          },
          onError: (error, sourceName) => {
            console.warn(`Failed to refresh ${sourceName}:`, error.message);
          },
          onArticlesReady: async (newArticles, sourceName) => {
            // 立即更新文章列表，展示已获取的内容
            const updatedArticles = await articleService.getArticles({ limit: 500 });
            setArticles(updatedArticles);
            console.log(`${sourceName} 的文章已更新，共 ${newArticles.length} 篇`);
          }
        });
      } else {
        // 刷新特定RSS源
        const source = rssSources.find(s => s.name === selectedSource);
        if (source) {
          const articles = await rssService.fetchArticlesFromSource(source);
          result = {
            success: 1,
            failed: 0,
            totalArticles: articles.length,
            errors: []
          };
          // 刷新完成后重新加载文章数据
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
      setRefreshProgress({ current: 0, total: 0, sourceName: '' });
    }
  }, [selectedSource, rssSources, rssService]);

  const handleNavigateToSearch = () => {
    navigation.navigate('Search', { query: '' });
  };

  const handleNavigateToArticle = (articleId: number) => {
    navigation.navigate('ArticleDetail', { articleId });
  };

  return (
    <View style={styles.container}>
      {/* 订阅源标签 */}
      <View style={styles.sourceTabsContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sourceTabsContent}
        >
          {sourceOptions.map((source) => (
            <TouchableOpacity
              key={source}
              style={[
                styles.sourceTab,
                selectedSource === source && styles.sourceTabActive
              ]}
              onPress={() => setSelectedSource(source)}
            >
              <Text style={[
                styles.sourceTabText,
                selectedSource === source && styles.sourceTabTextActive
              ]}>
                {source}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>



      {/* 文章列表 */}
      <FlatList
        data={filteredArticles}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.articleListContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            title={selectedSource === '全部' ? '下拉刷新所有文章' : `下拉刷新${selectedSource}`}
            titleColor={isDark ? '#938F99' : '#79747E'}
            tintColor={theme?.colors?.primary || '#3B82F6'}
          />
        }
        renderItem={({ item }) => (
           <TouchableOpacity
             style={styles.articleItem}
             onPress={() => handleNavigateToArticle(item.id)}
           >
             <View style={styles.articleContent}>
               {/* 标题容器 - 用于相对定位未读点 */}
               <View style={styles.titleContainer}>
                 {/* 英文原标题 */}
                 <Text style={styles.articleTitle}>
                   {item.title}
                 </Text>
                 
                 {/* 未读标记 - 小绿点 */}
                 {!item.isRead && (
                   <View style={styles.unreadDot} />
                 )}
               </View>
               
               {/* 中文翻译标题 */}
               {item.titleCn && (
                 <Text style={styles.articleSubtitle}>
                   {item.titleCn}
                 </Text>
               )}
               
               {/* 文章元信息 */}
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
             
             {/* 文章缩略图 */}
             {item.imageUrl && (
               <Image
                 source={{ uri: item.imageUrl }}
                 style={styles.articleImage}
                 resizeMode="cover" // 使用cover模式裁剪图片以填充正方形区域
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
              {selectedSource === '全部' ? '暂无文章，下拉刷新获取最新内容' : `${selectedSource} 暂无文章`}
            </Text>
          </View>
        )}
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
    sourceTabsContainer: {
      paddingVertical: 4,
      marginBottom: 0, // 确保标签栏容器没有底部外边距
    },
    sourceTabsContent: {
      paddingHorizontal: 16,
      gap: 2,
    },

    sourceTab: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
      marginRight: 4,
    },
    sourceTabActive: {
      backgroundColor: theme?.colors?.primary || '#3B82F6',
    },
    sourceTabText: {
      fontSize: 14,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
      fontWeight: '500',
    },
    sourceTabTextActive: {
      color: theme?.colors?.onPrimary || '#FFFFFF',
    },
    articleListContainer: {
      padding: 16,
      paddingTop: 0, // 移除顶部内边距，使第一条文章直接靠在标签栏下方
      gap: 12,
    },
    articleItem: {
      backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
      borderRadius: 12,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 0, // 确保文章项没有顶部外边距
    },
    titleContainer: {
      position: 'relative',
      marginBottom: 6,
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
      width: 60,
      height: 60,
      borderRadius: 6,
      backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#E6E0E9'),
      resizeMode: 'cover', // 使用cover模式裁剪图片以填充正方形区域
    },
    articleContent: {
      flex: 1,
    },
    articleTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      marginBottom: 6,
      lineHeight: 24,
    },
    articleSubtitle: {
      fontSize: 15,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
      marginBottom: 10,
      lineHeight: 22,
      fontStyle: 'italic',
    },
    articleMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
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