import { cleanTextContent } from '../../utils/RSSUtils';
import { SourceParseStrategy } from './types';
import { escapeHtml } from './utils';

interface VoteOption {
  text: string;
  imageUrl?: string;
}

function isXchuxingArticleUrl(urlObj: URL): boolean {
  return urlObj.hostname === 'www.xchuxing.com' && urlObj.pathname.startsWith('/article/');
}

function isXchuxingVideoUrl(urlObj: URL): boolean {
  return urlObj.hostname === 'www.xchuxing.com' && urlObj.pathname.startsWith('/video/');
}

function isXchuxingVoteUrl(urlObj: URL): boolean {
  return urlObj.hostname === 'www.xchuxing.com' && /^\/vote\/\d+/.test(urlObj.pathname);
}

function extractArticleContent(document: Document): string | null {
  const titleEl = document.querySelector('.acticle-bigtitle');
  if (!titleEl) return null;

  const titleText = (titleEl.textContent || '').replace(/\s+/g, ' ').trim();

  const cateEl = document.querySelector('.cate-tags');
  let node: Element | null = cateEl ? cateEl.nextElementSibling : titleEl.nextElementSibling;

  let contentEl: Element | null = null;
  while (node) {
    if (node.tagName.toLowerCase() === 'div') {
      const textLen = (node.textContent || '').replace(/\s+/g, '').trim().length;
      const hasStructured = !!node.querySelector('p,figure,img');
      if (hasStructured && textLen >= 80) {
        contentEl = node;
        break;
      }
    }
    node = node.nextElementSibling;
  }

  if (!contentEl) return null;

  const bodyHtml = (contentEl as HTMLElement).innerHTML?.trim() || '';
  if (bodyHtml.length < 80) return null;

  const titleHtml = titleText ? `<h1>${escapeHtml(titleText)}</h1>` : '';
  return `<article>${titleHtml}${bodyHtml}</article>`;
}

function extractVoteContent(document: Document, rawHtml: string): string | null {
  const h2 = document.querySelector('h2');
  let title = h2 ? (h2.textContent || '').replace(/\s+/g, ' ').trim() : '';
  if (!title) {
    const titleEl = document.querySelector('title');
    const titleText = titleEl ? (titleEl.textContent || '').trim() : '';
    title = titleText.replace(/_投票_新出行$/, '').trim();
  }
  if (!title) return null;

  const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
  let descriptionText = '';
  if (h2) {
    let sibling = h2.nextElementSibling;
    while (sibling) {
      const tag = sibling.tagName.toLowerCase();
      if (tag === 'ul' || tag === 'ol') break;
      const cls = ((sibling as any).getAttribute?.('class') || '').toLowerCase();
      if (cls.includes('vote')) break;
      const text = (sibling.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length > 10 && text.length < 500 && !text.includes('{{')) {
        descriptionText = text;
        break;
      }
      sibling = sibling.nextElementSibling;
    }
  }
  const description = descriptionText || (metaDesc !== title ? metaDesc : '');

  const options: VoteOption[] = [];
  extractVoteOptionsFromDom(document, options);
  if (options.length === 0) {
    extractVoteOptionsFromScripts(rawHtml, options);
  }

  const parts: string[] = ['<article>'];
  parts.push(`<h1>${escapeHtml(title)}</h1>`);
  if (description) {
    parts.push(`<p>${escapeHtml(description)}</p>`);
  }
  if (options.length > 0) {
    parts.push('<ul>');
    for (const opt of options) {
      if (opt.imageUrl) {
        parts.push(`<li><img src="${opt.imageUrl}" alt="${escapeHtml(opt.text)}" /> ${escapeHtml(opt.text)}</li>`);
      } else {
        parts.push(`<li>${escapeHtml(opt.text)}</li>`);
      }
    }
    parts.push('</ul>');
  }
  parts.push('</article>');
  return parts.join('');
}

function extractVoteContentFromRssDescription(rawContent: string): string | null {
  const options = extractVoteOptionsFromText(rawContent);
  if (options.length === 0) return null;

  const parts: string[] = ['<article><ul>'];
  for (const option of options) {
    parts.push(`<li>${escapeHtml(option)}</li>`);
  }
  parts.push('</ul></article>');
  return parts.join('');
}

function extractVoteOptionsFromText(rawContent: string): string[] {
  if (!rawContent || !rawContent.includes('[投票选项]')) return [];

  const text = rawContent
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return text
    .split(/\n+/)
    .map(line => line.replace(/^\s*\[投票选项\]\s*/, '').replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0);
}

