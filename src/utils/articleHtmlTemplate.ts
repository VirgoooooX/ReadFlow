/**
 * HTML 模板生成器
 * 用于 WebView 渲柣文章内容，包含样式和交互脚本
 */

// 防盗链图片域名列表，需要通过代理加载
const ANTI_HOTLINK_DOMAINS = [
  'cdnfile.sspai.com', 'cdn.sspai.com', 'sspai.com',
  's3.ifanr.com', 'images.ifanr.cn', 'ifanr.com',
  'cnbetacdn.com', 'static.cnbetacdn.com',
  'twimg.com', 'pbs.twimg.com',
  'miro.medium.com',
];

/**
 * 检查图片 URL 是否需要代理
 */
function needsProxy(url: string): boolean {
  if (!url || url.startsWith('data:')) return false;
  const urlLower = url.toLowerCase();
  return ANTI_HOTLINK_DOMAINS.some(domain => urlLower.includes(domain));
}

/**
 * 将图片 URL 转换为代理 URL
 */
function toProxyUrl(url: string, proxyServerUrl: string): string {
  if (!url || !proxyServerUrl) return url;
  return `${proxyServerUrl}/api/image?url=${encodeURIComponent(url)}`;
}

/**
 * 替换 HTML 中需要代理的图片 URL
 */
function proxyImagesInHtml(html: string, proxyServerUrl: string): string {
  if (!html || !proxyServerUrl) return html;
  
  // 替换 src 属性中的图片 URL
  return html.replace(/(<img[^>]*\ssrc=["'])([^"']+)(["'][^>]*>)/gi, (match, prefix, url, suffix) => {
    if (needsProxy(url)) {
      return `${prefix}${toProxyUrl(url, proxyServerUrl)}${suffix}`;
    }
    return match;
  });
}

export interface HtmlTemplateOptions {
  content: string;
  fontSize?: number;
  lineHeight?: number;
  fontFamily?: string;  // 新增：CSS font-family 字符串
  isDark?: boolean;
  primaryColor?: string;
  // 元数据字段
  title?: string;
  titleCn?: string;
  sourceName?: string;
  publishedAt?: string;
  author?: string;
  imageUrl?: string;
  imageCaption?: string;    // 【新增】图片说明
  imageCredit?: string;      // 【新增】图片来源/版权
  articleUrl?: string;       // 【新增】文章原始链接，用于视频跳转
  // 【新增】直接传入初始滚动位置和生词表
  initialScrollY?: number;
  vocabularyWords?: string[];
  // 【新增】代理服务器地址，用于处理防盗链图片
  proxyServerUrl?: string;
}

