import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Dimensions,
  Text,
  TouchableOpacity,
  InteractionManager,
  Animated, // 【新增】
  Easing,   // 【新增】
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient'; // 【新增】渐变背景
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
import { SettingsService } from '../../services/SettingsService';
import { logger } from '../../services/rss/RSSUtils';
import type { RootStackParamList } from '../../navigation/types';
import { generateArticleHtml } from '../../utils/articleHtmlTemplate';
import { getFontStackForWebView } from '../../theme/typography';
import WordDefinitionModal from '../../components/WordDefinitionModal';
import SentenceTranslationModal from '../../components/SentenceTranslationModal';
import VideoPlayer from '../../components/VideoPlayer';
import { setLastViewedArticleId } from '../Home/HomeScreen';
import { toProxyUrl } from '../../utils/imageProxy';
import { cloudConfigService } from '../../services/CloudConfigService';

type ArticleDetailRouteProp = RouteProp<RootStackParamList, 'ArticleDetail'>;

const { height: screenHeight } = Dimensions.get('window');

const nowMs = () => {
  const p = (globalThis as any)?.performance;
  if (p && typeof p.now === 'function') return p.now();
  return Date.now();
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const formatDateForMeta = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (!dateObj || Number.isNaN(dateObj.getTime())) {
    return '未知日期';
  }
  return dateObj.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// 【优化】底部进度条组件 - 流体磁吸风格设计
const BottomProgressBar: React.FC<{
  progress: number;
  color: string;
  showNextHint: boolean;
  hasNextArticle: boolean;
  isLastArticle: boolean;
  noUnreadArticle: boolean;
  theme: any;
}> = ({ progress, color, showNextHint, hasNextArticle, isLastArticle, noUnreadArticle, theme }) => {
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

  // 【修复】直接使用传递过来的 showNextHint，而不是基于 progress 百分比判断
  // 这样才能确保根据物理滚动距离（而非百分比）来控制提示显示
  const shouldShowHintLocal = showNextHint && (hasNextArticle || isLastArticle || noUnreadArticle);

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
    if (shouldShowHintLocal) {
      // 【优化】删除滚动显示提示时的震动
      // 只在用户实际交互（快速上滑触发翻页）时才震动，避免信号冲突

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
  }, [shouldShowHintLocal, hasNextArticle, isLastArticle, noUnreadArticle]);

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
    ? hexToRgba(theme.colors.surfaceContainerHighest, 0.95)
    : theme.colors.primary;

  const pillTextColor = isGray
    ? theme.colors.onSurfaceVariant
    : theme.colors.onPrimary;

  // Hex 转 RGBA 工具函数
  function hexToRgba(hex: string, alpha: number) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
    }
    return hex;
  }

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
      hexToRgba(theme.colors.primary, 0.9),
      hexToRgba(theme.colors.primary, 0.4),
      hexToRgba(theme.colors.primary, 0),
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
          shadowColor: theme.isDark ? '#000' : (theme.colors.shadow || '#000'),
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: theme.isDark ? 0.3 : 0.2,
          shadowRadius: 8,
          elevation: 6,
          borderWidth: isGray ? 1 : 0,
          borderColor: theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
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
            lineHeight: 20,
            includeFontPadding: false,
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

const ArticleBodyLinesSkeleton: React.FC<{
  isDark: boolean;
  baseFontSize: number;
  lineHeightMultiplier: number;
}> = ({ isDark, baseFontSize, lineHeightMultiplier }) => {
  const lineBase = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textLineHeight = Math.max(16, Math.round(baseFontSize * lineHeightMultiplier));
  const barH = Math.max(12, Math.round(textLineHeight * 0.55));
  const gap = Math.max(6, textLineHeight - barH);
  const gapPara = Math.max(14, Math.round(baseFontSize * 1.5));

  const lines = useMemo(() => {
    const widths = [94, 88, 92, 86, 96, 80, 90, 84, 98, 76, 93, 87];
    const rows: Array<{ w: string; h: number; mt: number; c: string }> = [];
    const targetHeight = screenHeight * 1.2;

    let usedH = 0;
    let paraIndex = 0;

    while (usedH < targetHeight) {
      const linesInPara = 3 + (paraIndex % 3); // 3~5 行
      for (let i = 0; i < linesInPara; i++) {
        const mt = rows.length === 0 ? 0 : i === 0 ? gapPara : gap;
        rows.push({
          w: `${widths[(paraIndex * 5 + i) % widths.length]}%`,
          h: barH,
          mt,
          c: lineBase,
        });
        usedH += mt + barH;
        if (usedH >= targetHeight) break;
      }
      paraIndex += 1;
    }

    return rows;
  }, [barH, gap, gapPara, lineBase]);

  return (
    <View style={{ marginTop: 32 }}>
      {lines.map((l, idx) => (
        <View
          key={idx}
          style={{
            width: l.w as any,
            height: l.h,
            marginTop: l.mt,
            borderRadius: 8,
            backgroundColor: l.c,
          }}
        />
      ))}
    </View>
  );
};

