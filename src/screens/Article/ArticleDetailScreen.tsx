import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
  Text,
  TouchableOpacity,
  Animated, // 【新增】
  Easing,   // 【新增】
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import ImageViewing from 'react-native-image-viewing';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // 引入安全区域
import { useThemeContext } from '../../theme';
import { useReadingSettings } from '../../hooks/useReadingSettings';
import { Article, WordDefinition } from '../../types';
import { articleService } from '../../services/ArticleService';
import { dictionaryService } from '../../services/DictionaryService';
import { vocabularyService } from '../../services/VocabularyService';
import { translationService } from '../../services/TranslationService';
import type { RootStackParamList } from '../../navigation/types';
import { generateArticleHtml } from '../../utils/articleHtmlTemplate';
import WordDefinitionModal from '../../components/WordDefinitionModal';
import SentenceTranslationModal from '../../components/SentenceTranslationModal';

type ArticleDetailRouteProp = RouteProp<RootStackParamList, 'ArticleDetail'>;

const { width: screenWidth } = Dimensions.get('window');

const ArticleDetailScreen: React.FC = () => {
  const route = useRoute<ArticleDetailRouteProp>();
  const navigation = useNavigation();
  const { articleId } = route.params;
  const { theme, isDark } = useThemeContext();
  const {
    settings: readingSettings,
    loading: settingsLoading, // Restore destructured variable name
  } = useReadingSettings();
  const insets = useSafeAreaInsets(); // 获取安全区域
  const webViewRef = useRef<WebView>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [vocabularyWords, setVocabularyWords] = useState<string[]>([]); // 单词本单词数组
  const [isFavorite, setIsFavorite] = useState(false); // 收藏状态
  const [webViewReady, setWebViewReady] = useState(false); // WebView 准备就绪
  const [initialScrollY, setInitialScrollY] = useState(0);
  const [showRefTitle, setShowRefTitle] = useState(false); // 控制顶部标题显示
  // 【新增】标题透明度动画值 (0: 显示"文章详情", 1: 显示文章标题)
  const titleFadeAnim = useRef(new Animated.Value(0)).current;

  // 【新增】图片预览状态
  const [isImageViewVisible, setIsImageViewVisible] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string>('');

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

  // 【关键新增】使用 Ref 来暂存最新的滚动位置，不触发重渲染
  const currentScrollYRef = useRef(0);
  // 记录是否需要保存（只有滚动过才保存）
  const hasScrolledRef = useRef(false);

  const styles = createStyles(isDark, theme, readingSettings);

  useEffect(() => {
    const loadArticle = async () => {
      try {
        setLoading(true);
        setWebViewReady(false); // 【关键修改】每次加载新文章前，重置 WebView 状态

        // 【新增】使用 Promise.all 并行加载所有数据：文章内容、滚动位置、生词本
        // 确保所有数据都准备好后再生成 HTML，避免数据缺失
        const [articleData, savedScrollY, vocabularyEntries] = await Promise.all([
          articleService.getArticleById(articleId),
          articleService.getScrollPosition(articleId).catch(() => 0),
          vocabularyService.getAllWords({ limit: 10000 }).catch(() => [])
        ]);

        setArticle(articleData);
        setIsFavorite(articleData?.isFavorite || false);

        // 【新增】设置滚动位置和生词表
        setInitialScrollY(savedScrollY || 0);
        console.log('[ArticleDetail] Prepared scroll position:', savedScrollY);

        const words = vocabularyEntries.map((entry: any) => entry.word.toLowerCase());
        setVocabularyWords(words);
        console.log('[ArticleDetail] Prepared vocabulary words count:', words.length);

        // 自动标记为已读
        if (articleData && !articleData.isRead) {
          articleService.markAsRead(articleId);
        }
      } catch (error) {
        console.error('Failed to load article data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadArticle();
  }, [articleId]);

  // 动态更新导航栏标题
  React.useLayoutEffect(() => {
    // 【简化】导航配置已在 AppNavigator.tsx 的 getCommonScreenOptions 中全局定义
    // 这里只需要隐藏原生导航栏即可
    navigation.setOptions({
      headerShown: false, // 隐藏原生导航栏
    });
  }, [navigation]);

  // 【新增】监听 showRefTitle 变化，执行平滑动画
  useEffect(() => {
    Animated.timing(titleFadeAnim, {
      toValue: showRefTitle ? 1 : 0,
      duration: 500, // 动画时长 500ms，让切换更加柔和缓慢
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
  }, [showRefTitle]);

  // 【新增函数】提取注入逻辑为独立函数，方便复用
  const injectHighlights = useCallback((words: string[]) => {
    if (webViewRef.current && words.length > 0) {
      console.log('[ArticleDetail] Injecting highlights immediately, words count:', words.length);
      const script = `window.highlightVocabularyWords(${JSON.stringify(words)}); true;`;
      webViewRef.current.injectJavaScript(script);
    }
  }, []);

  // 【修改】仅保留监听 vocabularyWords 变化的 Effect
  // 当用户在当前页面添加生词后，才需要重新注入（初始加载已由 HTML 处理）
  // 这个 Effect 只在用户动态添加单词时触发
  useEffect(() => {
    // 跳过初始化阶段（initialScrollY 和 vocabularyWords 都是 0 或空数组时）
    // 仅在用户交互后（添加新单词）才重新注入
    if (webViewReady && article && vocabularyWords.length > 0) {
      // 这里只用于处理用户在阅读中添加新单词的情况
      // 初始加载由 HTML 内部的 init() 函数处理
    }
  }, [webViewReady, article]);

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
      // 使用 selectedSentence 作为上下文
      const context = selectedSentence || selectedWord;

      // 添加到单词本
      await vocabularyService.addWord(
        selectedWord,
        context,
        articleId,
        wordDefinition
      );

      // 更新高亮单词数组
      const newWord = selectedWord.toLowerCase();
      if (!vocabularyWords.includes(newWord)) {
        const updatedWords = [...vocabularyWords, newWord];
        setVocabularyWords(updatedWords);

        // 【修改】在添加单词时直接调用注入函数，而不是依赖 useEffect
        if (webViewRef.current) {
          console.log('[ArticleDetail] Adding word and injecting highlight with updated words:', updatedWords);
          injectHighlights(updatedWords);
        }
      }

      setShowDictModal(false);
    } catch (error) {
      console.error('Failed to add word to vocabulary:', error);
      setShowDictModal(false);
    }
  };

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

  // 【关键修改】处理 WebView 消息
  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('[ArticleDetail] WebView message received:', data);

      switch (data.type) {
        case 'debug':
          // WebView 端的调试消息
          console.log('[WebView Debug]', data.debugType, ':', data.message);
          break;

        case 'ready':
          // WebView 已准备就绪
          console.log('[ArticleDetail] WebView ready event received');
          setWebViewReady(true);
          // 【关键修改】此时不再需要注入高亮或滚动位置，因为 HTML 内部已经处理了
          // 仅保留 injectHighlights 以便在用户添加新单词时使用
          break;

        case 'wordPress':
          // 单词点击 - 查词
          if (data.word && data.sentence) {
            setSelectedSentence(data.sentence); // 保存句子用于添加到单词本
            handleWordPress(data.word, data.sentence);
          }
          break;

        case 'sentenceDoubleTap':
          // 双击 - 翻译整句
          if (data.sentence) {
            handleSentenceDoubleTap(data.sentence);
          }
          break;

        // 【新增】优化3: 处理图片点击
        case 'imageClick':
          if (data.url) {
            setCurrentImageUrl(data.url);
            setIsImageViewVisible(true);
          }
          break;

        // 【关键修改】优化4: 处理滚动位置 
        case 'scroll':
          if (data.scrollY !== undefined) {
            currentScrollYRef.current = data.scrollY;
            hasScrolledRef.current = true;
            console.log('[ArticleDetail] Updated scroll position in memory:', data.scrollY);

            // 简单的防抖/节流逻辑，根据滚动距离决定是否显示标题
            if (data.scrollY > 60 && !showRefTitle) {
              setShowRefTitle(true);
            } else if (data.scrollY <= 60 && showRefTitle) {
              setShowRefTitle(false);
            }
          }
          break;
      }
    } catch (error) {
      console.error('Failed to parse WebView message:', error);
    }
  }, [handleWordPress, handleSentenceDoubleTap]);

  // 【关键修改】在组件卸载（用户退出页面）时，统一保存一次
  useEffect(() => {
    // 这个 cleanup 函数会在组件卸载（返回上一页）时执行
    return () => {
      if (hasScrolledRef.current && articleId) {
        console.log('[ArticleDetail] Saving final scroll position on exit:', currentScrollYRef.current);
        articleService.saveScrollPosition(articleId, currentScrollYRef.current).catch(err => {
          console.error('Failed to save scroll position on exit:', err);
        });
      }
    };
  }, [articleId]);

  // 【可选优化】为了防止 App 意外崩溃导致数据丢失，加一个低频的定时保存（每 3 秒）
  useEffect(() => {
    const interval = setInterval(() => {
      if (hasScrolledRef.current && articleId) {
        console.log('[ArticleDetail] Periodic save of scroll position:', currentScrollYRef.current);
        articleService.saveScrollPosition(articleId, currentScrollYRef.current).catch(error => {
          console.error('Failed to save scroll position periodically:', error);
        });
      }
    }, 3000); // 每 3 秒存一次库，作为双重保险
    return () => clearInterval(interval);
  }, [articleId]);

  // 生成 HTML 内容 - 将 initialScrollY 和 vocabularyWords 直接注入
  const htmlContent = useMemo(() => {
    if (!article?.content || !readingSettings) return '';

    return generateArticleHtml({
      content: article.content,
      fontSize: readingSettings.fontSize || 16,
      lineHeight: readingSettings.lineHeight || 1.8,
      isDark,
      primaryColor: theme?.colors?.primary || '#3B82F6',
      // 传入元数据
      title: article.title,
      titleCn: article.titleCn,
      sourceName: article.sourceName,
      publishedAt: formatDate(article.publishedAt),
      author: article.author,
      imageUrl: shouldShowHeaderImage() ? article.imageUrl : undefined,
      // 【新增】直接将初始滚动位置和生词表注入 HTML
      // 这样 HTML 初始化时就能直接处理，无需等待 WebView ready 后再注入
      initialScrollY,
      vocabularyWords,
    });
  }, [article, readingSettings, isDark, theme?.colors?.primary, initialScrollY, vocabularyWords]);

  if (loading || settingsLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator
          size="large"
          color={theme?.colors?.primary || '#3B82F6'}
        />
      </View>
    );
  }

  if (!article) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error" size={48} color={theme?.colors?.error || '#B3261E'} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 自定义顶部导航栏 - 为了支持 height: 35 必须使用自定义 View */}
      <View style={[styles.customHeader, {
        paddingTop: insets.top,
        height: 35 + insets.top, // 恢复正常高度计算，之前误写成 70 会导致过高
        backgroundColor: theme?.colors?.primary || '#6750A4', // 同步 AppNavigator 的 Primary 背景色
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 4,
      }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          {/* 使用 onPrimary (通常是白色) 以匹配 Primary 背景 */}
          <MaterialIcons name="arrow-back" size={24} color={theme?.colors?.onPrimary || '#FFFFFF'} />
        </TouchableOpacity>

        <View style={[styles.headerTitleContainer, { opacity: 1 }]}>
          {/* 这里使用两个绝对定位的 View 进行交叉淡入淡出动画 */}

          {/* 1. "文章详情" (默认显示，showRefTitle=true 时淡出) */}
          <Animated.View style={[
            StyleSheet.absoluteFill,
            {
              justifyContent: 'center',
              alignItems: 'center',
              opacity: titleFadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0],
              })
            }
          ]}>
            <Text style={[styles.headerTitle, { color: theme?.colors?.onPrimary || '#FFFFFF' }]} numberOfLines={1}>
              文章详情
            </Text>
          </Animated.View>

          {/* 2. 文章标题 (默认隐藏，showRefTitle=true 时淡入) */}
          <Animated.View style={[
            StyleSheet.absoluteFill,
            {
              justifyContent: 'center',
              alignItems: 'center',
              opacity: titleFadeAnim // 直接使用 0->1 的动画值
            }
          ]}>
            <Text style={[styles.headerTitle, { color: theme?.colors?.onPrimary || '#FFFFFF' }]} numberOfLines={1}>
              {article?.title || ''}
            </Text>
          </Animated.View>
        </View>

        <View style={styles.headerRight} />
      </View>


      {/* WebView 内容 */}
      {htmlContent && (
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: htmlContent }}
          onMessage={handleWebViewMessage}
          style={[styles.webView, { opacity: 0.99 }]}
          showsVerticalScrollIndicator={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          scrollEnabled={true}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.webViewLoading}>
              <ActivityIndicator size="small" color={theme?.colors?.primary} />
            </View>
          )}
          {...(Platform.OS === 'android' && {
            textZoom: 100,
            forceDarkOn: false,
            mixedContentMode: 'compatibility',
            overScrollMode: 'never',
            androidLayerType: 'hardware',
          })}
        />
      )}

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

      {/* 【新增】图片查看器 */}
      <ImageViewing
        images={[{ uri: currentImageUrl }]}
        imageIndex={0}
        visible={isImageViewVisible}
        onRequestClose={() => setIsImageViewVisible(false)}
        swipeToCloseEnabled={true}
        doubleTapToZoomEnabled={true}
      />
    </View>
  );
};

const createStyles = (isDark: boolean, theme: any, readingSettings?: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
    },
    webView: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    webViewLoading: {
      position: 'absolute',
      top: 100,
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    // 自定义 Header 样式
    customHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 100,
    },
    backButton: {
      width: 48,
      height: 35 + (Platform.OS === 'android' ? 0 : 0), // 确保按钮高度填满
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 101,
    },
    headerTitleContainer: {
      flex: 1,
      height: '100%', // 确保容器有高度
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
      position: 'relative', // 相对定位，作为绝对定位子元素的锚点
    },
    headerTitleTextContainer: {
      ...StyleSheet.absoluteFillObject, // 铺满父容器
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 18,      // 严格同步 CustomHeader 字号
      fontWeight: '900', // 严格同步 CustomHeader 字重 (Extra Bold)
      color: theme?.colors?.onPrimary || '#FFFFFF', // 确保白色文字
    },
    headerRight: {
      width: 48,
    }
  });

export default ArticleDetailScreen;