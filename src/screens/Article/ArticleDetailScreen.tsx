import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
import { Article, WordDefinition } from '../../types';
import { articleService } from '../../services/ArticleService';
import { dictionaryService } from '../../services/DictionaryService';
import { vocabularyService } from '../../services/VocabularyService';
import { translationService } from '../../services/TranslationService';
import type { RootStackParamList } from '../../navigation/types';
// 引入HTML渲染组件
import RenderHtml from 'react-native-render-html';
// 引入expo-image组件用于优化图片显示
import { Image } from 'expo-image';
// 引入自定义组件
import WordTappableText from '../../components/WordTappableText';
import WordDefinitionModal from '../../components/WordDefinitionModal';
import SentenceTranslationModal from '../../components/SentenceTranslationModal';
import VideoPlayer from '../../components/VideoPlayer';

type ArticleDetailRouteProp = RouteProp<RootStackParamList, 'ArticleDetail'>;

const { width: screenWidth } = Dimensions.get('window');

// 独立的图片渲染组件，用于处理动态尺寸和异步加载
interface RenderedImageProps {
  src: string;
  maxWidth: number;
  theme: any;
  isDark: boolean;
  priority?: 'low' | 'normal' | 'high';
}

const RenderedImage = ({ src, maxWidth, theme, isDark, priority = 'normal' }: RenderedImageProps) => {
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // 计算显示尺寸：宽度固定，高度等比例缩放
  const displayWidth = maxWidth;
  const displayHeight = imageSize 
    ? (imageSize.height / imageSize.width) * displayWidth
    : 200; // 默认占位高度

  if (hasError) {
    return null;
  }

  return (
    <View
      style={{
        marginVertical: 8,
        width: displayWidth,
        height: isLoaded ? displayHeight : 200,
        borderRadius: 12,
        overflow: 'hidden',
        alignSelf: 'center',
        backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#E6E0E9'),
      }}
    >
      <Image
        source={{ uri: src }}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        transition={200}
        cachePolicy="memory-disk"
        priority={priority}
        recyclingKey={src}
        placeholderContentFit="cover"
        onLoad={(e) => {
          const { width, height } = e.source;
          if (width > 0 && height > 0) {
            setImageSize({ width, height });
          }
          setIsLoaded(true);
        }}
        onError={() => {
          setHasError(true);
          setIsLoaded(true);
        }}
      />
      {!isLoaded && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <ActivityIndicator size="small" color={theme?.colors?.primary} />
        </View>
      )}
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
  const [enableWordTapping, setEnableWordTapping] = useState(false); // 延迟启用取词
  const [vocabularyWords, setVocabularyWords] = useState<Set<string>>(new Set()); // 单词本单词
  
  // 词典查询状态
  const [showDictModal, setShowDictModal] = useState(false);
  const [selectedWord, setSelectedWord] = useState('');
  const [wordDefinition, setWordDefinition] = useState<WordDefinition | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  
  // 翻译状态
  const [showTransModal, setShowTransModal] = useState(false);
  const [selectedSentence, setSelectedSentence] = useState('');
  const [translation, setTranslation] = useState<string | null>(null);
  const [transLoading, setTransLoading] = useState(false);

  const styles = createStyles(isDark, theme, readingSettings);

  useEffect(() => {
    const loadArticle = async () => {
      try {
        setLoading(true);
        setEnableWordTapping(false); // 重置取词状态
        const articleData = await articleService.getArticleById(articleId);
        setArticle(articleData);
        
        // 加载单词本中的所有单词（仅有单词本）
        try {
          const vocabularyEntries = await vocabularyService.getAllWords({ limit: 10000 });
          const wordSet = new Set<string>(vocabularyEntries.map(entry => entry.word.toLowerCase()));
          setVocabularyWords(wordSet);
        } catch (error) {
          console.error('Failed to load vocabulary words:', error);
          setVocabularyWords(new Set());
        }
        
        // 自动标记为已读
        if (articleData && !articleData.isRead) {
          articleService.markAsRead(articleId);
        }
        
        // 延迟500ms后启用取词功能，让文章先渲染出来
        setTimeout(() => {
          setEnableWordTapping(true);
        }, 500);
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

  /**
   * 处理单词点击 - 查词典
   */
  const handleWordPress = async (word: string, sentence: string) => {
    setSelectedWord(word);
    setShowDictModal(true);
    setDictLoading(true);
    setWordDefinition(null);
    
    try {
      const definition = await dictionaryService.lookupWord(word, sentence);
      setWordDefinition(definition);
    } catch (error) {
      console.error('Failed to lookup word:', error);
    } finally {
      setDictLoading(false);
    }
  };

  /**
   * 处理双击 - 翻译整句
   */
  const handleSentenceDoubleTap = async (sentence: string) => {
    setSelectedSentence(sentence);
    setShowTransModal(true);
    setTransLoading(true);
    setTranslation(null);
    
    try {
      const result = await translationService.translateSentence(sentence);
      setTranslation(result);
    } catch (error) {
      console.error('Failed to translate sentence:', error);
    } finally {
      setTransLoading(false);
    }
  };

  /**
   * 添加到单词本
   */
  const handleAddToVocabulary = async () => {
    if (!selectedWord || !wordDefinition) {
      setShowDictModal(false);
      return;
    }
    
    try {
      // 获取包含该单词的句子作为上下文
      const sentences = article?.content?.split(/[.!?]+/) || [];
      let context = '';
      for (const sentence of sentences) {
        if (sentence.toLowerCase().includes(selectedWord.toLowerCase())) {
          context = sentence.trim();
          break;
        }
      }
      
      // 添加到单词本
      await vocabularyService.addWord(
        selectedWord,
        context,
        articleId,
        wordDefinition
      );
      
      // 更新高亮单词集合
      setVocabularyWords(prev => {
        const newSet = new Set<string>(Array.from(prev));
        newSet.add(selectedWord.toLowerCase());
        return newSet;
      });
      
      setShowDictModal(false);
    } catch (error) {
      console.error('Failed to add word to vocabulary:', error);
      setShowDictModal(false);
    }
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

  // 处理HTML内容 - 必须在条件返回之前
  const processHtmlContent = useCallback((html: string): string => {
    // 移除链接标签（保留内容）
    let processed = html.replace(/<a\s+[^>]*href=["'][^"']*["'][^>]*>(.*?)<\/a>/gi, '$1');
    // 为段落添加首行缩进
    processed = processed.replace(/<p([^>]*)>/gi, '<p$1>\u3000\u3000');
    return processed;
  }, []);

  // 缓存处理后的HTML内容和分割结果
  const processedParts = useMemo(() => {
    if (!article?.content) return [];
    const processed = processHtmlContent(article.content);
    // 同时匹配 img 和 video 标签
    return processed.split(/(<img[^>]*>|<video[^>]*>.*?<\/video>)/gi);
  }, [article?.content, processHtmlContent]);

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
    // 自定义图片渲染器 - 使用 RenderedImage 组件实现等比例缩放
    img: (props: any) => {
      const { src } = props.tnode.attributes || {};
      if (!src) return null;
      
      let imageUrl = src;
      try {
        imageUrl = decodeURIComponent(src);
      } catch (e) {
        imageUrl = src;
      }
      
      const maxWidth = screenWidth - 32;
      
      return (
        <RenderedImage
          key={imageUrl}
          src={imageUrl}
          maxWidth={maxWidth}
          theme={theme}
          isDark={isDark}
        />
      );
    },
    // 自定义文本渲染器 - 支持单词点击
    p: (props: any) => {
      // 获取段落的所有文本内容，包括嵌套的文本节点
      const extractText = (node: any): string => {
        if (node.type === 'text') {
          return node.data;
        }
        if (node.children && node.children.length > 0) {
          return node.children.map((child: any) => extractText(child)).join('');
        }
        return '';
      };
      
      const textContent = props.tnode.children
        .map((child: any) => extractText(child))
        .join('');
      
      if (textContent.trim()) {
        return (
          <WordTappableText
            text={textContent}
            style={{
              marginBottom: 4,
              marginTop: 0,
              textAlign: 'left' as const,
              fontSize: readingSettings?.fontSize || 16,
              lineHeight: (readingSettings?.lineHeight || 1.5) * (readingSettings?.fontSize || 16),
              color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'),
            }}
            onWordPress={handleWordPress}
            onSentenceDoubleTap={handleSentenceDoubleTap}
            enableTapping={enableWordTapping}
            highlightedWords={vocabularyWords}
          />
        );
      }
      return null;
    },
  };

  // 手动解析和渲染HTML内容
  const renderContent = () => {
    if (!processedParts.length) return null;
    
    const maxWidth = screenWidth - 32;
    
    return processedParts.map((part: string, index: number) => {
      // 如果是视频标签
      if (part.match(/^<video[^>]*>/i)) {
        const srcMatch = part.match(/src=["']([^"']+)["']|<source[^>]*src=["']([^"']+)["'][^>]*>/i);
        const src = srcMatch?.[1] || srcMatch?.[2];
        
        if (src) {
          return <VideoPlayer key={index} src={src} maxWidth={maxWidth} />;
        }
        return null;
      }
      
      // 如果是图片标签，使用 RenderedImage 组件等比例缩放，根据位置设置优先级
      if (part.match(/^<img[^>]*>$/i)) {
        const srcMatch = part.match(/src=["']([^"']+)["']/i);
        const src = srcMatch?.[1];
        
        if (src) {
          // 前3张图片高优先级，其他低优先级
          const imgPriority = index < 6 ? 'high' : 'low';
          return (
            <RenderedImage
              key={index}
              src={src}
              maxWidth={maxWidth}
              theme={theme}
              isDark={isDark}
              priority={imgPriority}
            />
          );
        }
        return null;
      }
      
      // 如果是HTML段落，使用RenderHtml渲染
      if (part.trim()) {
        return (
          <RenderHtml
            key={index}
            contentWidth={maxWidth}
            source={{ html: part }}
            tagsStyles={htmlStyles}
            baseStyle={{
              ...getTextStyles(),
              fontSize: readingSettings?.fontSize || 16,
              lineHeight: (readingSettings?.lineHeight || 1.5) * (readingSettings?.fontSize || 16),
              color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'),
            }}
            renderers={{ p: customRenderers.p }}
            defaultTextProps={{
              selectable: true,
            }}
          />
        );
      }
      
      return null;
    });
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
        
        {shouldShowHeaderImage() && article?.imageUrl && (
          <RenderedImage
            src={article.imageUrl}
            maxWidth={screenWidth - 32}
            theme={theme}
            isDark={isDark}
          />
        )}
        
        <View style={styles.divider} />

        <View style={styles.contentContainer}>
          {/* 直接手动渲染图片和文本 */}
          {renderContent()}
        </View>
      </View>
      
      {/* 词典弹窗 */}
      <WordDefinitionModal
        visible={showDictModal}
        word={selectedWord}
        definition={wordDefinition}
        loading={dictLoading}
        onClose={() => setShowDictModal(false)}
        onAddToVocabulary={handleAddToVocabulary}
      />
      
      {/* 翻译弹窗 */}
      <SentenceTranslationModal
        visible={showTransModal}
        originalText={selectedSentence}
        translatedText={translation}
        loading={transLoading}
        onClose={() => setShowTransModal(false)}
      />
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