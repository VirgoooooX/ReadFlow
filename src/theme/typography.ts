import { TextStyle, Platform } from 'react-native';

// Material Design 3 Typography Scale
// 基于Material You设计规范的字体系统

export interface TypographyTokens {
  // Display styles - 大标题
  displayLarge: TextStyle;
  displayMedium: TextStyle;
  displaySmall: TextStyle;

  // Headline styles - 标题
  headlineLarge: TextStyle;
  headlineMedium: TextStyle;
  headlineSmall: TextStyle;

  // Title styles - 副标题
  titleLarge: TextStyle;
  titleMedium: TextStyle;
  titleSmall: TextStyle;

  // Label styles - 标签
  labelLarge: TextStyle;
  labelMedium: TextStyle;
  labelSmall: TextStyle;

  // Body styles - 正文
  bodyLarge: TextStyle;
  bodyMedium: TextStyle;
  bodySmall: TextStyle;
}

// Font families
export const fontFamilies = {
  // 系统默认字体
  default: undefined, // 使用系统默认字体
  
  // 中文字体优化
  chinese: {
    ios: 'PingFang SC',
    android: 'Noto Sans CJK SC',
    default: 'System',
  },
  
  // 英文字体
  english: {
    ios: 'SF Pro Text',
    android: 'Roboto',
    default: 'System',
  },
  
  // 等宽字体（用于代码显示）
  monospace: {
    ios: 'SF Mono',
    android: 'Roboto Mono',
    default: 'monospace',
  },
};

// Font weights
export const fontWeights = {
  light: '300' as const,
  regular: '400' as const,
  medium: '500' as const,
  semiBold: '600' as const,
  bold: '700' as const,
};

// Line heights
export const lineHeights = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
  loose: 1.8,
};

// Letter spacing (tracking)
export const letterSpacing = {
  tighter: -0.5,
  tight: -0.25,
  normal: 0,
  wide: 0.25,
  wider: 0.5,
  widest: 1,
};

// Typography scale based on Material Design 3
export const typography: TypographyTokens = {
  // Display styles - 用于大标题和品牌展示
  displayLarge: {
    fontSize: 57,
    lineHeight: 64,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacing.tight,
  },
  displayMedium: {
    fontSize: 45,
    lineHeight: 52,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacing.normal,
  },
  displaySmall: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacing.normal,
  },

  // Headline styles - 用于页面标题
  headlineLarge: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacing.normal,
  },
  headlineMedium: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacing.normal,
  },
  headlineSmall: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacing.normal,
  },

  // Title styles - 用于组件标题
  titleLarge: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacing.normal,
  },
  titleMedium: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: fontWeights.medium,
    letterSpacing: letterSpacing.wide,
  },
  titleSmall: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: fontWeights.medium,
    letterSpacing: letterSpacing.wide,
  },

  // Label styles - 用于按钮和标签
  labelLarge: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: fontWeights.medium,
    letterSpacing: letterSpacing.wide,
  },
  labelMedium: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeights.medium,
    letterSpacing: letterSpacing.wider,
  },
  labelSmall: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: fontWeights.medium,
    letterSpacing: letterSpacing.wider,
  },

  // Body styles - 用于正文内容
  bodyLarge: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacing.wider,
  },
  bodyMedium: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacing.wide,
  },
  bodySmall: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacing.normal,
  },
};

// 阅读专用字体配置
export const readingTypography = {
  // 文章标题
  articleTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: fontWeights.bold,
    letterSpacing: letterSpacing.normal,
  },
  
  // 文章副标题
  articleSubtitle: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: fontWeights.medium,
    letterSpacing: letterSpacing.normal,
  },
  
  // 文章正文
  articleBody: {
    fontSize: 16,
    lineHeight: 26, // 1.625倍行高，适合长文阅读
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacing.normal,
  },
  
  // 引用文本
  quote: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacing.normal,
    fontStyle: 'italic' as const,
  },
  
  // 代码文本
  code: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacing.normal,
    fontFamily: fontFamilies.monospace.default,
  },
  
  // 标注文本
  caption: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacing.normal,
  },
};

