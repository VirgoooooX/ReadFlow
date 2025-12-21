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
import { LinearGradient } from 'expo-linear-gradient'; // 【新增】渐变背景
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics'; // 【新增】震动反馈
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
import { getFontStackForWebView } from '../../theme/typography';
import WordDefinitionModal from '../../components/WordDefinitionModal';
import SentenceTranslationModal from '../../components/SentenceTranslationModal';
import { setLastViewedArticleId } from '../Home/HomeScreen';

type ArticleDetailRouteProp = RouteProp<RootStackParamList, 'ArticleDetail'>;

const { width: screenWidth } = Dimensions.get('window');

// 【优化】底部进度条组件 - 流体磁吸风格设计
const BottomProgressBar: React.FC<{ 
  progress: number; 
  color: string; 
  isDark: boolean;
  showNextHint: boolean;
  hasNextArticle: boolean;
  isLastArticle: boolean;
  noUnreadArticle: boolean;
  theme: any;
}> = ({ progress, color, isDark, showNextHint, hasNextArticle, isLastArticle, noUnreadArticle, theme }) => {
  // 动画值
  const progressAnim = useRef(new Animated.Value(0)).current;
  const hintTranslateY = useRef(new Animated.Value(50)).current;  // 提示框位移：0 = 显示位置, 50 = 隐藏在底部
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const arrowTranslateY = useRef(new Animated.Value(0)).current;  // 箭头呼吸动画
  const arrowAnimRef = useRef<any>(null);
  
  // 进度条平滑动画
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 200,  // 稍微调慢一点，显得更稳重
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,  // width 属性不支持 native driver
    }).start();
  }, [progress]);

  // 判断是否应显示提示
  const shouldShowHint = progress >= 92 && (hasNextArticle || isLastArticle || noUnreadArticle);

  // 启动箭头呼吸动画
  const startArrowAnimation = useCallback(() => {
    if (arrowAnimRef.current) {
      arrowAnimRef.current.stop();
    }
    arrowAnimRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowTranslateY, {
          toValue: -4,
          duration: 600,
          easing: Easing.inOut(Easing.sin),  // 正弦缓动，自然呼吸感
          useNativeDriver: true,
        }),
        Animated.timing(arrowTranslateY, {
          toValue: 0,
          duration: 600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    arrowAnimRef.current.start();
  }, []);

  // 提示框进出场动画
  useEffect(() => {
    if (shouldShowHint) {
      // 触发轻微震动反馈
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      Animated.parallel([
        Animated.spring(hintTranslateY, {
          toValue: 0,
          friction: 6,    // 摩擦力：越小越弹
          tension: 60,    // 张力：越大越快
          useNativeDriver: true,
        }),
        Animated.timing(hintOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // 箭头呼吸动画（仅在有下一篇时）
      if (hasNextArticle && !isLastArticle && !noUnreadArticle) {
        startArrowAnimation();
      }
    } else {
      // 离场动画：快速下沉
      Animated.parallel([
        Animated.timing(hintTranslateY, {
          toValue: 40,  // 下沉距离
          duration: 200,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(hintOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        arrowTranslateY.setValue(0);  // 重置箭头
        if (arrowAnimRef.current) {
          arrowAnimRef.current.stop();
        }
      });
    }
  }, [shouldShowHint, hasNextArticle]);

  // 获取提示内容和样式
  const getHintContent = () => {
    if (isLastArticle) return { text: '已是最后一篇', icon: 'check-circle' };
    if (noUnreadArticle) return { text: '无未读文章', icon: 'check-circle' };
    return { text: '上滑阅读下一篇', icon: 'keyboard-double-arrow-up' };
  };

  const { text: hintText, icon } = getHintContent();
  const isGray = isLastArticle || noUnreadArticle;

  // 提示框背景色：灰色表示无交互，高亮主色表示有交互
  const pillBackgroundColor = isGray
    ? (isDark ? 'rgba(50,50,50,0.95)' : 'rgba(240,240,240,0.95)')
    : (theme?.colors?.primary || color);

  const pillTextColor = isGray
    ? (isDark ? '#AAA' : '#666')
    : '#FFF';

  // Hex 转 RGBA 工具函数
  const hexToRgba = (hex: string, alpha: number) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
    }
    return hex;
  };

  // 生成渐变色（从底部到顶部渐变透明）
  const getGradientColors = () => {
    if (color.startsWith('#')) {
      return [
        hexToRgba(color, 0.9),  // 底部 90% 不透明
        hexToRgba(color, 0.4),  // 中间 40%
        hexToRgba(color, 0),    // 顶部完全透明
      ];
    }
    return [
      'rgba(103, 80, 164, 0.9)',
      'rgba(103, 80, 164, 0.4)',
      'rgba(103, 80, 164, 0)',
    ];
  };
  
  return (
    <View pointerEvents="none" style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 100,
    }}>
      {/* A. 进度条（15px 高的渐变色块） */}
      <View style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 15,
        overflow: 'hidden',
      }}>
        <Animated.View style={{
          height: '100%',
          width: progressAnim.interpolate({
            inputRange: [0, 100],
            outputRange: ['0%', '100%'],
          }),
          overflow: 'hidden',
        }}>
          {/* 进度条使用渐变（从下往上渐变透明） */}
          <LinearGradient
            colors={getGradientColors() as any}
            start={{ x: 0, y: 1 }}  // 从底部开始
            end={{ x: 0, y: 0 }}    // 到顶部结束
            style={{
              flex: 1,
              width: '100%',
            }}
          />
        </Animated.View>
      </View>

      {/* B. 浮动提示胶囊（Pill） - 更显眼的样式 */}
      <Animated.View style={{
        position: 'absolute',
        bottom: 30,  // 距离底部稍微高一点，避免遮挡进度条
        alignSelf: 'center',
        opacity: hintOpacity,
        transform: [{ translateY: hintTranslateY }],
      }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: pillBackgroundColor,
          paddingVertical: 10,
          paddingHorizontal: 20,
          borderRadius: 30,
          // 优质阴影
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 6,
          borderWidth: isGray ? 1 : 0,
          borderColor: 'rgba(0,0,0,0.05)',
        }}>
          {!isGray && (
            <Animated.View style={{
              transform: [{ translateY: arrowTranslateY }],
              marginRight: 6,
            }}>
              <MaterialIcons name={icon as any} size={20} color={pillTextColor} />
            </Animated.View>
          )}
          <Text style={{
            fontSize: 14,
            fontWeight: '600',
            color: pillTextColor,
          }}>
            {hintText}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
};

