import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  TouchableOpacity,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
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
  const [isFavorite, setIsFavorite] = useState(false); // 收藏状态
  
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
        setIsFavorite(articleData?.isFavorite || false); // 设置收藏状态
        
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
   * 处理收藏/取消收藏
   */
  const handleToggleFavorite = async () => {
    try {
      const newFavoriteStatus = await articleService.toggleFavorite(articleId);
      setIsFavorite(newFavoriteStatus);
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  /**
   * 复制标题到剪贴板
   */
  const handleCopyTitle = async () => {
    if (!article) return;
    try {
      await Clipboard.setStringAsync(article.title);
      Alert.alert('复制成功', '标题已复制到剪贴板');
    } catch (error) {
      Alert.alert('复制失败', '无法复制标题');
    }
  };

  /**
   * 复制全文到剪贴板
   */
  const handleCopyContent = async () => {
    if (!article) return;
    try {
      // 清除HTML标签，只复制纯文本
      const plainText = article.content
        .replace(/<[^>]+>/g, '') // 移除HTML标签
        .replace(/&nbsp;/g, ' ') // 替换&nbsp;
        .replace(/&amp;/g, '&') // 替换&amp;
        .replace(/&lt;/g, '<') // 替换&lt;
        .replace(/&gt;/g, '>') // 替换&gt;
        .replace(/&quot;/g, '\"') // 替换&quot;
        .replace(/&#39;/g, "'") // 替换&#39;
        .trim();
      await Clipboard.setStringAsync(plainText);
      Alert.alert('复制成功', '全文已复制到剪贴板');
    } catch (error) {
      Alert.alert('复制失败', '无法复制内容');
    }
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
    // 处理引用块中的换行 - 将<br>转换为实际换行
    processed = processed.replace(/<blockquote([^>]*)>(.*?)<\/blockquote>/gis, (match, attrs, content) => {
      const processedContent = content.replace(/<br\s*\/>|<br>/gi, '\n');
      return `<blockquote${attrs}>${processedContent}</blockquote>`;
    });
    return processed;
  }, []);

  // 只需要简单的清洗，不再分割（必须在条件检查之前定义hooks）
  const cleanHtml = useMemo(() => {
    if (!article?.content) return '';
    return processHtmlContent(article.content);
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

  // HTML渲染配置 - 优化排版
  const htmlStyles = {
    body: {
      ...getTextStyles(),
      fontSize: readingSettings?.fontSize || 16,
      lineHeight: (readingSettings?.lineHeight || 1.8) * (readingSettings?.fontSize || 16), // 增加行高至1.8
      color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'),
    },
    p: {
      marginBottom: 16, // 段落之间增加间距
      marginTop: 0,
      textAlign: 'left' as const,
      textIndent: 0, // 明确设置无缩进
      lineHeight: (readingSettings?.lineHeight || 1.8) * (readingSettings?.fontSize || 16),
      fontWeight: '400' as const, // 正文使用正常字重
    },
    // 优化标题系统，增加区分度和字重层次
    h1: { 
      fontSize: 28, 
      fontWeight: '700' as const, // 最重要标题使用700
      marginTop: 24,
      marginBottom: 16,
      lineHeight: 36,
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    },
    h2: { 
      fontSize: 24, 
      fontWeight: '700' as const, // 次级标题使用700
      marginTop: 20,
      marginBottom: 12,
      lineHeight: 32,
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    },
    h3: { 
      fontSize: 22, 
      fontWeight: '600' as const, // 三级标题使用600
      marginTop: 18,
      marginBottom: 10,
      lineHeight: 30,
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    },
    h4: { 
      fontSize: 20, 
      fontWeight: '600' as const, // 四级标题使用600
      marginTop: 16,
      marginBottom: 8,
      lineHeight: 28,
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    },
    h5: { 
      fontSize: 18, 
      fontWeight: '500' as const, // 五级标题使用500
      marginTop: 14,
      marginBottom: 8,
      lineHeight: 26,
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    },
    h6: { 
      fontSize: 16, 
      fontWeight: '500' as const, // 六级标题使用500
      marginTop: 12,
      marginBottom: 6,
      lineHeight: 24,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
    },
    a: {
      color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'),
      textDecorationLine: 'none' as const,
    },
    ul: { 
      marginVertical: 12, 
      marginTop: 8, 
      marginBottom: 16, 
      paddingLeft: 20,
    },
    ol: { 
      marginVertical: 12, 
      marginTop: 8, 
      marginBottom: 16, 
      paddingLeft: 20,
    },
    li: { 
      marginVertical: 6, 
      marginTop: 0, 
      marginBottom: 0,
      lineHeight: (readingSettings?.lineHeight || 1.8) * (readingSettings?.fontSize || 16),
      flexDirection: 'column' as const,
    },
    img: {
      marginTop: 20, // 增加图片上间距
      marginBottom: 20, // 增加图片下间距
    },
    // 添加代码块支持
    pre: {
      backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#2B2930' : '#F3EDF7'),
      borderRadius: 8,
      padding: 16,
      marginVertical: 16,
      overflow: 'scroll' as const,
    },
    code: {
      backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#2B2930' : '#F3EDF7'),
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      fontFamily: 'monospace',
      fontSize: (readingSettings?.fontSize || 16) - 2,
      color: theme?.colors?.primary || '#3B82F6',
    },
    // 添加引用块支持 - 优化换行显示
    blockquote: {
      borderLeftWidth: 4,
      borderLeftColor: theme?.colors?.primary || '#3B82F6',
      paddingLeft: 16,
      paddingRight: 12,
      paddingVertical: 12,
      marginVertical: 16,
      marginLeft: 0,
      fontStyle: 'italic' as const,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
      backgroundColor: theme?.colors?.surfaceContainerHighest || (isDark ? '#36343B' : '#E6E0E9'),
      borderRadius: 8,
      whiteSpace: 'pre-wrap' as const, // 保留换行和空格
    },
  };

  const renderersProps = {
    img: {
      enableExperimentalPercentWidth: true,
    },
  };

  const customRenderers = {
    // 图片渲染器：直接在 HTML流 中替换 img 标签
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
          priority="normal"
        />
      );
    },
    
    // 视频渲染器：增加对 video 标签的支持
    video: (props: any) => {
      const { src } = props.tnode.attributes || {};
      if (!src) return null;
      
      const maxWidth = screenWidth - 32;
      return <VideoPlayer src={src} maxWidth={maxWidth} />;
    },
    
    // 段落文本渲染器 - 支持单词点击
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
              marginBottom: 16,
              marginTop: 0,
              textAlign: 'left' as const,
              fontSize: readingSettings?.fontSize || 16,
              lineHeight: (readingSettings?.lineHeight || 1.8) * (readingSettings?.fontSize || 16),
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



  return (
    <ScrollView style={[styles.container, readingSettings && { backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE') }]} showsVerticalScrollIndicator={false}>
      <View style={[styles.content, getContainerStyles()]}>
        <View style={styles.titleContainer}>
          <TouchableOpacity 
            style={{ flex: 1, marginRight: 12 }} 
            onLongPress={handleCopyTitle}
            activeOpacity={0.7}
          >
            <Text style={[styles.articleTitle, getTitleStyles(1.3)]}>
              {article.title}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.favoriteButton} onPress={handleToggleFavorite}>
            <MaterialIcons 
              name={isFavorite ? "bookmark" : "bookmark-border"} 
              size={24} 
              color={theme?.colors?.primary || '#3B82F6'} 
            />
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

        <TouchableOpacity 
          style={styles.contentContainer} 
          onLongPress={handleCopyContent}
          activeOpacity={1}
        >
          {/* 直接渲染完整 HTML，结构会自动正确 */}
          {cleanHtml ? (
            <RenderHtml
              contentWidth={screenWidth - 32}
              source={{ html: cleanHtml }}
              tagsStyles={htmlStyles}
              renderers={customRenderers}
              baseStyle={{
                ...getTextStyles(),
                fontSize: readingSettings?.fontSize || 16,
                lineHeight: (readingSettings?.lineHeight || 1.8) * (readingSettings?.fontSize || 16),
                color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'),
              }}
              defaultTextProps={{
                selectable: true,
              }}
            />
          ) : null}
        </TouchableOpacity>
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