const ArticleHeaderSkeletonOverlay: React.FC<{
  article: Article;
  theme: any;
  readingSettings: any | null;
}> = ({ article, theme, readingSettings }) => {
  const bg = theme.colors.background;
  const baseFontSize = Number(readingSettings?.fontSize) > 0 ? Number(readingSettings.fontSize) : 16;
  const baseLineHeightMultiplier = Number(readingSettings?.lineHeight) > 0 ? Number(readingSettings.lineHeight) : 1.8;
  const lineBase = theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  const titleLineHeight = baseFontSize * 1.4 * 1.25;
  const subtitleLineHeight = baseFontSize * 1.2 * 1.5;
  const metaLineHeight = baseFontSize * 0.9 * baseLineHeightMultiplier;

  const titleBarH = Math.max(16, Math.round(titleLineHeight * 0.55));
  const subtitleBarH = Math.max(14, Math.round(subtitleLineHeight * 0.55));
  const metaBarH = Math.max(10, Math.round(metaLineHeight * 0.5));

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 20, maxWidth: 800, alignSelf: 'center', width: '100%' }}>
        <View style={{ marginBottom: 12 }}>
          <View style={{ width: '92%', height: titleBarH, borderRadius: 10, backgroundColor: lineBase }} />
          <View style={{ width: '78%', height: titleBarH, marginTop: Math.max(6, Math.round(titleLineHeight - titleBarH)), borderRadius: 10, backgroundColor: lineBase }} />
        </View>

        {!!article.titleCn && (
          <View style={{ marginBottom: 16 }}>
            <View style={{ width: '88%', height: subtitleBarH, borderRadius: 10, backgroundColor: lineBase }} />
            <View
              style={{
                width: '70%',
                height: subtitleBarH,
                marginTop: Math.max(6, Math.round(subtitleLineHeight - subtitleBarH)),
                borderRadius: 10,
                backgroundColor: lineBase,
              }}
            />
          </View>
        )}

        <View style={{ marginBottom: 24, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
          <View style={{ width: 120, height: metaBarH, borderRadius: 8, backgroundColor: lineBase, marginRight: 12, marginBottom: 8 }} />
          <View style={{ width: 150, height: metaBarH, borderRadius: 8, backgroundColor: lineBase, marginRight: 12, marginBottom: 8 }} />
          <View style={{ width: 100, height: metaBarH, borderRadius: 8, backgroundColor: lineBase, marginRight: 12, marginBottom: 8 }} />
        </View>
        <ArticleBodyLinesSkeleton isDark={theme.isDark} baseFontSize={baseFontSize} lineHeightMultiplier={baseLineHeightMultiplier} />
      </View>
    </View>
  );
};

