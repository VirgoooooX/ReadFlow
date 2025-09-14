import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useThemeContext } from '../../theme';
import { useReadingSettings } from '../../hooks/useReadingSettings';
import { Article } from '../../types';
import { articleService } from '../../services/ArticleService';
import type { RootStackParamList } from '../../navigation/types';
// 引入HTML渲染组件
import RenderHtml from 'react-native-render-html';
// 引入expo-image组件用于优化图片显示
import { Image } from 'expo-image';

type ArticleDetailRouteProp = RouteProp<RootStackParamList, 'ArticleDetail'>;

const { width: screenWidth } = Dimensions.get('window');

// 独立的图片渲染组件，用于处理动态尺寸和异步加载
const RenderedImage = ({ src, maxWidth, theme, isDark }) => {
  // 默认宽高比为16:9，直到图片加载完成
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const [isLoaded, setIsLoaded] = useState(false);

  const displayWidth = maxWidth;
  // 在图片加载前使用固定的200px高度，加载后根据真实宽高比计算高度
  const displayHeight = isLoaded ? displayWidth / aspectRatio : 200;

  return (
    <View
      style={{
        marginVertical: 2, // 再次尝试直接控制组件间距
        width: displayWidth,
        height: displayHeight,
        borderRadius: 12,
        overflow: 'hidden',
        alignSelf: 'center',
        backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#E6E0E9'),
      }}
    >
      <Image
        source={{ uri: src }}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover" // 使用cover模式，因为容器已经有了正确的宽高比
        transition={300}
        onLoad={(e) => {
          const { width, height } = e.source;
          // 确保宽度和高度有效，避免除以零
          if (width > 0 && height > 0) {
            setAspectRatio(width / height);
          }
          setIsLoaded(true);
        }}
        onError={(error) => {
          console.log('Image load error:', error);
          // 如果图片加载失败，保持占位符尺寸
          setIsLoaded(true);
        }}
      />
    </View>
  );
};