// 字体大小调节选项（用户可调节）
export const fontSizeOptions = {
  small: {
    scale: 0.875, // 87.5%
    name: '小',
  },
  medium: {
    scale: 1.0, // 100%
    name: '中',
  },
  large: {
    scale: 1.125, // 112.5%
    name: '大',
  },
  extraLarge: {
    scale: 1.25, // 125%
    name: '特大',
  },
};

// 行间距调节选项
export const lineHeightOptions = {
  compact: {
    multiplier: 1.2,
    name: '紧凑',
  },
  normal: {
    multiplier: 1.4,
    name: '标准',
  },
  relaxed: {
    multiplier: 1.6,
    name: '宽松',
  },
  loose: {
    multiplier: 1.8,
    name: '很宽松',
  },
};

// 工具函数：根据用户设置调整字体
export const adjustTypography = (
  baseStyle: TextStyle,
  fontSizeScale: number = 1,
  lineHeightMultiplier: number = 1.4
): TextStyle => {
  return {
    ...baseStyle,
    fontSize: baseStyle.fontSize ? baseStyle.fontSize * fontSizeScale : undefined,
    lineHeight: baseStyle.fontSize ? baseStyle.fontSize * fontSizeScale * lineHeightMultiplier : undefined,
  };
};

// 工具函数：获取平台特定字体
export const getPlatformFont = (type: string = 'chinese'): string | undefined => {
  const fontFamily = fontFamilies[type as keyof typeof fontFamilies];
  if (typeof fontFamily === 'string') {
    return fontFamily;
  }
  
  // 根据平台返回合适的字体
  if (typeof fontFamily === 'object' && fontFamily !== null) {
    if (Platform.OS === 'ios') {
      return fontFamily.ios;
    } else if (Platform.OS === 'android') {
      return fontFamily.android;
    }
    return fontFamily.default;
  }
  
  return undefined;
};

// 获取可用的字体选项（用于设置页面显示）
export const getAvailableFonts = () => {
  const fonts = [
    { key: 'system', name: '系统默认', description: '跟随系统字体' },
    { key: 'serif', name: '衬线体', description: '适合长文阅读' },
    { key: 'sansSerif', name: '无衬线体', description: '现代简洁风格' },
    { key: 'chinese', name: '中文优化', description: '苹方/思源黑体' },
    { key: 'monospace', name: '等宽字体', description: '适合代码阅读' },
  ];
  return fonts;
};

/**
 * WebView 字体栈映射
 * 将字体 key 转换为 CSS font-family 字符串
 * 使用字体栈确保跨平台兼容性
 */
export const WEBVIEW_FONT_STACKS: Record<string, string> = {
  // 系统默认 - 最安全的跨平台方案
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  
  // 衬线体 - 适合英文长篇阅读
  serif: 'Georgia, "Iowan Old Style", "Droid Serif", "Noto Serif", "Times New Roman", serif',
  
  // 无衬线体 - 现代简洁
  sansSerif: '"Helvetica Neue", Helvetica, Roboto, "Segoe UI", Arial, sans-serif',
  
  // 中文优化 - 苹方/思源黑体
  chinese: '"PingFang SC", "Noto Sans CJK SC", "Heiti SC", "Microsoft YaHei", sans-serif',
  
  // 等宽字体 - 代码/技术文章
  monospace: '"SF Mono", "Roboto Mono", Menlo, Consolas, "Courier New", monospace',
};

/**
 * 根据字体 key 获取 WebView 使用的 CSS font-family 字符串
 * @param fontKey 字体选项的 key
 * @returns CSS font-family 字符串
 */
export const getFontStackForWebView = (fontKey: string): string => {
  return WEBVIEW_FONT_STACKS[fontKey] || WEBVIEW_FONT_STACKS.system;
};

export default {
  typography,
  readingTypography,
  fontFamilies,
  fontWeights,
  lineHeights,
  letterSpacing,
  fontSizeOptions,
  lineHeightOptions,
  adjustTypography,
  getPlatformFont,
  getAvailableFonts,
  WEBVIEW_FONT_STACKS,
  getFontStackForWebView,
};