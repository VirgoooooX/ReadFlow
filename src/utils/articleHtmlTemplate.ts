/**
 * HTML 模板生成器
 * 用于 WebView 渲染文章内容，包含样式和交互脚本
 */

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
    vocabularyWords = []
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

  // 【新增】优化1：图片懐加载 - 处理内容添加loading="lazy"属性
  // 将 <img src="..."> 替换为 <img loading="lazy" src="...">
  const optimizedContent = content.replace(/<img\s+/gi, '<img loading="lazy" ');

  // CSS 样式 - 优化英文排版和图片说明
  const css = `
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
      color: ${colors.text};
      background-color: ${colors.background};
      /* 增加最大宽度，优化平板阅读体验 */
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      padding-bottom: 80px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      
      /* 【关键修改】初始隐藏 body，避免闪烁和跳动 */
      opacity: 0;
      transition: opacity 0.25s ease-in;
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
      color: ${colors.text};
      letter-spacing: -0.02em;
    }

    .sub-title {
      font-size: 1.2em;
      font-weight: 400;
      line-height: 1.5;
      margin: 0 0 16px 0;
      color: ${colors.secondaryText};
      font-family: ${fontFamily};
    }

    .meta-info {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      font-size: 0.9em;
      color: ${colors.secondaryText};
      margin-bottom: 24px;
      font-family: sans-serif;
    }

    .meta-item {
      margin-right: 12px;
    }
  
    .meta-item.source {
      font-weight: 600;
      color: ${colors.link};
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
      background-color: ${colors.tableBorder};
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
      color: ${colors.text};
    }
    
    h1 { font-size: 1.8em; }
    h2 { font-size: 1.6em; }
    h3 { font-size: 1.4em; }
    h4 { font-size: 1.2em; }
    h5 { font-size: 1.1em; }
    h6 { font-size: 1.0em; }
    
    .article-content {
      /* 正文容器 */
    }
    
    /* 强调 */
    strong, b {
      font-weight: 700;
      color: ${colors.strong};
    }
    
    em, i {
      font-style: italic;
    }
    
    /* 链接优化 */
    a {
      color: ${colors.link};
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
      padding: 16px 20px;
      background-color: ${colors.blockquoteBg};
      border-left: 4px solid ${colors.blockquoteBorder};
      border-radius: 4px;
      font-family: "Georgia", serif;
      font-style: italic;
      color: ${colors.text};
    }
    
    blockquote p {
      margin: 0.5em 0;
    }
    
    /* 代码 */
    code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 0.9em;
      background-color: ${colors.codeBg};
      color: ${colors.codeText};
      padding: 2px 6px;
      border-radius: 4px;
    }
    
    pre {
      margin: 1.5em 0;
      padding: 12px;
      background-color: ${colors.codeBg};
      border-radius: 8px;
      overflow-x: auto;
    }
    
    pre code {
      padding: 0;
      background-color: transparent;
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
      border: 1px solid ${colors.tableBorder};
      text-align: left;
    }
    
    th {
      background-color: ${colors.tableHeaderBg};
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
      color: ${colors.caption}; /* 灰色 */
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
      color: ${colors.caption};
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
      color: ${colors.caption};
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
       background-color: ${colors.background};
    }
    
    .gallery-card img {
       width: 100%;
       border-radius: 6px;
    }
    
    .gallery-card .caption {
       margin-top: 8px;
       padding: 0 4px;
       font-size: 0.9em;
       color: ${colors.caption};
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
    
      function formatImagesAndCaptions() {
        const contentDiv = document.querySelector('.article-content');
        if (!contentDiv) return;

        // 1. 先处理 figcaption，标记已有说明的图片
        const figcaptions = contentDiv.querySelectorAll('figcaption');
        const imagesWithCaption = new Set();
        
        figcaptions.forEach(function(figcaption) {
          // 找到 figcaption 对应的图片
          const figure = figcaption.closest('figure');
          if (figure) {
            const img = figure.querySelector('img');
            if (img) {
              imagesWithCaption.add(img);
            }
          }
        });

        // 2. 处理所有图片
        const images = contentDiv.querySelectorAll('img');
      
        images.forEach(function(img) {
          // 检查图片是否已有说明（通过 figcaption）
          if (imagesWithCaption.has(img)) {
            // 已有 figcaption，不需要额外处理
            // 保留 alt 属性不删除，给盲人用户用（屏幕阅读器）
            // WebView 会自动处理：若图片加载成功，alt 对普通用户不可见
            return;
          }
          
          // 【关键修改】优先级策略：不主动提取 alt 属性显示
          // 原因：
          // 1. 如果有 figcaption，我们已经在上面处理过了
          // 2. 如果有接在图片后的 P 标签（通常是 RSS 源解析出来的说明），我们也处理过了
          // 3. alt 属性是「备选文本」，只在以下场景使用：
          //    - 图片加载失败时（浏览器显示）
          //    - 盲人用户开启屏幕阅读器时（读屏软件读出）
          // 4. 不应该主动把 alt 内容提取成 DOM 元素显示，避免与 figcaption 重复
          // 
          // 「可选优化」如果想为文本模式的内容生成说明（比如从第三方 API 获取的 JSON）：
          // 可以在后端处理时就生成好 figcaption，而不是在前端提取 alt
          
          // 【新增】图片点击放大 - 添加点击事件监听
          img.addEventListener('click', function(e) {
            e.stopPropagation(); // 阻止冒泡，防止触发查词
            e.preventDefault();
          
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'imageClick',
              url: img.src
            }));
          });
        });
      }
      
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
            link.innerHTML = '<span class="icon">▶</span><span class="text">' + captionText + '</span>';
            link.target = "_blank";

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
      // 【关键修改】优化4：改为高频节流 + touchend 强制保存
      // ==========================================
      let lastLogTime = 0;
      const THROTTLE_DELAY = 100; // 每 100ms 至少发送一次，保证数据新鲜
      
      // 【新增】计算阅读进度百分比
      function calculateProgress() {
        const scrollTop = window.scrollY || window.pageYOffset;
        const scrollHeight = document.documentElement.scrollHeight;
        const clientHeight = window.innerHeight;
        const maxScroll = scrollHeight - clientHeight;
        if (maxScroll <= 0) return 100;
        return Math.min(100, Math.round((scrollTop / maxScroll) * 100));
      }
      
      // 【新增】检测是否到达底部
      function isAtBottom() {
        const scrollTop = window.scrollY || window.pageYOffset;
        const scrollHeight = document.documentElement.scrollHeight;
        const clientHeight = window.innerHeight;
        return scrollHeight - scrollTop - clientHeight < 50; // 50px 容差
      }
      
      function sendScrollMessage() {
        let y = window.scrollY || window.pageYOffset;
        // 取整，防止小数精度问题
        y = Math.round(y);
        // 修正：负数归零
        y = Math.max(0, y);
        
        // 【新增】计算进度
        const progress = calculateProgress();
        const atBottom = isAtBottom();
        
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'scroll',
          scrollY: y,
          progress: progress,
          isAtBottom: atBottom
        }));
      }
      
      function handleScroll() {
        const now = Date.now();
        // 如果距离上次发送超过了 100ms，立即发送
        if (now - lastLogTime >= THROTTLE_DELAY) {
          sendScrollMessage();
          lastLogTime = now;
        }
      }
      
      // 监听滚动 - 高频节流（100ms）
      window.addEventListener('scroll', handleScroll, { passive: true });
      
      // 【新增】监听触摸结束，额外发送一次，确保手指离开瞬间的位置被记录
      window.addEventListener('touchend', function() {
        setTimeout(sendScrollMessage, 50);
      });
      
      // ==========================================
      // 【新增】底部上滑检测 - 切换下一篇文章
      // ==========================================
      let swipeStartY = 0;
      let swipeStartTime = 0;
      let wasAtBottom = false;
      
      window.addEventListener('touchstart', function(e) {
        swipeStartY = e.touches[0].clientY;
        swipeStartTime = Date.now();
        wasAtBottom = isAtBottom();
      }, { passive: true });
      
      window.addEventListener('touchend', function(e) {
        // 只有当触摸开始时已经在底部才检测上滑
        if (!wasAtBottom) return;
        
        const endY = e.changedTouches[0].clientY;
        const deltaY = swipeStartY - endY; // 向上滑动为正值
        const deltaTime = Date.now() - swipeStartTime;
        
        // 条件：
        // 1. 向上滑动距离超过 80px
        // 2. 滑动速度超过 0.3 (px/ms)
        // 3. 当前仍在底部
        if (deltaY > 80 && deltaTime > 0 && deltaTime < 500 && isAtBottom()) {
          const velocity = deltaY / deltaTime;
          if (velocity > 0.3) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'swipeToNext'
            }));
          }
        }
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
              document.body.style.opacity = '1';
              return;
            }
            // 如果内容高度足够但位置不对，强行滚
            if (document.body.scrollHeight >= targetY + window.innerHeight) {
              window.scrollTo(0, targetY);
            }
            attempts++;
          }, 50);

          // 兜底显示
          setTimeout(function() { document.body.style.opacity = '1'; }, 1000);
        } else {
          document.body.style.opacity = '1';
        }

        // 6. 处理幻灯片容器
        unpackGallery();
              
        // 7. 隐藏底部的链接块
        hideFooterLinks();
              
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

      ${imageUrl ? `
        <div class="hero-image-container">
          <img src="${imageUrl}" class="hero-image" alt="Cover" />
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
<body>
  ${headerHtml}
  <div class="article-content">
    ${optimizedContent}
  </div>
  <script>${javascript}</script>
</body>
</html>
  `.trim();
};