function extractVoteOptionsFromDom(document: Document, options: VoteOption[]): void {
  const lists = document.querySelectorAll('ul, ol');
  for (const list of Array.from(lists)) {
    const items = list.querySelectorAll('li');
    if (items.length < 2 || items.length > 15) continue;

    const candidates: VoteOption[] = [];
    let valid = true;
    for (const li of Array.from(items)) {
      const text = (li.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length > 100 || text.length === 0 || text.includes('{{') || /https?:\/\//.test(text)) {
        valid = false;
        break;
      }
      const img = li.querySelector('img');
      const imgSrc = img
        ? ((img.getAttribute('data-src') || img.getAttribute('src') || '').trim() || undefined)
        : undefined;
      candidates.push({ text, imageUrl: imgSrc });
    }
    if (valid && candidates.length >= 2) {
      if (!looksLikeVoteOptions(candidates.map(item => item.text))) continue;
      options.push(...candidates);
      break;
    }
  }
}

function looksLikeVoteOptions(texts: string[]): boolean {
  if (texts.length < 2) return false;

  const totalLength = texts.reduce((sum, text) => sum + text.length, 0);
  const shortCount = texts.filter(text => text.length <= 4).length;
  if (totalLength < 12 && shortCount === texts.length) return false;

  const navWords = new Set(['商城', 'APP', '首页', '社区', '资讯', '视频', '新车', '导购']);
  const navMatches = texts.filter(text => navWords.has(text)).length;
  return navMatches < Math.min(2, texts.length);
}

function extractVoteOptionsFromScripts(rawHtml: string, options: VoteOption[]): void {
  try {
    const patterns = [
      /"vote_item"\s*:\s*(\[[\s\S]*?\])/,
      /"voteList"\s*:\s*(\[[\s\S]*?\])/,
      /"vote_items"\s*:\s*(\[[\s\S]*?\])/,
    ];
    for (const pattern of patterns) {
      const match = rawHtml.match(pattern);
      if (match) {
        try {
          const items = JSON.parse(match[1]);
          for (const item of items) {
            const text = item.name || item.title || item.content || item.text || '';
            const img = item.image || item.img || item.cover || item.pic || '';
            if (text) {
              options.push({ text: String(text).trim(), imageUrl: img || undefined });
            }
          }
          if (options.length > 0) return;
        } catch { }
      }
    }
  } catch { }
}

function looksLikeOnlyPolicyLinks(html: string): boolean {
  const text = cleanTextContent(html);
  if (text.length >= 200) return false;
  return (
    (text.includes('用户协议') || text.includes('用户条款')) &&
    (text.includes('隐私政策') || text.includes('隐私'))
  );
}

export const xchuxingStrategy: SourceParseStrategy = {
  id: 'xchuxing',

  match(urlObj) {
    return urlObj.hostname === 'www.xchuxing.com';
  },

  preserveRawContent({ urlObj }) {
    return isXchuxingVideoUrl(urlObj);
  },

  shouldForceFullContent({ urlObj }) {
    return isXchuxingVoteUrl(urlObj);
  },

  extractFromRssDescription({ urlObj, rawContent }) {
    if (!isXchuxingVoteUrl(urlObj)) return null;
    return extractVoteContentFromRssDescription(rawContent);
  },

  extractFromDocument({ urlObj, document, rawHtml }) {
    if (isXchuxingVideoUrl(urlObj)) {
      const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      if (metaDesc && metaDesc.trim()) {
        return `<article><p>${escapeHtml(metaDesc.trim())}</p></article>`;
      }
      return null;
    }

    if (isXchuxingVoteUrl(urlObj)) {
      const extracted = extractVoteContent(document, rawHtml);
      if (extracted) return extracted;
      const voteMetaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      if (voteMetaDesc.trim()) {
        return `<article><p>${escapeHtml(voteMetaDesc.trim())}</p></article>`;
      }
      return null;
    }

    if (isXchuxingArticleUrl(urlObj)) {
      return extractArticleContent(document);
    }

    return null;
  },

  afterReadability(content, context) {
    if (!looksLikeOnlyPolicyLinks(content) || !isXchuxingArticleUrl(context.urlObj)) {
      return content;
    }
    return extractArticleContent(context.document);
  },

  async enrichArticle(article, { url, urlObj, resolveVideoUrl }) {
    if (!isXchuxingVideoUrl(urlObj)) return;
    const videoUrl = await resolveVideoUrl(url);
    if (videoUrl) {
      article.videoUrl = videoUrl;
    }
  },
};