const ArticleDetailScreen: React.FC = () => {
  const route = useRoute<ArticleDetailRouteProp>();
  const navigation = useNavigation();
  const { articleId, articleIds, currentIndex, article: passedArticle, perf } = route.params as any;
  const { theme } = useThemeContext();
  const {
    settings: readingSettings,
    loading: settingsLoading, // Restore destructured variable name
  } = useReadingSettings();
  const insets = useSafeAreaInsets(); // 获取安全区域
  const webViewRef = useRef<WebView>(null);
  const perfRef = useRef(perf as any);
  const mountMsRef = useRef(nowMs());
  const pendingMarkReadRef = useRef(false);
  const deferredWorkStartedRef = useRef(false);
  const bodyFadeAnim = useRef(new Animated.Value(0)).current;
  const webViewReadyFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 【优化】优先使用传递过来的 article 对象，实现秒开
  const passedArticleHydrated: Article | null = passedArticle
    ? {
      ...passedArticle,
      publishedAt: new Date(passedArticle.publishedAt),
      readAt: passedArticle.readAt ? new Date(passedArticle.readAt) : undefined,
    }
    : null;
  const [article, setArticle] = useState<Article | null>(passedArticleHydrated);
  // 【优化】如果有传递的数据，就不显示全屏 Loading
  const [loading, setLoading] = useState(!passedArticleHydrated);
  const vocabularyWordsRef = useRef<string[]>([]); // 使用 Ref 存储最新单词列表，避免重渲染
  const [isFavorite, setIsFavorite] = useState(false); // 收藏状态
  const [webViewReady, setWebViewReady] = useState(false); // WebView 准备就绪
  const [initialScrollY, setInitialScrollY] = useState(0);
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
  const lastInBlankAreaRef = useRef(false);
  const [nextUnreadIndex, setNextUnreadIndex] = useState<number | null>(null); // 【新增】下一篇未读文章索引
  const [nextUnreadArticleId, setNextUnreadArticleId] = useState<number | null>(null);

  // 【新增】代理服务器地址，用于处理防盗链图片
  const [proxyServerUrl, setProxyServerUrl] = useState<string>('');
  const aliveRef = useRef(true);

  // 【修改】检查是否有下一篇未读文章
  const hasNextArticle = nextUnreadIndex !== null || nextUnreadArticleId !== null;

  useEffect(() => {
    if (!lastInBlankAreaRef.current) return;
    if (hasNextArticle || showLastArticleHint || noUnreadArticle) {
      setShowNextHint(true);
    }
  }, [hasNextArticle, showLastArticleHint, noUnreadArticle]);

  const styles = createStyles(theme, readingSettings);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    setWebViewReady(false);
    pendingMarkReadRef.current = false;
    deferredWorkStartedRef.current = false;
    vocabularyWordsRef.current = [];
    bodyFadeAnim.setValue(0);
    lastInBlankAreaRef.current = false;
    setShowNextHint(false);
    setShowLastArticleHint(false);
    setNoUnreadArticle(false);
    setNextUnreadIndex(null);
    setNextUnreadArticleId(null);
    if (webViewReadyFallbackTimerRef.current) {
      clearTimeout(webViewReadyFallbackTimerRef.current);
      webViewReadyFallbackTimerRef.current = null;
    }
  }, [articleId, bodyFadeAnim]);

  useEffect(() => {
    const perfPayload = perfRef.current;
    if (perfPayload?.id) {
      const tMountMs = mountMsRef.current;
      const dtFromPress = perfPayload.tPressMs ? tMountMs - perfPayload.tPressMs : undefined;
      const dtFromNavigate = perfPayload.tNavigateMs ? tMountMs - perfPayload.tNavigateMs : undefined;
      logger.info(
        `[Perf] [Detail] mount id=${perfPayload.id} dtFromPressMs=${dtFromPress !== undefined ? Math.round(dtFromPress) : 'na'
        } dtFromNavigateMs=${dtFromNavigate !== undefined ? Math.round(dtFromNavigate) : 'na'} articleId=${articleId}`
      );
    }
  }, [articleId]);

  useEffect(() => {
    const loadArticle = async () => {
      const perfPayload = perfRef.current;
      const perfId = perfPayload?.id || `a${articleId}`;
      const tLoadStart = nowMs();
      try {
        // 【优化】如果已经有传递的数据，不要显示 Loading，仅在后台静默更新
        if (!passedArticle) {
          setLoading(true);
        }

        // 【优化】不再强制重置 webViewReady，避免闪烁
        // setWebViewReady(false); 

        const settingsService = SettingsService.getInstance();
        const tConfigStart = nowMs();
        const cloudConfig = await cloudConfigService.getConfig();
        logger.info(`[Perf] [Detail] configLoaded id=${perfId} ms=${Math.round(nowMs() - tConfigStart)}`);

        const cloudUrl = (cloudConfig.serverUrl || '').replace(/\/$/, '');
        const activeUrl = cloudConfig.mode === 'cloud' && cloudUrl ? cloudUrl : '';
        setProxyServerUrl(activeUrl);

        const tArticleStart = nowMs();
        const articlePromise = articleService.getArticleById(articleId).then((res) => {
          logger.info(`[Perf] [Detail] getArticleById id=${perfId} ms=${Math.round(nowMs() - tArticleStart)}`);
          return res;
        });
        const tScrollStart = nowMs();
        const scrollPromise = articleService.getScrollPosition(articleId).catch(() => 0).then((res) => {
          logger.info(`[Perf] [Detail] getScrollPosition id=${perfId} ms=${Math.round(nowMs() - tScrollStart)}`);
          return res;
        });

        const [articleData, savedScrollY] = await Promise.all([
          articlePromise,
          scrollPromise,
        ]);

        setArticle(articleData);
        setIsFavorite(articleData?.isFavorite || false);

        // 【新增】更新最后查看的文章ID，用于返回列表时刷新状态
        setLastViewedArticleId(articleId);

        // 【新增】设置滚动位置和生词表
        setInitialScrollY(savedScrollY || 0);

        // 自动标记为已读
        if (articleData && !articleData.isRead) {
          pendingMarkReadRef.current = true;
        }
      } catch (error) {
        console.error('Failed to load article data:', error);
      } finally {
        setLoading(false);
        logger.info(`[Perf] [Detail] loadArticleDone id=${perfRef.current?.id || `a${articleId}`} ms=${Math.round(nowMs() - tLoadStart)}`);
      }
    };

    loadArticle();
  }, [articleId]);

  // 动态更新导航栏标题
  React.useLayoutEffect(() => {
    // 【修复】仅在这里设置 headerShown，不在这里修改动画
    // 因为 useLayoutEffect 执行时机太早，会覆盖导航器的 fade 动画配置
    navigation.setOptions({
      headerShown: false, // 隐藏原生导航栏
    });
  }, [navigation, route]);

  // 【修复】延迟重置动画配置，确保 Fade 进场动画先播放完
  useEffect(() => {
    const isNextArticle = (route as any).params?.isNextArticle || false;

    if (isNextArticle) {
      // 关键修复：延迟 400ms 执行，确保 Fade 动画（200ms）先播放完
      // 这样返回按钮才能使用 slide 动画，同时不影响进场的 fade 效果
      const timer = setTimeout(() => {
        logger.info('[ArticleDetail] 🎬 Restoring slide animation for back action');
        navigation.setOptions({
          animation: 'slide_from_right',
          animationDuration: 200,
        });
      }, 400);

      return () => clearTimeout(timer);
    }
  }, [navigation, route]);

  const titleFadeLastRef = useRef<number>(0);

  // 【新增函数】提取注入逻辑为独立函数，方便复用
  const injectHighlights = useCallback((words: string[]) => {
    if (webViewRef.current && words.length > 0) {
      logger.info('[ArticleDetail] Injecting highlights immediately, words count:', words.length);
      const script = `window.highlightVocabularyWords(${JSON.stringify(words)}); true;`;
      webViewRef.current.injectJavaScript(script);
    }
  }, []);

  const startDeferredWork = useCallback(() => {
    if (deferredWorkStartedRef.current) return;
    if (!aliveRef.current) return;
    deferredWorkStartedRef.current = true;

    const perfPayload = perfRef.current;
    const perfId = perfPayload?.id || `a${articleId}`;

    InteractionManager.runAfterInteractions(async () => {
      if (!aliveRef.current) return;

      if (pendingMarkReadRef.current) {
        pendingMarkReadRef.current = false;
        const tMarkReadStart = nowMs();
        await articleService.markAsRead(articleId).catch(() => undefined);
        if (!aliveRef.current) return;
        logger.info(`[Perf] [Detail] markAsReadDone id=${perfId} ms=${Math.round(nowMs() - tMarkReadStart)}`);
      }

      const tVocabStart = nowMs();
      const vocabularyEntries = await vocabularyService
        .getAllWords({ limit: 10000 })
        .catch(() => []);
      if (!aliveRef.current) return;
      logger.info(
        `[Perf] [Detail] getAllWords id=${perfId} ms=${Math.round(nowMs() - tVocabStart)} count=${vocabularyEntries?.length || 0}`
      );

      const words = vocabularyEntries.map((entry: any) => entry.word.toLowerCase());
      vocabularyWordsRef.current = words;
      if (words.length > 0) {
        injectHighlights(words);
      }

      const tFindNextStart = nowMs();
      let checkedCount = 0;
      let foundNextUnread = false;

      if (articleIds && currentIndex !== undefined) {
        for (let i = currentIndex + 1; i < articleIds.length; i++) {
          if (!aliveRef.current) return;
          try {
            checkedCount++;
            const nextArticle = await articleService.getArticleById(articleIds[i]);
            if (!aliveRef.current) return;
            if (nextArticle && !nextArticle.isRead) {
              setNextUnreadIndex(i);
              setNextUnreadArticleId(null);
              setShowLastArticleHint(false);
              setNoUnreadArticle(false);
              foundNextUnread = true;
              break;
            }
          } catch (e) {
            logger.warn('[ArticleDetail] Failed to check article:', articleIds[i]);
          }
        }
      }

      if (!aliveRef.current) return;

      if (!foundNextUnread) {
        setNextUnreadIndex(null);
        setNextUnreadArticleId(null);

        const currentArticle = await articleService.getArticleById(articleId).catch(() => null);
        if (!aliveRef.current) return;

        const sourceTabKey = perfRef.current?.sourceTabKey as string | undefined;
        const rssSourceId =
          sourceTabKey && sourceTabKey.startsWith('source-')
            ? parseInt(sourceTabKey.replace('source-', ''), 10)
            : undefined;

        const afterPublishedAt =
          currentArticle?.publishedAt instanceof Date
            ? currentArticle.publishedAt.toISOString()
            : currentArticle?.publishedAt
              ? new Date(currentArticle.publishedAt as any).toISOString()
              : null;

        if (afterPublishedAt) {
          const nextId = await articleService.getNextUnreadAfter({
            afterPublishedAt,
            afterId: articleId,
            rssSourceId,
          });
          if (!aliveRef.current) return;

          if (nextId !== null && Number.isFinite(nextId)) {
            setNextUnreadArticleId(nextId);
            setShowLastArticleHint(false);
            setNoUnreadArticle(false);
          } else {
            const hasAnyAfter = await articleService.hasAnyArticleAfter({
              afterPublishedAt,
              afterId: articleId,
              rssSourceId,
            });
            if (!aliveRef.current) return;
            if (hasAnyAfter) {
              setNoUnreadArticle(true);
              setShowLastArticleHint(false);
            } else {
              setShowLastArticleHint(true);
              setNoUnreadArticle(false);
            }
          }
        } else {
          setNoUnreadArticle(true);
          setShowLastArticleHint(false);
        }
      }

      logger.info(
        `[Perf] [Detail] findNextUnreadDone id=${perfId} ms=${Math.round(nowMs() - tFindNextStart)} checked=${checkedCount}`
      );
    });
  }, [articleId, articleIds, currentIndex, injectHighlights]);

  useEffect(() => {
    Animated.timing(bodyFadeAnim, {
      toValue: webViewReady ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [webViewReady, bodyFadeAnim]);

  useEffect(() => {
    if (!webViewReady) return;
    startDeferredWork();
  }, [webViewReady, startDeferredWork]);

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
    const nextArticleId =
      nextUnreadArticleId !== null
        ? nextUnreadArticleId
        : nextUnreadIndex !== null && articleIds
          ? articleIds[nextUnreadIndex]
          : null;

    if (!nextArticleId) {
      // 没有未读文章
      setNoUnreadArticle(true);
      setTimeout(() => setNoUnreadArticle(false), 2000);
      return;
    }

    // 【优化】使用 Rigid（短促、清脆）震动，表示"操作成功"
    // 相比 Medium 更快、更干脆，体验更爽快
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);

    // 【新增】更新最后查看的文章ID，用于返回时滚动定位
    setLastViewedArticleId(nextArticleId);

    // 使用 replace 替代当前页面，这样返回时直接回到列表
    (navigation as any).replace('ArticleDetail', {
      articleId: nextArticleId,
      ...(nextUnreadIndex !== null && articleIds
        ? { articleIds, currentIndex: nextUnreadIndex }
        : { articleIds: undefined, currentIndex: 0 }),
      isNextArticle: true,
      perf: perfRef.current ? { ...perfRef.current, id: `a${nextArticleId}` } : undefined,
    });
  }, [nextUnreadArticleId, nextUnreadIndex, articleIds, navigation]);

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
      if (!vocabularyWordsRef.current.includes(newWord)) {
        const updatedWords = [...vocabularyWordsRef.current, newWord];
        vocabularyWordsRef.current = updatedWords;
        // setVocabularyWords(updatedWords); // 移除 State 更新以避免 WebView 重载

        // 【修改】在添加单词时直接调用注入函数，而不是依赖 useEffect
        if (webViewRef.current) {
          logger.info('[ArticleDetail] Adding word and injecting highlight with updated words:', updatedWords);
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

    const safeDecode = (value: string): string => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    };

    const unwrapProxyUrl = (value: string): string => {
      const decoded = safeDecode(value);
      try {
        const urlObj = decoded.startsWith('http')
          ? new URL(decoded)
          : new URL(decoded, 'http://localhost');

        const isApiImage = urlObj.pathname === '/api/image' || urlObj.pathname.endsWith('/api/image');
        if (isApiImage) {
          const inner = urlObj.searchParams.get('url');
          if (inner) return safeDecode(inner);
        }

        if (urlObj.hostname === 'images.weserv.nl') {
          const inner = urlObj.searchParams.get('url');
          if (inner) return safeDecode(inner);
        }

        return decoded;
      } catch {
        return decoded;
      }
    };

    const normalizeForCompare = (value: string): string => {
      const unwrapped = unwrapProxyUrl(value);
      const decoded = safeDecode(unwrapped);
      try {
        const urlObj = new URL(decoded);
        return `${urlObj.hostname.toLowerCase()}${urlObj.pathname}`;
      } catch {
        return decoded.split('#')[0].split('?')[0];
      }
    };

    const imgRegex = /<img[^>]*src=["']([^"']*)["'][^>]*>/gi;
    const contentImages = article.content.match(imgRegex);
    if (!contentImages || contentImages.length === 0) {
      return true;
    }

    const thumbnailUrl = article.imageUrl;
    logger.info(`[shouldShowHeaderImage] 封面图片URL: ${thumbnailUrl}`);
    const normalizedThumbnail = normalizeForCompare(thumbnailUrl);

    for (const imgTag of contentImages) {
      const srcMatch = imgTag.match(/src=["']([^"']*)["']/i);
      if (srcMatch && srcMatch[1]) {
        try {
          const contentImageUrl = safeDecode(srcMatch[1]);
          const thumbnailImageUrl = safeDecode(thumbnailUrl);

          logger.info(`[shouldShowHeaderImage] 内容图片URL: ${contentImageUrl}`);
          logger.info(`[shouldShowHeaderImage] 解码后封面URL: ${thumbnailImageUrl}`);

          const normalizedContent = normalizeForCompare(contentImageUrl);

          if (
            normalizedContent === normalizedThumbnail ||
            contentImageUrl === thumbnailImageUrl ||
            contentImageUrl.includes(thumbnailImageUrl) ||
            thumbnailImageUrl.includes(contentImageUrl)
          ) {
            logger.info(`[shouldShowHeaderImage] 图片重复，不显示封面`);
            return false;
          }
        } catch (e) {
          logger.info(`[shouldShowHeaderImage] URL解码失败，直接比较`);
          if (srcMatch[1] === thumbnailUrl) {
            logger.info(`[shouldShowHeaderImage] 图片重复(未解码)，不显示封面`);
            return false;
          }
        }
      }
    }

    logger.info(`[shouldShowHeaderImage] 图片不重复，显示封面`);
    return true;
  };

  // 【关键修改】处理 WebView 消息
  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      switch (data.type) {
        case 'debug':
          // WebView 端的调试消息
          logger.info(`[WebView Debug] ${data.debugType}: ${data.message}`);
          break;

        case 'ready':
          // WebView 已准备就绪
          logger.info('[ArticleDetail] WebView ready event received');
          if (webViewReadyFallbackTimerRef.current) {
            clearTimeout(webViewReadyFallbackTimerRef.current);
            webViewReadyFallbackTimerRef.current = null;
          }
          setWebViewReady(true);
          if (perfRef.current?.id) {
            const tNow = nowMs();
            const dtFromPress = perfRef.current?.tPressMs ? tNow - perfRef.current.tPressMs : undefined;
            const dtFromMount = tNow - mountMsRef.current;
            logger.info(
              `[Perf] [Detail] webViewReady id=${perfRef.current.id} dtFromPressMs=${dtFromPress !== undefined ? Math.round(dtFromPress) : 'na'
              } dtFromMountMs=${dtFromMount !== undefined ? Math.round(dtFromMount) : 'na'}`
            );
          }
          if (data.perf?.initMs !== undefined) {
            logger.info(
              `[Perf] [WebView] event=init id=${perfRef.current?.id || `a${articleId}`} durationMs=${Math.round(
                data.perf.initMs
              )}`
            );
          }
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

            const fadeStartY = 24;
            const fadeEndY = 140;
            const titleFade = clamp01((Number(data.scrollY) - fadeStartY) / (fadeEndY - fadeStartY));
            if (Math.abs(titleFade - titleFadeLastRef.current) > 0.01) {
              titleFadeLastRef.current = titleFade;
              titleFadeAnim.setValue(titleFade);
            }

            // 【新增】更新阅读进度
            if (data.progress !== undefined) {
              setReadingProgress(data.progress);
            }

            if (data.shouldShowHint !== undefined) {
              const inBlankArea = data.shouldShowHint;
              lastInBlankAreaRef.current = inBlankArea;
              setIsAtBottom(data.isAtBottom || false);
              if (inBlankArea && (hasNextArticle || showLastArticleHint || noUnreadArticle)) {
                setShowNextHint(true);
              }
              if (!inBlankArea) {
                setShowNextHint(false);
              }
            }
          }
          break;

        // 【新增】处理底部上滑切换下一篇
        case 'swipeToNext':
          logger.info('[ArticleDetail] Swipe to next article triggered');
          if (hasNextArticle) {
            navigateToNextArticle();
          } else {
            // 【新增】如果是最后一篇，显示提示后 2 秒消失
            setShowLastArticleHint(true);
            setTimeout(() => setShowLastArticleHint(false), 2000);
          }
          break;

        case 'perf':
          if (data.event) {
            logger.info(
              `[Perf] [WebView] event=${data.event} id=${perfRef.current?.id || `a${articleId}`} durationMs=${data.durationMs !== undefined ? Math.round(data.durationMs) : 'na'
              } highlighted=${data.highlighted !== undefined ? data.highlighted : 'na'} initMs=${data.initMs !== undefined ? Math.round(data.initMs) : 'na'
              }`
            );
          }
          break;
      }
    } catch (error) {
      console.error('Failed to parse WebView message:', error);
    }
  }, [handleWordPress, handleSentenceDoubleTap, hasNextArticle, navigateToNextArticle, showLastArticleHint, noUnreadArticle]);

  // 【关键修改】在组件卸载（用户退出页面）时，统一保存一次
  // 滚动位置实时记录在 currentScrollYRef 中，只在退出时写入数据库
  // 这样可以避免频繁写入数据库导致的并发冲突
  useEffect(() => {
    // 这个 cleanup 函数会在组件卸载（返回上一页）时执行
    return () => {
      if (hasScrolledRef.current && articleId) {
        // saveScrollPosition 会静默处理数据库锁定错误，不需要 catch
        articleService.saveScrollPosition(articleId, currentScrollYRef.current);
      }
    };
  }, [articleId]);

  // 生成 HTML 内容 - 将 initialScrollY 和 vocabularyWords 直接注入
  const htmlContent = useMemo(() => {
    const tStart = nowMs();
    logger.info('[ArticleDetail] Generating HTML, article exists:', !!article);
    logger.info('[ArticleDetail] article.content exists:', !!article?.content);
    logger.info('[ArticleDetail] readingSettings exists:', !!readingSettings);

    if (!article?.content || !readingSettings) {
      logger.info('[ArticleDetail] ❌ HTML generation skipped - missing article.content or readingSettings');
      return '';
    }

    // 【调试日志】空急论证 imageUrl
    const showHeaderImage = shouldShowHeaderImage();
    logger.info(`[ArticleDetail] article.imageUrl = ${article.imageUrl}`);
    logger.info(`[ArticleDetail] shouldShowHeaderImage() = ${showHeaderImage}`);

    const finalImageUrl = showHeaderImage ? article.imageUrl : undefined;
    logger.info(`[ArticleDetail] 最终传递的 imageUrl = ${finalImageUrl}`);

    const html = generateArticleHtml({
      theme,
      content: article.content,
      fontSize: readingSettings.fontSize || 16,
      lineHeight: readingSettings.lineHeight || 1.8,
      fontFamily: getFontStackForWebView(readingSettings.fontFamily || 'system'),
      title: article.title,
      titleCn: article.titleCn,
      sourceName: article.sourceName,
      publishedAt: formatDateForMeta(article.publishedAt),
      author: article.author,
      // 【关键修改】确保封面图被正确代理
      // 即使在直连模式下，如果域名在 BLOCKED_DOMAINS 列表中（如 BBC），
      // toProxyUrl 也会强制使用 weserv.nl，而不依赖 proxyServerUrl
      imageUrl: finalImageUrl ? toProxyUrl(finalImageUrl) : undefined,
      imageCaption: article.imageCaption,
      imageCredit: article.imageCredit,
      articleUrl: article.url,
      initialScrollY,
      vocabularyWords: [],
    });

    logger.info('[ArticleDetail] ✅ HTML generated successfully, length:', html.length);
    logger.info(
      `[Perf] [Detail] generateHtmlDone id=${perfRef.current?.id || `a${articleId}`} ms=${Math.round(nowMs() - tStart)} htmlLen=${html.length
      }`
    );
    return html;
  }, [article, readingSettings, theme, initialScrollY, proxyServerUrl]);

  const webViewSource = useMemo(() => ({ html: htmlContent }), [htmlContent]);

  const shouldShowSkeleton = !htmlContent || !webViewReady;

  if (!article && (loading || settingsLoading)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator
          size="large"
          color={theme.colors.primary}
        />
      </View>
    );
  }

  if (!article) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error" size={48} color={theme.colors.error} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 自定义顶部导航栏 - 为了支持 height: 35 必须使用自定义 View */}
      {/* 【修复】深色模式使用 surface 色，浅色模式使用 primary 色（与 CustomHeader 保持一致） */}
      <View style={[styles.customHeader, {
        paddingTop: insets.top - 3, // 👈 整体上移 3 像素，同步 CustomHeader
        paddingBottom: 3,           // 👈 补偿间距
        height: 35 + insets.top,
        backgroundColor: theme.isDark ? theme.colors.surface : theme.colors.primary,
        shadowColor: theme.colors.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 4,
      }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          {/* 【修复】深色模式使用 onSurface，浅色模式使用 onPrimary */}
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={theme.isDark ? theme.colors.onSurface : theme.colors.onPrimary}
          />
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
            <Text style={[styles.headerTitle, { color: theme.isDark ? theme.colors.onSurface : theme.colors.onPrimary }]} numberOfLines={1}>
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
            <Text style={[styles.headerTitle, { color: theme.isDark ? theme.colors.onSurface : theme.colors.onPrimary }]} numberOfLines={1}>
              {article?.title || ''}
            </Text>
          </Animated.View>
        </View>

        <View style={styles.headerRight} />
      </View>


      {/* WebView 内容 */}
      <View style={styles.readerContainer}>
        {typeof article.videoUrl === 'string' && article.videoUrl.trim().length > 0 && (
          <VideoPlayer src={article.videoUrl.trim()} />
        )}
        {!!htmlContent && (
          <Animated.View style={{ flex: 1, opacity: bodyFadeAnim }}>
            <WebView
              ref={webViewRef}
              originWhitelist={['*']}
              source={webViewSource}
              onMessage={handleWebViewMessage}
              style={[styles.webView, { opacity: 0.99 }]}
              showsVerticalScrollIndicator={false}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              allowsFullscreenVideo={true}
              scrollEnabled={true}
              startInLoadingState={true}
              allowFileAccess={true}
              allowUniversalAccessFromFileURLs={true}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error('[WebView] Load error:', nativeEvent);
              }}
              onLoad={() => {
                console.log('[WebView] ✅ Content loaded successfully');
                if (perfRef.current?.id) {
                  const tNow = nowMs();
                  const dtFromPress = perfRef.current?.tPressMs ? tNow - perfRef.current.tPressMs : undefined;
                  const dtFromMount = mountMsRef.current ? tNow - mountMsRef.current : undefined;
                  logger.info(
                    `[Perf] [Detail] webViewOnLoad id=${perfRef.current.id} dtFromPressMs=${dtFromPress !== undefined ? Math.round(dtFromPress) : 'na'
                    } dtFromMountMs=${dtFromMount !== undefined ? Math.round(dtFromMount) : 'na'}`
                  );
                }
                if (vocabularyWordsRef.current.length > 0) {
                  injectHighlights(vocabularyWordsRef.current);
                }
                if (!webViewReady && !webViewReadyFallbackTimerRef.current) {
                  webViewReadyFallbackTimerRef.current = setTimeout(() => {
                    webViewReadyFallbackTimerRef.current = null;
                    setWebViewReady(true);
                  }, 900);
                }
              }}
              renderLoading={() => (
                <View style={styles.webViewLoading}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
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
          </Animated.View>
        )}
        {shouldShowSkeleton && (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: bodyFadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0],
                }),
              },
            ]}
          >
            <ArticleHeaderSkeletonOverlay
              article={article}
              theme={theme}
              readingSettings={readingSettings}
            />
          </Animated.View>
        )}
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
        color={theme.colors.primary}
        showNextHint={showNextHint}
        hasNextArticle={hasNextArticle || false}
        isLastArticle={showLastArticleHint}
        noUnreadArticle={noUnreadArticle}
        theme={theme}
      />
    </View>
  );
};

const createStyles = (theme: any, readingSettings?: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
    },
    webView: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    readerContainer: {
      flex: 1,
      backgroundColor: theme.colors.background,
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
    headerTitle: {
      fontSize: 19,      // 👈 同步 CustomHeader 字号
      lineHeight: 28,
      includeFontPadding: false,
      fontWeight: Platform.OS === 'ios' ? '900' : 'bold', // 👈 同步 CustomHeader 字重策略
      color: theme.colors.onPrimary,
    },
    headerRight: {
      width: 48,
    },
  });

export default ArticleDetailScreen;
