/**
 * HTML 模板生成器
 * 用于 WebView 渲染文章内容，包含样式和交互脚本
 */

export interface HtmlTemplateOptions {
  content: string;
  fontSize?: number;
  lineHeight?: number;
  isDark?: boolean;
  primaryColor?: string;
  // 元数据字段
  title?: string;
  titleCn?: string;
  sourceName?: string;
  publishedAt?: string;
  author?: string;
  imageUrl?: string;
  // 【新增】直接传入初始滚动位置和生词表
  initialScrollY?: number;
  vocabularyWords?: string[];
}

export const generateArticleHtml = (options: HtmlTemplateOptions): string => {
  const {
    content,
    fontSize = 17, // 稍微调大默认字号，适合英文阅读
    lineHeight = 1.6, // 1.6 是英文阅读的黄金行高
    isDark = false,
    primaryColor = '#3B82F6',
    title = '',
    titleCn = '',
    sourceName = '',
    publishedAt = '',
    author = '',
    imageUrl = '',
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

  // 【新增】优化1：图片懒加载 - 处理内容添加loading="lazy"属性
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
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
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
      font-family: "Georgia", serif; /* 标题使用衬线体更有质感 */
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
      font-family: "Georgia", serif;
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
      font-family: "Georgia", serif;
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
    
    /* 生词高亮 - 淡黄色胶囊样式 */
    .vocabulary-word {
      background-color: ${isDark ? 'rgba(245, 200, 40, 0.25)' : 'rgba(255, 220, 80, 0.4)'};
      color: inherit;
      padding: 2px 6px;
      border-radius: 12px;
      font-weight: 500;
      display: inline-block;
    }
  `;

  // 【关键】将数据直接序列化以便注入 JS，在页面初始化时使用
  const injectedWords = JSON.stringify(vocabularyWords);
  const injectedScrollY = initialScrollY;

  // JavaScript 注入脚本 - 添加图片说明自动识别
  const javascript = `
    (function() {
      'use strict';
    
      function formatImagesAndCaptions() {
        const contentDiv = document.querySelector('.article-content');
        if (!contentDiv) return;

        const images = contentDiv.querySelectorAll('img');
      
        images.forEach(function(img) {
          // 获取图片后的下一个元素
          const nextNode = img.nextElementSibling;
        
          // 判断逻辑：
          // 1. 下一个元素存在
          // 2. 是 P 标签
          // 3. 内容不为空
          // 4. 字数小于 200 (通常 caption 不会太长，避免误判正文)
          if (nextNode && 
              nextNode.tagName === 'P' && 
              nextNode.innerText.trim().length > 0 &&
              nextNode.innerText.length < 200) {
          
            // 标记为图片说明
            nextNode.classList.add('img-caption');
          }
          
          // 【新增】优化3：图片点击放大 - 添加点击事件监听
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
      
      function sendScrollMessage() {
        let y = window.scrollY || window.pageYOffset;
        // 取整，防止小数精度问题
        y = Math.round(y);
        // 修正：负数归零
        y = Math.max(0, y);
        
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'scroll',
          scrollY: y
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
      
        // 2. 立即执行高亮（使用注入的数据），避免延迟
        const initialWords = ${injectedWords};
        if (initialWords && Array.isArray(initialWords) && initialWords.length > 0) {
          window.highlightVocabularyWords(initialWords);
        }

        // 3. 立即恢复滚动位置（使用注入的数据）
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

        // 5. 通知 RN WebView 已准备好（此时内容已经渲染完成）
        setTimeout(function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
        }, 100);
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