const ArticleDetailScreen: React.FC = () => {
  const route = useRoute<ArticleDetailRouteProp>();
  const { articleId } = route.params;
  const { theme, isDark } = useThemeContext();
  const { 
    settings: readingSettings, 
    loading: settingsLoading,
    getTextStyles,
    getTitleStyles,
    getSubtitleStyles,
    getContainerStyles 
  } = useReadingSettings();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  const styles = createStyles(isDark, theme, readingSettings);

  useEffect(() => {
    const loadArticle = async () => {
      try {
        setLoading(true);
        const articleData = await articleService.getArticleById(articleId);
        setArticle(articleData);
      } catch (error) {
        console.error('Failed to load article:', error);
        setArticle(null);
      } finally {
        setLoading(false);
      }
    };

    loadArticle();
  }, [articleId]);

  const formatDate = (date: Date | string): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (!dateObj || isNaN(dateObj.getTime())) {
      return '未知日期';
    }
    return dateObj.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // 检查文章正文是否包含与缩略图相同的图片
  const shouldShowHeaderImage = (): boolean => {
    if (!article?.imageUrl) {
      return false;
    }
    
    const imgRegex = /<img[^>]*src=["']([^"']*)["'][^>]*>/gi;
    const contentImages = article.content.match(imgRegex);
    if (!contentImages || contentImages.length === 0) {
      return true;
    }
    
    const thumbnailUrl = article.imageUrl;
    for (const imgTag of contentImages) {
      const srcMatch = imgTag.match(/src=["']([^"']*)["']/i);
      if (srcMatch && srcMatch[1]) {
        try {
          const contentImageUrl = decodeURIComponent(srcMatch[1]);
          const thumbnailImageUrl = decodeURIComponent(thumbnailUrl);
          
          if (contentImageUrl === thumbnailImageUrl || 
              contentImageUrl.includes(thumbnailImageUrl) || 
              thumbnailImageUrl.includes(contentImageUrl)) {
            return false;
          }
        } catch (e) {
          if (srcMatch[1] === thumbnailUrl) {
            return false;
          }
        }
      }
    }
    
    return true;
  };

  if (loading || settingsLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator 
          size="large" 
          color={theme?.colors?.primary || '#3B82F6'} 
        />
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  if (!article) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>文章加载失败</Text>
      </View>
    );
  }

  // HTML渲染配置
  const htmlStyles = {
    body: {
      ...getTextStyles(),
      fontSize: readingSettings?.fontSize || 16,
      lineHeight: (readingSettings?.lineHeight || 1.5) * (readingSettings?.fontSize || 16),
      color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'),
    },
    p: {
      marginBottom: 4,
      marginTop: 0,
      textAlign: 'left' as const,
      textIndent: 24,
    },
    h1: { fontSize: 24, fontWeight: 'bold' as const, marginVertical: 8 },
    h2: { fontSize: 22, fontWeight: 'bold' as const, marginVertical: 6 },
    h3: { fontSize: 20, fontWeight: 'bold' as const, marginVertical: 4 },
    h4: { fontSize: 18, fontWeight: 'bold' as const, marginVertical: 3 },
    h5: { fontSize: 16, fontWeight: 'bold' as const, marginVertical: 2 },
    h6: { fontSize: 14, fontWeight: 'bold' as const, marginVertical: 1 },
    a: {
      color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'),
      textDecorationLine: 'none' as const,
    },
    ul: { marginVertical: 4, marginTop: 2, marginBottom: 2, paddingLeft: 16 },
    ol: { marginVertical: 4, marginTop: 2, marginBottom: 2, paddingLeft: 16 },
    li: { marginVertical: 1, marginTop: 0, marginBottom: 0 },
    img: {
      marginTop: 4,
      marginBottom: 4,
    },
  };

  const renderersProps = {
    img: {
      enableExperimentalPercentWidth: true,
    },
  };

  const customRenderers = {
    img: (imgProps: any) => {
      const { src } = imgProps.tnode.attributes;
      let imageUrl = src;
      try {
        imageUrl = decodeURIComponent(src);
      } catch (e) {
        imageUrl = src;
      }
      const maxWidth = screenWidth - 32;
      return (
        <RenderedImage
          src={imageUrl}
          maxWidth={maxWidth}
          theme={theme}
          isDark={isDark}
        />
      );
    }
  };

  const processHtmlContent = (html: string): string => {
    return html.replace(/<a\s+[^>]*href=["'][^"']*["'][^>]*>(.*?)<\/a>/gi, '$1');
  };

  return (
    <ScrollView style={[styles.container, readingSettings && { backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE') }]} showsVerticalScrollIndicator={false}>
      <View style={[styles.content, getContainerStyles()]}>
        <View style={styles.titleContainer}>
          <Text style={[styles.articleTitle, getTitleStyles(1.3)]}>
            {article.title}
          </Text>
          <TouchableOpacity style={styles.favoriteButton}>
            <MaterialIcons name="bookmark-border" size={24} color={theme?.colors?.primary || '#3B82F6'} />
          </TouchableOpacity>
        </View>
        
        {article.titleCn && (
          <Text style={[styles.articleSubtitle, getSubtitleStyles()]}>
            {article.titleCn}
          </Text>
        )}
        
        <View style={styles.articleMeta}>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{article.sourceName}</Text>
            <Text style={styles.metaText}>•</Text>
            <Text style={styles.metaText}>{article.wordCount || 0} 词</Text>
            <Text style={styles.metaText}>•</Text>
            <Text style={styles.metaText}>{formatDate(article.publishedAt)}</Text>
            {article.author && (
              <>
                <Text style={styles.metaText}>•</Text>
                <Text style={styles.metaText}>作者：{article.author}</Text>
              </>
            )}
          </View>
        </View>
        
        {shouldShowHeaderImage() && (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: article.imageUrl }}
              style={styles.articleImage}
              contentFit="cover"
              transition={200}
            />
          </View>
        )}
        
        <View style={styles.divider} />

        <View style={styles.contentContainer}>
          <RenderHtml
            contentWidth={screenWidth - 32}
            source={{ html: processHtmlContent(article.content) }}
            tagsStyles={htmlStyles}
            baseStyle={{
              ...getTextStyles(),
              fontSize: readingSettings?.fontSize || 16,
              lineHeight: (readingSettings?.lineHeight || 1.5) * (readingSettings?.fontSize || 16),
              color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'),
            }}
            renderers={customRenderers}
            renderersProps={renderersProps}
            ignoredDomTags={['core-commerce']}
            defaultTextProps={{
              selectable: true,
            }}
          />
        </View>
      </View>
    </ScrollView>
  );
};

const createStyles = (isDark: boolean, theme: any, readingSettings?: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'), },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'), },
    loadingText: { marginTop: 8, fontSize: 16, color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'), },
    errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'), padding: 16, },
    errorText: { fontSize: 15, color: theme?.colors?.error || '#B3261E', textAlign: 'center', paddingHorizontal: 16, },
    content: { padding: 16, backgroundColor: readingSettings?.backgroundColor || (isDark ? '#1C1B1F' : '#FFFBFE'), borderRadius: 12, },
    titleContainer: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, },
    articleTitle: { fontSize: 18, fontWeight: '600', color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'), lineHeight: 24, letterSpacing: -0.1, flex: 1, marginRight: 12, },
    favoriteButton: { padding: 4, borderRadius: 20, backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'), },
    articleSubtitle: { fontSize: 16, color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'), marginBottom: 16, fontStyle: 'italic', opacity: 0.85, lineHeight: 22, },
    articleMeta: { marginBottom: 20, gap: 6, },
    metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, },
    metaText: { fontSize: 13, color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'), lineHeight: 18, },
    imageContainer: { marginBottom: 4, marginTop: 4, borderRadius: 12, overflow: 'hidden', borderWidth: 0, shadowColor: '#000', shadowOffset: { width: 0, height: 2, }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, },
    articleImage: { width: '100%', height: Math.min(screenWidth * 0.6, 300), backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#E6E0E9'), },
    divider: { height: 1, backgroundColor: theme?.colors?.outlineVariant || (isDark ? '#49454F' : '#E6E0E9'), marginBottom: 24, },
    contentContainer: {},
  });

export default ArticleDetailScreen;