const ArticleDetailScreen: React.FC = () => {
  const route = useRoute<ArticleDetailRouteProp>();
  const navigation = useNavigation();
  const { articleId, articleIds, currentIndex } = route.params;
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
  
  // 【新增】阅读进度和底部状态
  const [readingProgress, setReadingProgress] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const [showNextHint, setShowNextHint] = useState(false);
  const [showLastArticleHint, setShowLastArticleHint] = useState(false); // 【新增】已是最后一篇提示
  const [noUnreadArticle, setNoUnreadArticle] = useState(false); // 【新增】无未读文章提示
  const [nextUnreadIndex, setNextUnreadIndex] = useState<number | null>(null); // 【新增】下一篇未读文章索引
  
  // 【修改】检查是否有下一篇未读文章
  const hasNextArticle = nextUnreadIndex !== null;

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
        
        // 【新增】查找下一篇未读文章
        if (articleIds && currentIndex !== undefined) {
          let foundNextUnread = false;
          for (let i = currentIndex + 1; i < articleIds.length; i++) {
            try {
              const nextArticle = await articleService.getArticleById(articleIds[i]);
              if (nextArticle && !nextArticle.isRead) {
                setNextUnreadIndex(i);
                foundNextUnread = true;
                console.log('[ArticleDetail] Found next unread article at index:', i);
                break;
              }
            } catch (e) {
              console.log('[ArticleDetail] Failed to check article:', articleIds[i]);
            }
          }
          if (!foundNextUnread) {
            setNextUnreadIndex(null);
            // 判断是否是最后一篇文章
            if (currentIndex >= articleIds.length - 1) {
              setShowLastArticleHint(true);
            } else {
              setNoUnreadArticle(true);
            }
            console.log('[ArticleDetail] No more unread articles');
          }
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
   * 【修改】导航到下一篇未读文章
   */
  const navigateToNextArticle = useCallback(() => {
    if (nextUnreadIndex === null || !articleIds) {
      // 没有未读文章
      setNoUnreadArticle(true);
      setTimeout(() => setNoUnreadArticle(false), 2000);
      return;
    }
    
    // 触发震动反馈
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    const nextArticleId = articleIds[nextUnreadIndex];
    
    // 【新增】更新最后查看的文章ID，用于返回时滚动定位
    setLastViewedArticleId(nextArticleId);
    
    // 使用 replace 替代当前页面，这样返回时直接回到列表
    (navigation as any).replace('ArticleDetail', {
      articleId: nextArticleId,
      articleIds,
      currentIndex: nextUnreadIndex,
      isNextArticle: true,
    });
  }, [nextUnreadIndex, articleIds, navigation]);

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
    console.log(`[shouldShowHeaderImage] 封面图片URL: ${thumbnailUrl}`);
    
    for (const imgTag of contentImages) {
      const srcMatch = imgTag.match(/src=["']([^"']*)["']/i);
      if (srcMatch && srcMatch[1]) {
        try {
          const contentImageUrl = decodeURIComponent(srcMatch[1]);
          const thumbnailImageUrl = decodeURIComponent(thumbnailUrl);
          
          console.log(`[shouldShowHeaderImage] 内容图片URL: ${contentImageUrl}`);
          console.log(`[shouldShowHeaderImage] 解码后封面URL: ${thumbnailImageUrl}`);

          if (contentImageUrl === thumbnailImageUrl ||
            contentImageUrl.includes(thumbnailImageUrl) ||
            thumbnailImageUrl.includes(contentImageUrl)) {
            console.log(`[shouldShowHeaderImage] 图片重复，不显示封面`);
            return false;
          }
        } catch (e) {
          console.log(`[shouldShowHeaderImage] URL解码失败，直接比较`);
          if (srcMatch[1] === thumbnailUrl) {
            console.log(`[shouldShowHeaderImage] 图片重复(未解码)，不显示封面`);
            return false;
          }
        }
      }
    }

    console.log(`[shouldShowHeaderImage] 图片不重复，显示封面`);
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
            
            // 【新增】更新阅读进度
            if (data.progress !== undefined) {
              setReadingProgress(data.progress);
            }
            
            // 【新增】更新底部状态，显示“上滑查看下一篇”提示
            if (data.isAtBottom !== undefined) {
              setIsAtBottom(data.isAtBottom);
              if (data.isAtBottom && hasNextArticle) {
                setShowNextHint(true);
              } else {
                setShowNextHint(false);
              }
            }
          }
          break;
        
        // 【新增】处理底部上滑切换下一篇
        case 'swipeToNext':
          console.log('[ArticleDetail] Swipe to next article triggered');
          if (hasNextArticle) {
            navigateToNextArticle();
          } else {
            // 【新增】如果是最后一篇，显示提示后 2 秒消失
            setShowLastArticleHint(true);
            setTimeout(() => setShowLastArticleHint(false), 2000);
          }
          break;
      }
    } catch (error) {
      console.error('Failed to parse WebView message:', error);
    }
  }, [handleWordPress, handleSentenceDoubleTap, showRefTitle, hasNextArticle, navigateToNextArticle]);

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
  
    // 【调试日志】空急论证 imageUrl
    console.log(`[ArticleDetail] article.imageUrl = ${article.imageUrl}`);
    console.log(`[ArticleDetail] shouldShowHeaderImage() = ${shouldShowHeaderImage()}`);
      
    const finalImageUrl = shouldShowHeaderImage() ? article.imageUrl : undefined;
    console.log(`[ArticleDetail] 最终传递的 imageUrl = ${finalImageUrl}`);
  
    return generateArticleHtml({
      content: article.content,
      fontSize: readingSettings.fontSize || 16,
      lineHeight: readingSettings.lineHeight || 1.8,
      fontFamily: getFontStackForWebView(readingSettings.fontFamily || 'system'), // 新增：传递字体设置
      isDark,
      primaryColor: theme?.colors?.primary || '#3B82F6',
      // 传入元数据
      title: article.title,
      titleCn: article.titleCn,
      sourceName: article.sourceName,
      publishedAt: formatDate(article.publishedAt),
      author: article.author,
      imageUrl: finalImageUrl,
      // 【新增】传入图片说明和图片来源
      imageCaption: article.imageCaption,
      imageCredit: article.imageCredit,
      // 【新增】传入文章原始链接，用于视频跳转
      articleUrl: article.url,
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
          allowFileAccess={true}
          allowUniversalAccessFromFileURLs={true}
          mixedContentMode="always"
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
      
      {/* 【修改】底部进度条 - 带联动动画 */}
      <BottomProgressBar 
        progress={readingProgress}
        color={theme?.colors?.primary || '#3B82F6'}
        isDark={isDark}
        showNextHint={showNextHint}
        hasNextArticle={hasNextArticle || false}
        isLastArticle={showLastArticleHint}
        noUnreadArticle={noUnreadArticle}
        theme={theme}
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
    },
  });

export default ArticleDetailScreen;