export const generateArticleHtml = (options: HtmlTemplateOptions): string => {
  const {
    content,
    fontSize = 17, // 稍微调大默认字号，適合英文阅读
    lineHeight = 1.6, // 1.6 是英文阅读的黄金行高
    fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', // 默认系统字体
    isDark = false,
    primaryColor = '#3B82F6',
    title = '',
    titleCn = '',
    sourceName = '',
    publishedAt = '',
    author = '',
    imageUrl = '',
    imageCaption = '', // 【新增】图片说明
    imageCredit = '',  // 【新增】图片来源
    articleUrl = '',   // 【新增】文章原始链接
    // 【新增】默认值
    initialScrollY = 0,
    vocabularyWords = [],
    proxyServerUrl = ''  // 【新增】代理服务器地址
  } = options;

  // 主题色配置 - 优化了颜色方案
  const colors = {
    text: isDark ? '#E6E1E5' : '#202124', // 使用稍微柔和一点的黑色
    secondaryText: isDark ? '#CAC4D0' : '#5F6368',
    background: isDark ? '#1C1B1F' : '#FFFFFF',
    strong: isDark ? '#FFFFFF' : '#202124',
    link: primaryColor,
    blockquoteBg: isDark ? '#2B2930' : '#F1F3F4',
    blockquoteBorder: primaryColor,
    codeBg: isDark ? '#2B2930' : '#F5F5F5',
    codeText: isDark ? '#E6E1E5' : '#1C1B1F',
    tableBorder: isDark ? '#49454F' : '#E0E0E0',
    tableHeaderBg: isDark ? '#2B2930' : '#F8F9FA',
    caption: isDark ? '#999999' : '#666666', // 图片说明颜色
  };

  // 构建标题下方的图片说明 HTML
  const imageCaptionHtml = imageCaption ? `<div class="hero-image-caption">${imageCaption}</div>` : '';
  const imageCreditHtml = imageCredit ? `<div class="hero-image-credit">${imageCredit}</div>` : '';

  // 【新增】优化1：图片懒加载 - 处理内容添加loading="lazy"属性
  let optimizedContent = content.replace(/<img\s+/gi, '<img loading="lazy" ');

  // 【新增】处理防盗链图片：将需要代理的图片 URL 替换为代理 URL
  if (proxyServerUrl) {
    optimizedContent = proxyImagesInHtml(optimizedContent, proxyServerUrl);
  }

  // 处理封面图片的代理
  let proxiedImageUrl = imageUrl || '';
  if (proxyServerUrl && imageUrl && needsProxy(imageUrl)) {
    proxiedImageUrl = toProxyUrl(imageUrl, proxyServerUrl);
  }

  // CSS 样式 - 优化英文排版和图片说明
  const css = `
    /* 【优化】CSS 变量，支持动态换肤 */
    :root {
      --color-text: ${colors.text};
      --color-bg: ${colors.background};
      --color-secondary: ${colors.secondaryText};
      --color-strong: ${colors.strong};
      --color-link: ${colors.link};
      --color-blockquote-bg: ${colors.blockquoteBg};
      --color-blockquote-border: ${colors.blockquoteBorder};
      --color-code-bg: ${colors.codeBg};
      --color-code-text: ${colors.codeText};
      --color-table-border: ${colors.tableBorder};
      --color-table-header-bg: ${colors.tableHeaderBg};
      --color-caption: ${colors.caption};
    }
    
    * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
    }
    
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      overflow-x: hidden;
      -webkit-text-size-adjust: 100%;
    }
    
    body {
      font-family: ${fontFamily};
      font-size: ${fontSize}px;
      line-height: ${lineHeight};
      color: var(--color-text);
      background-color: var(--color-bg);
      /* 增加最大宽度，优化平板阅读体验 */
      max-width: 800px;
      margin: 0 auto;
      /* 【优化】Safe Area 适配 */
      padding-left: max(20px, env(safe-area-inset-left));
      padding-right: max(20px, env(safe-area-inset-right));
      padding-top: max(20px, env(safe-area-inset-top));
      padding-bottom: calc(80px + env(safe-area-inset-bottom));
      word-wrap: break-word;
      overflow-wrap: break-word;
      
      /* 【紧急修复】直接显示，不依赖 JavaScript */
      opacity: 1 !important;
    }
    
    /* 文章头部样式优化 */
    .article-header {
      margin-bottom: 32px;
    }

    .main-title {
      font-family: ${fontFamily};
      font-size: 1.6em;
      font-weight: 700;
      line-height: 1.25;
      margin: 0 0 12px 0;
      color: var(--color-text);
      letter-spacing: -0.02em;
    }

    .sub-title {
      font-size: 1.2em;
      font-weight: 400;
      line-height: 1.5;
      margin: 0 0 16px 0;
      color: var(--color-secondary);
      font-family: ${fontFamily};
    }

    .meta-info {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      font-size: 0.9em;
      color: var(--color-secondary);
      margin-bottom: 24px;
      font-family: sans-serif;
    }

    .meta-item {
      margin-right: 12px;
    }
  
    .meta-item.source {
      font-weight: 600;
      color: var(--color-link);
    }

    .hero-image-container {
      width: 100%;
      margin: 24px 0;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    .hero-image {
      width: 100%;
      height: auto;
      display: block;
      margin: 0 !important;
      border-radius: 0 !important;
    }

    .header-divider {
      border: none;
      height: 1px;
      background-color: var(--color-table-border);
      margin: 0 0 32px 0;
      opacity: 0.6;
    }
    
    /* 正文排版优化 - 英文左对齐 */
    p {
      margin: 0 0 1.5em 0;
      /* 英文阅读左对齐比两端对齐更舒适，避免单词间距拉大 */
      text-align: left;
    }
    
    /* 正文标题 */
    h1, h2, h3, h4, h5, h6 {
      font-family: ${fontFamily};
      margin: 2em 0 0.8em 0;
      font-weight: 700;
      line-height: 1.3;
      color: var(--color-text);
    }
    
    h1 { font-size: 1.4em; }
    h2 { font-size: 1.3em; }
    h3 { font-size: 1.2em; }
    h4 { font-size: 1.1em; }
    h5 { font-size: 1.0em; }
    h6 { font-size: 0.95em; }
    
    .article-content {
      /* 正文容器 */
    }
    
    /* 强调 */
    strong, b {
      font-weight: 700;
      color: var(--color-strong);
    }
    
    em, i {
      font-style: italic;
    }
    
    /* 链接优化 */
    a {
      color: var(--color-link);
      text-decoration: none;
      border-bottom: 1px solid rgba(59, 130, 246, 0.3);
      padding-bottom: 1px;
    }
    
    a:active {
      opacity: 0.7;
    }
    
    /* 图片 */
    img {
      max-width: 100% !important;
      height: auto !important;
      border-radius: 8px;
      display: block;
      /* 底部留小一点边距，为了贴近说明文字 */
      margin: 32px auto 12px auto;
    }
    
    /* 视频优化 - 自适应宽度和圆角 */
    .video-container {
      position: relative;
      width: 100%;
      max-width: 100%;
      margin: 24px 0;
      border-radius: 12px;
      overflow: hidden;
      background-color: #000;
    }
    
    .video-container video {
      width: 100%;
      height: auto;
      display: block;
      border-radius: 0;
      margin: 0;
    }
    
    /* 视频暂停覆盖层 */
    .video-paused-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.3);
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
    }
    
    .video-container.is-paused .video-paused-overlay {
      opacity: 1;
    }
    
    video {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 24px 0;
      display: block;
    }
    
    /* 列表 */
    ul, ol {
      margin: 1em 0;
      padding-left: 24px;
    }
    
    li {
      margin-bottom: 8px;
    }
    
    li p {
      margin: 0.5em 0;
    }
    
    /* 引用块优化 */
    blockquote {
      margin: 2em 0;
      padding: 10px 10px;
      background-color: var(--color-blockquote-bg);
      border-left: 3px solid var(--color-blockquote-border);
      border-radius: 8px;
      font-style: normal;
      line-height: 1.75;
      color: var(--color-text);
    }
    
    blockquote p {
      margin: 0.8em 0;
    }

    blockquote > :first-child {
      margin-top: 0;
    }

    blockquote > :last-child {
      margin-bottom: 0;
    }

    blockquote cite,
    blockquote footer {
      display: block;
      margin-top: 12px;
      font-size: 0.85em;
      color: var(--color-secondary);
      text-align: right;
    }
    
    /* 代码 */
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 0.9em;
      background-color: var(--color-code-bg);
      color: var(--color-code-text);
      padding: 2px 6px;
      border-radius: 4px;
      overflow-wrap: anywhere;
      word-break: break-word;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }

    pre {
      margin: 1.5em 0;
      padding: 12px;
      background-color: var(--color-code-bg);
      border-radius: 8px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      border: 1px solid var(--color-table-border);
      line-height: 1.5;
      tab-size: 2;
    }

    pre code {
      padding: 0;
      background-color: transparent;
      overflow-wrap: normal;
      word-break: normal;
      -webkit-box-decoration-break: slice;
      box-decoration-break: slice;
    }
    
    /* 表格 */
    table {
      width: 100%;
      margin: 1.5em 0;
      border-collapse: collapse;
      border: 1px solid ${colors.tableBorder};
      border-radius: 8px;
      overflow: hidden;
    }
    
    th, td {
      padding: 10px;
      border: 1px solid var(--color-table-border);
      text-align: left;
    }
    
    th {
      background-color: var(--color-table-header-bg);
      font-weight: 700;
    }
    
    /* 水平线 */
    hr {
      margin: 2em 0;
      border: none;
      border-top: 1px solid ${colors.tableBorder};
    }
    
    /* 【新增】图片说明文字样式 */
    .img-caption {
      font-size: 0.85em; /* 字号更小 */
      line-height: 1.4;
      color: var(--color-caption); /* 灰色 */
      text-align: center; /* 居中对齐 */
      margin-top: -4px; /* 向上拉近与图片的距离 */
      margin-bottom: 32px; /* 与下方正文拉开距离 */
      padding: 0 16px;
      font-family: -apple-system, sans-serif; /* 说明文字用无衬线体 */
    }
    
    /* figure 和 figcaption 标准样式 - 优化视觉层次 */
    figure {
      margin: 24px 0 32px 0;
      padding: 0;
    }
    
    figure img {
      margin-bottom: 12px !important; /* 覆盖默认的 img margin */
      border-radius: 8px;
    }
    
    /* 图片说明：第二层级，中等字号，居中，灰色 */
    figcaption {
      font-size: 0.9em;
      line-height: 1.5;
      color: var(--color-caption);
      text-align: center;
      padding: 8px 16px;
      margin: 0 0 8px 0;
      font-family: -apple-system, sans-serif;
      /* 添加左侧竖线装饰，增加引用感 */
      border-left: 3px solid ${isDark ? '#555' : '#ddd'};
      text-align: left;
      margin-left: 8px;
      padding-left: 12px;
      font-style: italic;
    }
    
    /* 【关键】BBC 等网站的版权信息通常放在 figure 下的 span 里 */
    /* 第三层级：最小字号，最浅颜色，右对齐 */
    figure span {
      display: block;
      font-size: 0.7em; /* 更小，约 11px */
      color: ${isDark ? '#777' : '#aaa'}; /* 更浅 */
      margin-top: 0;
      margin-bottom: 4px;
      text-transform: uppercase;
      text-align: right;
      letter-spacing: 0.8px;
      padding: 0 16px;
      font-weight: 500;
    }
    
    /* 如果版权 span 在 figcaption 内部 */
    figcaption span {
      display: block;
      font-size: 0.8em;
      color: ${isDark ? '#777' : '#aaa'};
      margin-top: 8px;
      text-transform: uppercase;
      text-align: right;
      letter-spacing: 0.8px;
      font-style: normal; /* 版权不用斜体 */
      border-left: none;
      padding-left: 0;
    }
    
    /* 【关键】隐藏占位图和无用图片 */
    /* BBC 等网站常用 placeholder 图片，需要隐藏 */
    img[src*="placeholder"],
    img[src*="loading"],
    img[alt="loading"],
    img.hide-when-no-script,
    img[data-src] {
      display: none !important;
    }
    
    /* 图片来源/版权信息样式 */
    .img-credit {
      font-size: 0.75em;
      color: ${isDark ? '#888' : '#999'};
      font-style: italic;
      margin-top: 4px;
      text-align: right;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    /* 文章头部的图片说明 */
    .hero-image-caption {
      font-size: 0.85em;
      line-height: 1.4;
      color: var(--color-caption);
      text-align: center;
      margin-top: 8px;
      margin-bottom: 8px;
      padding: 0 8px;
      font-family: -apple-system, sans-serif;
      font-style: normal;
    }
    
    .hero-image-credit {
      font-size: 0.75em;
      color: ${isDark ? '#888' : '#999'};
      text-align: right;
      text-transform: uppercase;
      margin-top: 4px;
      margin-bottom: 24px;
      padding: 0 8px;
      letter-spacing: 0.5px;
    }

    
    /* 生词高亮 - 淡黄色胶囊样式 */
    .vocabulary-word {
      background-color: ${isDark ? 'rgba(245, 200, 40, 0.25)' : 'rgba(255, 220, 80, 0.4)'};
      color: inherit;
      padding: 2px 6px;
      border-radius: 12px;
      font-weight: 500;
      display: inline-block;
    }
    
    /* ================================================== */
    /* 【新增】BBC 视频处理：隐藏坏掉的视频框 + 视频链接卡片 */
    /* ================================================== */
    
    /* 1. 彻底隐藏坏掉的 SVG 视频框 (BBC 等网站的视频占位符) */
    div[data-component="video-block"], 
    div[data-testid="fabl-video-container"],
    div[class*="VideoContainer"],
    div[class*="MediaPlayer"] {
      display: none !important;
    }
    
    /* 2. 隐藏 BBC 的链接块 (相关阅读/外链推荐) */
    div[data-component="links-block"] {
      display: none !important;
    }
    
    /* 2. 生成的视频卡片样式 */
    .generated-video-card {
      display: flex;
      align-items: center;
      background-color: ${isDark ? '#2B2930' : '#f0f0f0'};
      border-left: 5px solid #cc0000; /* BBC Red */
      padding: 12px;
      margin: 20px 0;
      text-decoration: none;
      color: ${isDark ? '#E6E1E5' : '#333'};
      border-radius: 4px;
      -webkit-tap-highlight-color: rgba(0,0,0,0.1);
      transition: background-color 0.2s;
    }
    
    .generated-video-card:hover {
      background-color: ${isDark ? '#36343B' : '#e0e0e0'};
    }
    
    .generated-video-card .icon {
      font-size: 20px;
      margin-right: 12px;
      color: #cc0000;
      flex-shrink: 0;
    }
    
    .generated-video-card .text {
      font-weight: 600;
      font-size: 15px;
      line-height: 1.4;
    }
    
    /* 3. 视频链接卡片的提示文字 */
    .video-link-hint {
      font-size: 12px;
      color: ${isDark ? '#999' : '#666'};
      margin-top: 4px;
      font-weight: normal;
    }
    
    /* =========================================
       幻灯片拆解样式 (Unpacked Gallery)
       ========================================= */
    /* 隐藏掉常见的无用元素 (通用黑名单) */
    .hide-when-no-script, 
    [aria-hidden="true"], 
    [class*="placeholder"],
    [class*="arrow"],
    [class*="control"],
    [class*="pagination"],
    [class*="indicator"] {
       display: none !important;
    }
    
    /* 拆解后的卡片样式 */
    .gallery-card {
       margin-bottom: 32px;
       background-color: var(--color-bg);
    }
    
    .gallery-card img {
       width: 100%;
       border-radius: 6px;
    }
    
    .gallery-card .caption {
       margin-top: 8px;
       padding: 0 4px;
       font-size: 0.9em;
       color: var(--color-caption);
       line-height: 1.4;
       border-left: 3px solid ${isDark ? '#444' : '#eee'}; /* 左侧装饰线 */
       padding-left: 10px;
    }
  `;

  // 【关键】将数据直接序列化以便注入 JS，在页面初始化时使用
  const injectedWords = JSON.stringify(vocabularyWords);
  const injectedScrollY = initialScrollY;
  const injectedArticleUrl = JSON.stringify(articleUrl);

  // JavaScript 注入脚本 - 添加图片说明自动识别
  // 【设计原则】
  // 遵循 Web 标准和可访问性（A11y）最佳实践：
  // 1. figcaption - 给所有用户显示（视觉内容）
  // 2. alt 属性 - 给盲人用户和失败情况使用（隐形备选文本）
  // 3. 不主动提取 alt 到 DOM - 避免与 figcaption 重复
  // 详见：https://www.w3.org/WAI/tutorials/images/
  const javascript = `
    (function() {
      'use strict';
    
      /**
       * 图片说明智能提取脚本 v5.0 (高性能读写分离版)
       * 
       * 【性能优化策略】
       * ✅ 读写分离：先收集所有候选者 (Read)，再一次性修改 DOM (Write)
       * ✅ 批处理：彻底消除布局抖动 (Layout Thrashing)
       * ✅ requestAnimationFrame：保证视觉流畅，无闪烁
       * ✅ 延迟启动：优先首屏加载，后台悄悄处理图片说明
       * 
       * 【三层判定漏斗】
       * 1️⃣ 显式样式特征：居中对齐 (style="text-align:center" / align="center")
       * 2️⃣ 显式格式特征：括号包裹 + VIP 强特征 (图、表、摄、Credit...)
       * 3️⃣ 隐式排版特征：短文本 + 无终止标点 (十一重防御机制)
       */
      function formatImagesAndCaptions() {
        const CONTAINER_SELECTOR = '.article-content';
        const contentDiv = document.querySelector(CONTAINER_SELECTOR);
        if (!contentDiv) return;

        // 正则配置
        const REGEX = {
          VIP_START: /^(图|表|Figure|Fig|Source|来源|图自|Credit|Photo|Image|Via|Courtesy|摄|摄影|Author|By)[\s\d:：.]/i,
          VIP_BRACKETS: /^[（(].+[）)]$/,
          BLOCK_META: /^(责任编辑|校对|Posted by|Published on)[:：]/i,
          BLOCK_DATE: /^(\d{4}[-/年]\d{1,2})|(\d{1,2}:\d{2})/,
          BLOCK_ACTION: /(点击|长按|关注|分享|View on|Advertisement|广告)/i,
          BLOCK_NAV: /^(Next|Prev|Top|Back|Menu|Home|Login|\d+)$/i,
          END_PUNCTUATION: /[.!?。！？]$/
        };

        const processedImages = new Set();
        contentDiv.querySelectorAll('figure img').forEach(img => processedImages.add(img));
        const allParagraphs = contentDiv.querySelectorAll('p');

        // ============================================================
        // 阶段一：收集 (READ ONLY)
        // 只读取属性和样式，绝不修改 DOM
        // ============================================================
        const candidates = [];

        allParagraphs.forEach(function(imgPara) {
          const img = imgPara.querySelector('img');
          if (!img || processedImages.has(img)) return;
          
          // 🔥 防止破坏图文混排（如果 P 标签里文字太多，就不碰）
          if (imgPara.innerText.replace(/\s/g, '').length > 10) return;

          const nextPara = imgPara.nextElementSibling;
          if (!nextPara || nextPara.tagName !== 'P' || nextPara.querySelector('img')) return;

          const captionText = nextPara.innerText.trim();
          if (!captionText) return;

          // --- 逻辑判定开始 ---
          
          // 【步骤 1】黑名单初筛
          if (REGEX.BLOCK_META.test(captionText) || 
              REGEX.BLOCK_DATE.test(captionText) || 
              REGEX.BLOCK_ACTION.test(captionText) ||
              REGEX.BLOCK_NAV.test(captionText)) return;

          // 【步骤 2】特征提取
          const isCenterAligned = 
              (nextPara.getAttribute('style') || '').includes('text-align: center') ||
              nextPara.getAttribute('align') === 'center';
          
          const isVipFormat = 
              REGEX.VIP_START.test(captionText) || 
              REGEX.VIP_BRACKETS.test(captionText) ||
              isCenterAligned;

          let isValid = false;

          // 【步骤 3】双通道判定
          if (isVipFormat) {
            // ➤ VIP 通道（强特征）
            if (captionText.length >= 2) isValid = true;
          } else {
            // ➤ 普通通道（弱特征）- 严格检查
            
            // A. 结构检查
            if (nextPara.querySelector('strong, b, a, h1, h2, h3, h4, h5, h6')) return;
            
            // B. 引导词检查
            if (/[：:，,]$/.test(captionText)) return;

            // C. 长度检查
            const hasChinese = /[\u4e00-\u9fa5]/.test(captionText);
            const minLength = hasChinese ? 2 : 5;
            if (captionText.length < minLength || captionText.length > 60) return;

            // D. 标点检查
            if (REGEX.END_PUNCTUATION.test(captionText)) return;

            // E. 🔥 字号与样式检测（性能优化：放在最后）
            // 注意：即使这里调用 getComputedStyle，也不会触发重排
            // 因为我们还没有修改 DOM，浏览器会使用缓存的布局信息
            const computedStyle = window.getComputedStyle(nextPara);
            const fontSize = parseFloat(computedStyle.fontSize);
            const fontWeight = computedStyle.fontWeight;
            
            if (fontSize > 20) return;
            if (fontWeight === 'bold' || parseInt(fontWeight) > 700) return;

            isValid = true;
          }

          if (isValid) {
            // 💾 存入待处理列表，先不动 DOM
            candidates.push({
              imgPara: imgPara,
              nextPara: nextPara,
              img: img,
              captionText: captionText
            });
          }
        });

        // ============================================================
        // 阶段二：执行 (WRITE ONLY)
        // 集中修改 DOM，触发一次重排
        // ============================================================
        if (candidates.length === 0) return;

        // 使用 requestAnimationFrame 确保在下一帧渲染前执行，避免卡顿
        window.requestAnimationFrame(() => {
          candidates.forEach(task => {
            // 再次检查节点是否还在 DOM 中（防止极端情况）
            if (!task.imgPara.parentNode || !task.nextPara.parentNode) return;

            const figure = document.createElement('figure');
            figure.appendChild(task.img);
          
            const figcaption = document.createElement('figcaption');
            figcaption.textContent = task.captionText;
            figure.appendChild(figcaption);

            task.imgPara.parentNode.insertBefore(figure, task.imgPara);
            task.nextPara.remove();
          
            if (task.imgPara.innerText.trim() === '') {
              task.imgPara.remove();
            }
          });
        
          if (candidates.length > 0) {
            console.log('[CaptionExtractor v5.0] 已优化 ' + candidates.length + ' 张图片说明');
          }
        });
      }
    
      // 初始化执行
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', formatImagesAndCaptions);
      } else {
        // 🔥 延迟启动：优先首屏加载，后台悄悄处理图片说明
        setTimeout(formatImagesAndCaptions, 100);
      }
      
      // 【修复】图片点击事件代理 - 移到 init() 或 DOMContentLoaded 后执行
      // 防止在 DOM 未就绪时访问 .article-content 导致报错
      
      // 【新增】视频优化：包裹视频并添加可见性检测
      function setupVideos() {
        const videos = document.querySelectorAll('video');
        if (videos.length === 0) return;
        
        // 记录当前正在播放的视频
        let currentPlayingVideo = null;
        
        videos.forEach(function(video) {
          // 1. 如果视频还没有被包裹，创建容器
          if (!video.parentElement.classList.contains('video-container')) {
            const container = document.createElement('div');
            container.className = 'video-container';
            video.parentNode.insertBefore(container, video);
            container.appendChild(video);
          }
          
          // 2. 设置视频属性
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.setAttribute('preload', 'metadata');
          
          // 3. 监听播放事件 - 暂停其他视频
          video.addEventListener('play', function() {
            video.parentElement.classList.remove('is-paused');
            
            // 如果有其他视频正在播放，先暂停它
            if (currentPlayingVideo && currentPlayingVideo !== video) {
              currentPlayingVideo.pause();
            }
            currentPlayingVideo = video;
          });
          
          // 4. 监听暂停事件
          video.addEventListener('pause', function() {
            video.parentElement.classList.add('is-paused');
            if (currentPlayingVideo === video) {
              currentPlayingVideo = null;
            }
          });
        });
        
        // 5. 使用 Intersection Observer 检测视频可见性
        if ('IntersectionObserver' in window) {
          const videoObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
              const video = entry.target.querySelector('video');
              if (!video) return;
              
              if (!entry.isIntersecting) {
                // 视频划出可视范围，暂停播放
                if (!video.paused) {
                  video.pause();
                  video.dataset.autoPaused = 'true'; // 标记为自动暂停
                }
              }
              // 注意：不自动恢复播放，让用户手动控制
            });
          }, {
            threshold: 0.3, // 当视频可见度低于 30% 时触发
            rootMargin: '50px' // 提前 50px 检测
          });
          
          // 观察所有视频容器
          document.querySelectorAll('.video-container').forEach(function(container) {
            videoObserver.observe(container);
          });
        }
      }
    
      // 【新增】处理 BBC 等网站的视频链接卡片
      // 基于 DOM 结构特征而非文本特征，更加通用和健壮
      function processVideoLinks(articleUrl) {
        try {
          const contentDiv = document.querySelector('.article-content');
          if (!contentDiv) return;
          
          // 1. 找到所有视频空壳
          var videoBlocks = contentDiv.querySelectorAll('div[data-component="video-block"]');
        
          videoBlocks.forEach(function(videoBlock) {
            // 2. 尝试找它的邻居（下一个元素）
            var nextSibling = videoBlock.nextElementSibling;
            var captionText = "Watch Video"; // 默认文案
            var foundCaption = false;

            // 检查邻居是不是 caption-block
            if (nextSibling && nextSibling.getAttribute('data-component') === 'caption-block') {
              // 提取 figcaption 里的纯文本
              var figcaption = nextSibling.querySelector('figcaption');
              if (figcaption) {
                captionText = figcaption.innerText.trim();
                foundCaption = true;
              }
            }

            // 3. 创建新的跳转卡片
            var link = document.createElement('a');
            link.href = articleUrl || '#'; // 注入文章原本的链接
            link.className = "generated-video-card";
            link.target = "_blank";
            
            // 【优化】使用 textContent 防止 XSS
            var iconSpan = document.createElement('span');
            iconSpan.className = 'icon';
            iconSpan.textContent = '▶';
            
            var textSpan = document.createElement('span');
            textSpan.className = 'text';
            textSpan.textContent = captionText; // 安全
            
            link.appendChild(iconSpan);
            link.appendChild(textSpan);

            // 4. 替换 DOM
            // 在 videoBlock 的位置插入新链接
            videoBlock.parentNode.insertBefore(link, videoBlock);
          
            // 移除旧的空壳
            videoBlock.remove();
          
            // 如果找到了对应的字幕块，也把它移除（避免重复显示）
            if (foundCaption && nextSibling) {
              nextSibling.remove();
            }
          });
        } catch (error) {
          // 静默处理错误
        }
      }
    
      // 【新增】优化2：防止滑动误触点击
      // 区分"点击查词"和"滑动屏幕"，防止用户滑动时误触发查词
      let isDragging = false;
      let touchStartX = 0;
      let touchStartY = 0;

      // 监听触摸开始
      document.addEventListener('touchstart', function(e) {
        isDragging = false; // 重置状态
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }, {passive: true});

      // 监听触摸移动
      document.addEventListener('touchmove', function(e) {
        const moveX = Math.abs(e.touches[0].clientX - touchStartX);
        const moveY = Math.abs(e.touches[0].clientY - touchStartY);
      
        // 如果移动超过 10px，视为拖拽/滑动
        if (moveX > 10 || moveY > 10) {
          isDragging = true;
        }
      }, {passive: true});
    
      let clickTimeout = null;
      const CLICK_DELAY = 250; 
    
      function isDigit(char) {
        return /[0-9]/.test(char);
      }

      function isRealSentenceDelimiter(text, index) {
        const char = text[index];
      
        if (!/[.!?。！？]/.test(char)) {
          return false;
        }

        if (char === '.') {
          if (index > 0 && index < text.length - 1) {
            const prevChar = text[index - 1];
            const nextChar = text[index + 1];
          
            if (isDigit(prevChar) && isDigit(nextChar)) {
              return false;
            }
          }
        }

        return true;
      }

      function extractSentence(fullText, globalOffset) {
        if (!fullText) return '';
      
        let start = globalOffset;
        let end = globalOffset;
      
        while (start > 0) {
          if (isRealSentenceDelimiter(fullText, start - 1)) {
            break;
          }
          start--;
        }
      
        while (end < fullText.length) {
          const char = fullText[end];
          if (isRealSentenceDelimiter(fullText, end)) {
            end++;
            break; 
          }
          end++;
        }
      
        return fullText.substring(start, end).trim();
      }

      function getContextAtPoint(x, y) {
        try {
          let range, textNode, offset;
          if (document.caretRangeFromPoint) {
            range = document.caretRangeFromPoint(x, y);
          } else if (document.caretPositionFromPoint) {
            const position = document.caretPositionFromPoint(x, y);
            range = document.createRange();
            range.setStart(position.offsetNode, position.offset);
          }
          if (!range) return null;
          textNode = range.startContainer;
          offset = range.startOffset;
          if (textNode.nodeType !== 3) return null;
          const text = textNode.textContent || '';
        
          let wordStart = offset;
          let wordEnd = offset;
          while (wordStart > 0 && /[a-zA-Z0-9'-]/.test(text[wordStart - 1])) { wordStart--; }
          while (wordEnd < text.length && /[a-zA-Z0-9'-]/.test(text[wordEnd])) { wordEnd++; }
          const word = text.substring(wordStart, wordEnd).trim();
        
          let blockParent = textNode.parentElement;
          while (blockParent && window.getComputedStyle(blockParent).display === 'inline') {
            blockParent = blockParent.parentElement;
          }
          if (!blockParent) blockParent = textNode.parentElement;
          const fullParagraphText = blockParent.innerText;
        
          let currentGlobalOffset = 0;
          let foundNode = false;
          function traverse(node) {
            if (foundNode) return;
            if (node === textNode) { foundNode = true; return; }
            if (node.nodeType === 3) { currentGlobalOffset += node.textContent.length; }
            else if (node.childNodes) { node.childNodes.forEach(traverse); }
          }
          traverse(blockParent);
        
          const absoluteOffset = currentGlobalOffset + offset;
          const sentence = extractSentence(fullParagraphText, absoluteOffset);

          return { word, sentence };
        } catch (error) { return null; }
      }
    
      document.addEventListener('click', function(e) {
        // 【修改】添加防误触检查：如果是拖拽操作，或者是链接点击，直接返回
        if (isDragging || e.target.closest('a')) return;
        const result = getContextAtPoint(e.clientX, e.clientY);
        if (!result) return;

        if (clickTimeout) {
          clearTimeout(clickTimeout);
          clickTimeout = null;
          if (result.sentence) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'sentenceDoubleTap',
              sentence: result.sentence
            }));
          }
        } else {
          clickTimeout = setTimeout(function() {
            clickTimeout = null;
            if (result.word && result.word.length > 1) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'wordPress',
                word: result.word,
                sentence: result.sentence
              }));
            }
          }, CLICK_DELAY);
        }
      }, true);
    
      // 【新增】节流函数，避免消息发送过于频繁
      function throttle(func, limit) {
        let inThrottle;
        return function() {
          const args = arguments;
          const context = this;
          if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(function() { inThrottle = false; }, limit);
          }
        };
      }

      // ==========================================
      // 【优化】RAF + 去重方案 - 解决响应慢和进度不一致
      // ==========================================
      let rafId = null;
      let lastSentY = -1;          // 上次发送的 Y 坐标
      let lastSentProgress = -1;   // 上次发送的进度
      let lastIsAtBottom = false;  // 上次发送的底部状态 - 防止重复触发
      
      // 【优化】计算阅读进度百分比 - 基于距离底部的像素值
      function calculateProgress() {
        const scrollTop = window.scrollY || window.pageYOffset;
        const scrollHeight = document.documentElement.scrollHeight;
        const clientHeight = window.innerHeight;
        const maxScroll = scrollHeight - clientHeight;
        
        // 如果内容不足一屏，进度始终为 100%
        if (maxScroll <= 0) return 100;
        
        // 计算基础百分比
        let percentage = (scrollTop / maxScroll) * 100;
        
        // 修正：确保不超过 100，不低于 0
        percentage = Math.min(100, Math.max(0, percentage));
        
        return Math.round(percentage);
      }
      
      // 【核心修改】精准判断是否到达底部 - 基于物理滚动距离
      function isAtBottom() {
        const scrollTop = window.scrollY || window.pageYOffset;
        const scrollHeight = document.documentElement.scrollHeight;
        const clientHeight = window.innerHeight;
        
        // 计算距离底部的物理像素距离
        const distanceToBottom = scrollHeight - scrollTop - clientHeight;
        
        // 【阈值设置】
        // CSS 中 body padding-bottom 约为 80px
        // 设置为 50px 意味着：用户必须滚动进入底部的留白区域，指示器才会出现
        // 这样可以避免"刚看到最后一行字就弹出"的问题
        // 容错处理：distanceToBottom 可能因弹性滚动变成负数，所以要 >= -100
        return distanceToBottom <= 10 && distanceToBottom >= -100;
      }
      
      // 【核心修改】判断是否应该显示"下一篇"提示 - 基于物理滚动距离
      function shouldShowNextHint() {
        const scrollTop = window.scrollY || window.pageYOffset;
        const scrollHeight = document.documentElement.scrollHeight;
        const clientHeight = window.innerHeight;
      
        // 如果内容不满一屏，立即显示
        if (scrollHeight <= clientHeight) return true;
      
        const distanceToBottom = scrollHeight - scrollTop - clientHeight;
      
        // 比 isAtBottom 稍微宽松一点 (60px instead of 50px)
        // 但绝对不使用"元素可见性"判断，那样太早了
        return distanceToBottom <= 60;
      }
      
      function sendScrollMessage() {
        let y = window.scrollY || window.pageYOffset;
        y = Math.max(0, Math.round(y));
      
        const progress = calculateProgress();
        const atBottom = isAtBottom();
        const showHint = shouldShowNextHint();
      
        // 【关键】数据去重：只有当关键状态发生变化时才发送消息
        // 1. 滚动位置变化
        // 2. 进度变化
        // 3. 到底状态变化（这很重要，保证 UI 及时响应）
        if (y === lastSentY && 
            progress === lastSentProgress && 
            atBottom === lastIsAtBottom) {
          return; // 数据没变，不发送
        }
      
        lastSentY = y;
        lastSentProgress = progress;
        lastIsAtBottom = atBottom;
      
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'scroll',
          scrollY: y,
          progress: progress,
          isAtBottom: atBottom,
          shouldShowHint: showHint
        }));
      }
      
      function handleScroll() {
        // 取消之前的 RAF（如果有）
        if (rafId) {
          cancelAnimationFrame(rafId);
        }
        
        // 在下一帧执行（约 16ms，60fps）
        rafId = requestAnimationFrame(function() {
          sendScrollMessage();
          rafId = null;
        });
      }
      
      // 监听滚动
      window.addEventListener('scroll', handleScroll, { passive: true });
      
      // 【新增】监听图片加载，动态更新进度
      function setupImageLoadListener() {
        const images = document.querySelectorAll('img[loading="lazy"], img');
        let loadedCount = 0;
        const totalImages = images.length;
        
        if (totalImages === 0) return;
        
        images.forEach(function(img) {
          // 如果图片已经加载完成
          if (img.complete) {
            loadedCount++;
            return;
          }
          
          // 监听图片加载完成
          img.addEventListener('load', function() {
            loadedCount++;
            
            // 【关键】图片加载后，立即重新计算并发送进度
            // 解决"已到底但进度只有 80%"的问题
            requestAnimationFrame(function() {
              sendScrollMessage();
            });
            
            // 所有图片加载完成后，最终更新一次
            if (loadedCount === totalImages) {
              console.log('[Progress] All images loaded, final update');
              setTimeout(function() {
                sendScrollMessage();
              }, 100);
            }
          }, { once: true }); // 使用 once 避免内存泄漏
          
          // 监听加载失败
          img.addEventListener('error', function() {
            loadedCount++;
          }, { once: true });
        });
      }
      
      // ==========================================
      // 【重写】防误触版：底部上滑检测 - 切换下一篇文章
      // ==========================================
      let swipeStartY = 0;
      let swipeStartX = 0; // 新增：记录X轴，用于计算角度
      let swipeStartTime = 0;
      let isSwipeValidStart = false;
    
      // 记录"到达底部"的时间戳
      let arrivedBottomTime = 0;
      let hasArrivedBottom = false;

      // 在 scroll 事件中更新到达底部的时间戳
      window.addEventListener('scroll', function() {
        const atBottom = isAtBottom(); // 复用上面的判断函数
      
        if (atBottom) {
          if (!hasArrivedBottom) {
            // 状态变更：从"未到底"变成了"到底"
            hasArrivedBottom = true;
            arrivedBottomTime = Date.now(); // 记录到达时刻
          }
        } else {
          hasArrivedBottom = false;
        }
      }, { passive: true });

      window.addEventListener('touchstart', function(e) {
        // 1. 必须已经处于底部
        if (!isAtBottom()) {
          isSwipeValidStart = false;
          return;
        }
      
        // 2. 【核心防护】冷却检查
        // 如果距离"刚到达底部"的时间不足 600ms，说明用户可能正在快速滑动刹车
        // 此时不应该响应新的手势，强制用户"停顿"一下
        const timeSinceArrived = Date.now() - arrivedBottomTime;
        if (timeSinceArrived < 600) {
          isSwipeValidStart = false;
          return;
        }

        swipeStartY = e.touches[0].clientY;
        swipeStartX = e.touches[0].clientX;
        swipeStartTime = Date.now();
        isSwipeValidStart = true;
      }, { passive: true });
    
      window.addEventListener('touchend', function(e) {
        // 如果开始触摸时条件不满足，直接忽略
        if (!isSwipeValidStart) return;
      
        // 再次检查是否还在底部（防止用户先上滑再下滑的操作）
        if (!isAtBottom()) return;
      
        const endY = e.changedTouches[0].clientY;
        const endX = e.changedTouches[0].clientX;
      
        const deltaY = swipeStartY - endY; // 向上滑动为正
        const deltaX = Math.abs(swipeStartX - endX); // 水平移动距离
        const deltaTime = Date.now() - swipeStartTime;
      
        // ============================
        // 【判定条件升级】
        // ============================
      
        // 1. 距离阈值：增加到 150px (原 80px)，需要滑得更長
        const MIN_DISTANCE = 150;
      
        // 2. 时间限制：必须是一个果断的滑动，不能按住拖太久
        const MAX_TIME = 800;
      
        // 3. 【核心防护】角度锁定
        // 垂直移动距离必须是水平移动距离的 2 倍以上
        // 防止用户斜着划动屏幕浏览时误触
        const isVerticalSwipe = deltaY > (deltaX * 2);

        if (deltaY > MIN_DISTANCE && deltaTime < MAX_TIME && isVerticalSwipe) {
          // 发送消息前再次确认冷却时间（双重保险）
          if (Date.now() - arrivedBottomTime > 600) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'swipeToNext'
            }));
          }
        }
      
        // 重置状态
        isSwipeValidStart = false;
      }, { passive: true });

      // 【新增】优化4：提供给 RN 调用的恢复位置函数
      window.restoreScrollPosition = function(y) {
        if (y && typeof y === 'number') {
          window.scrollTo({
            top: y,
            behavior: 'auto' // 使用 auto 瞬间跳转，smooth 会有动画
          });
        }
      };
      
      // 创建一个日志函数来发送消息回 React Native
      window.logToNative = function(type, message) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'debug',
            debugType: type,
            message: String(message)
          }));
        } catch (e) {
          // 忽略发送失败
        }
      };
            
      window.highlightVocabularyWords = function(words) {
        try {
          if (!words || !Array.isArray(words) || words.length === 0) {
            return;
          }
          
          // 1. 清除之前的高亮（防止重复高亮）
          const oldHighlights = document.querySelectorAll('.vocabulary-word');
          oldHighlights.forEach(function(el) {
            const text = el.textContent;
            const textNode = document.createTextNode(text);
            el.parentNode.replaceChild(textNode, el);
          });
          
          // 2. 将单词转为 Set，提高查找效率（大小写不敏感）
          const wordSet = new Set(words.map(function(w) { 
            return (w || '').toLowerCase().trim();
          }).filter(Boolean));
          
          if (wordSet.size === 0) return;
          
          // 3. 仅在文章内容区域内高亮
          const articleContent = document.querySelector('.article-content');
          if (!articleContent) return;
          
          // 4. 创建 TreeWalker 遍历所有文本节点
          const walker = document.createTreeWalker(
            articleContent,
            NodeFilter.SHOW_TEXT,
            null,
            false
          );
          
          const nodesToProcess = [];
          let textNode;
          while (textNode = walker.nextNode()) {
            nodesToProcess.push(textNode);
          }
          
          // 5. 处理每个文本节点
          let totalHighlighted = 0;
          nodesToProcess.forEach(function(currentNode) {
            const text = currentNode.textContent;
            if (!text || text.trim().length === 0) return;
            
            // 使用正则表达式匹配所有单词
            // 【关键修改】改为 /[a-zA-Z0-9'-]+/g ，支持连字符 (well-known) 和撇号 (don't)
            const wordMatches = text.match(/[a-zA-Z0-9'-]+/g);
            if (!wordMatches || wordMatches.length === 0) return;
            
            // 创建容器来保存处理后的内容
            const container = document.createDocumentFragment();
            let lastIndex = 0;
            let nodeHighlightCount = 0;
            
            wordMatches.forEach(function(word) {
              const wordLower = word.toLowerCase();
              const index = text.indexOf(word, lastIndex);
              
              if (index === -1) return;
              
              // 添加匹配前的文本
              if (index > lastIndex) {
                container.appendChild(document.createTextNode(text.substring(lastIndex, index)));
              }
              
              // 检查是否是生词
              if (wordSet.has(wordLower)) {
                const highlightSpan = document.createElement('span');
                highlightSpan.className = 'vocabulary-word';
                highlightSpan.textContent = word;
                container.appendChild(highlightSpan);
                nodeHighlightCount++;
                totalHighlighted++;
              } else {
                container.appendChild(document.createTextNode(word));
              }
              
              lastIndex = index + word.length;
            });
            
            // 添加剩余的文本
            if (lastIndex < text.length) {
              container.appendChild(document.createTextNode(text.substring(lastIndex)));
            }
            
            // 替换原始文本节点
            if (container.childNodes.length > 0 && nodeHighlightCount > 0) {
              currentNode.parentNode.replaceChild(container, currentNode);
            }
          });
        } catch (error) {
          // 失败静静处理
        }
      };
      
      // 【关键修改】初始化逻辑 - 预先处理高亮和滚动位置，然后显示页面
      function init() {
        // 1. 处理图片说明
        formatImagesAndCaptions();
        
        // 2. 设置视频优化（可见性检测、自动暂停）
        setupVideos();
      
        // 3. 处理视频链接卡片
        const articleUrl = ${injectedArticleUrl};
        if (articleUrl) {
          processVideoLinks(articleUrl);
        }
      
        // 4. 立即执行高亮（使用注入的数据），避免延迟
        const initialWords = ${injectedWords};
        if (initialWords && Array.isArray(initialWords) && initialWords.length > 0) {
          window.highlightVocabularyWords(initialWords);
        }
        
        // 【新增】监听图片加载，动态更新进度
        setupImageLoadListener();
        
        // 【修复】图片点击事件代理 - 移到 init() 中确保 DOM 已就绪
        const articleContent = document.querySelector('.article-content');
        if (articleContent) {
          articleContent.addEventListener('click', function(e) {
            if (e.target.tagName === 'IMG') {
              e.stopPropagation();
              e.preventDefault();
              
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'imageClick',
                url: e.target.src
              }));
            }
          });
        }

        // 5. 立即恢复滚动位置（使用注入的数据）
        const targetY = ${injectedScrollY};
        if (targetY > 0 && typeof targetY === 'number') {
          window.scrollTo(0, targetY);
        
          // 【新增】暴力轮询检查 (针对 Android 渲染延迟)
          let attempts = 0;
          const forceScrollInterval = setInterval(function() {
            const currentY = window.scrollY || window.pageYOffset;
            // 如果位置已经接近目标或已尝试 20 次，则停止轮询
            if (Math.abs(currentY - targetY) < 10 || attempts >= 20) {
              clearInterval(forceScrollInterval);
              return;
            }
            // 如果内容高度足够但位置不对，强行滚
            if (document.body.scrollHeight >= targetY + window.innerHeight) {
              window.scrollTo(0, targetY);
            }
            attempts++;
          }, 50);
        }

        // 6. 处理幻灯片容器
        unpackGallery();
              
        // 7. 隐藏底部的链接块
        hideFooterLinks();
        
        // 【新增】监听触摸结束，额外发送一次，确保手指离开瞬间的位置被记录
        window.addEventListener('touchend', function() {
          setTimeout(sendScrollMessage, 100);
        });
              
        // 8. 通知 RN WebView 已准备好（此时内容已经渲染完成）
        setTimeout(function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
        }, 100);
      }
    
      /**
       * 判断一张图片是否是"垃圾图"
       * 通用逻辑：过滤占位图、加载图、极小的图标
       */
      function isJunkImage(img) {
        const src = (img.src || '').toLowerCase();
        const alt = (img.alt || '').toLowerCase();
        const className = (img.className || '').toLowerCase();
        
        // 1. 关键词黑名单
        const keywords = ['placeholder', 'loading', 'loader', 'spinner', 'pixel', 'spacer', 'grey'];
        if (keywords.some(k => src.includes(k) || className.includes(k))) return true;
    
        // 2. BBC 特有特征
        if (className.includes('hide-when-no-script')) return true;
    
        // 3. 尺寸过滤 (防止把 "下一页" 箭头图标当成正文图)
        // 注意：有些图片加载前 width 为 0，所以要结合 naturalWidth 判断
        // 这里主要过滤明确写了 width="1" 这种
        if (img.getAttribute('width') === '1' || img.getAttribute('height') === '1') return true;
        
        return false;
      }
    
      /**
       * 隐藏底部的链接块
       */
      function hideFooterLinks() {
        try {
          // 隐藏 BBC 的 links-block
          const linksBlocks = document.querySelectorAll('div[data-component="links-block"]');
          linksBlocks.forEach(function(block) {
            block.style.display = 'none';
          });
              
          // 通用规则：隐藏常见的底部垃圾信息
          const commonFooterElements = document.querySelectorAll(
            '.related-posts, .read-more, .sharedaddy, .social-buttons, .footer-links'
          );
          commonFooterElements.forEach(function(element) {
            element.style.display = 'none';
          });
        } catch (error) {
          // 静默处理错误
        }
      }
          
      /**
       * 核心逻辑：处理幻灯片容器
       */
      function unpackGallery() {
        // 1. 定义可能的幻灯片容器选择器 (越靠前优先级越高)
        const selectors = [
          'div[data-testid="slideshowWrapper"]', // BBC
          '.slideshow',                          // 通用
          '.gallery',                            // 通用
          '.carousel',                           // Bootstrap 等常用
          '.swiper-container',                   // Swiper 插件
          '.slider',                             // 通用
          '[data-component="slideshow"]'         // 许多 CMS 常用
        ];
    
        // 找到页面上所有可能的容器
        const potentialContainers = document.querySelectorAll(selectors.join(','));
    
        potentialContainers.forEach(function(container) {
          // A. 提取容器内所有图片
          const allImgs = Array.from(container.querySelectorAll('img'));
          const validImages = allImgs.filter(img => !isJunkImage(img));
    
          // 如果容器里有效图片少于2张，可能它不是幻灯片，或者是单图结构，暂不处理，以免误伤
          if (validImages.length < 2) return;
    
          // B. 提取容器内所有字幕
          // 优先找 figcaption，没有的话找 class 带 caption 的元素
          let captions = container.querySelectorAll('figcaption');
          if (captions.length === 0) {
            captions = container.querySelectorAll('.caption, .description, .desc');
          }
    
          // C. 创建新的 DOM 结构
          const newWrapper = document.createElement('div');
          newWrapper.className = 'unpacked-gallery-container';
    
          validImages.forEach(function(img, index) {
            const card = document.createElement('div');
            card.className = 'gallery-card';
    
            // 1. 处理图片
            const imgClone = img.cloneNode(true);
            imgClone.style.display = 'block'; // 强制显示
            imgClone.removeAttribute('loading'); // 移除懒加载属性防止闪烁
            card.appendChild(imgClone);
    
            // 2. 处理字幕 (尝试匹配 index)
            if (captions[index]) {
              const capClone = document.createElement('div');
              capClone.className = 'caption';
              capClone.innerText = captions[index].innerText.trim(); // 只取纯文本，防止样式污染
              
              // 只有当字幕有内容时才添加
              if (capClone.innerText) {
                card.appendChild(capClone);
              }
            }
    
            newWrapper.appendChild(card);
          });
    
          // D. 替换掉原容器
          // 为了安全，我们先把原容器隐藏，插入新容器，而不是直接 remove (防止脚本报错)
          container.style.display = 'none';
          container.parentNode.insertBefore(newWrapper, container);
        });
      }
    
      // 确保 DOM 加载完成后执行初始化
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
      } else {
        window.addEventListener('DOMContentLoaded', init);
      }
    })();
  `;

  // 构建头部 HTML
  const headerHtml = `
    <header class="article-header">
      <h1 class="main-title">${title}</h1>
      ${titleCn ? `<h2 class="sub-title">${titleCn}</h2>` : ''}
    
      <div class="meta-info">
        <span class="meta-item source">${sourceName}</span>
        ${publishedAt ? `<span class="meta-item date">${publishedAt}</span>` : ''}
        ${author ? `<span class="meta-item author">By ${author}</span>` : ''}
      </div>

      ${proxiedImageUrl ? `
        <div class="hero-image-container">
          <img src="${proxiedImageUrl}" class="hero-image" alt="Cover" />
          ${imageCaptionHtml}
          ${imageCreditHtml}
        </div>
      ` : ''}
    </header>
    <hr class="header-divider" />
  `;

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="format-detection" content="telephone=no">
  <style>${css}</style>
</head>
<body style="opacity: 1 !important;">
  ${headerHtml}
  <div class="article-content">
    ${optimizedContent}
  </div>
  <script>${javascript}</script>
</body>
</html>
  `.trim();
};
