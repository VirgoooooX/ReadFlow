import { fetchWithRetry, logger } from '../../utils/RSSUtils';
import { SourceParseStrategy } from './types';

async function getDongqiudiComments(articleId: string): Promise<string> {
  try {
    const apiUrl = `https://api.dongqiudi.com/v2/article/${articleId}/comment`;

    const response = await fetchWithRetry(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      },
      timeout: 10000,
      retries: 1,
    });

    if (!response.ok) return '';

    const json = await response.json() as any;
    if (json.errCode !== 0 || !json.data) return '';

    const data = json.data;
    const commentList = data.comment_list || [];
    const recommendList = data.recommend_list || [];
    const userList = data.user_list || [];

    const userMap = new Map<string, { username: string; avatar?: string }>();
    for (const user of userList) {
      if (user && user.id) {
        userMap.set(String(user.id), {
          username: user.username || '神秘球迷',
          avatar: user.avatar,
        });
      }
    }

    const allComments = [...recommendList];
    const recommendIds = new Set(recommendList.map((c: any) => String(c.id)));

    const otherComments = commentList
      .filter((c: any) => !recommendIds.has(String(c.id)))
      .sort((a: any, b: any) => {
        const upA = parseInt(a.up) || 0;
        const upB = parseInt(b.up) || 0;
        return upB - upA;
      });

    allComments.push(...otherComments);

    const topComments = allComments.slice(0, 10);
    if (topComments.length === 0) return '';

    const visibleComments = topComments.slice(0, 3);
    const collapsedComments = topComments.slice(3);

    const htmlParts: string[] = [];
    htmlParts.push('<hr style="margin: 24px 0; border: none; border-top: 1px dashed var(--color-table-border);" />');
    htmlParts.push('<div class="dongqiudi-comments" style="margin-top: 16px; font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; color: var(--color-text);">');
    htmlParts.push('  <h3 style="font-size: 1.05em; font-weight: bold; margin-bottom: 12px; color: var(--color-text); border-left: 4px solid var(--color-link); padding-left: 8px;">💬 热门评论</h3>');
    htmlParts.push('  <div style="display: flex; flex-direction: column; gap: 12px;">');

    const renderComment = (comment: any) => {
      const userId = String(comment.user_id);
      const user = userMap.get(userId);
      const username = user?.username || '神秘球迷';
      const avatar = user?.avatar || 'https://img1.dongqiudi.com/fastdfs1/M00/3B/EF/100x100/-/-/o4YBAFjM9lqAel9GAAAQrsgeQ3A103.jpg';
      const upCount = comment.up || '0';
      const createdAt = comment.created_at || '';
      const text = (comment.content || '').replace(/\n/g, '<br />');

      return `    <div style="border-bottom: 1px solid var(--color-table-border); padding-bottom: 10px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="${avatar}" style="width: 24px !important; height: 24px !important; border-radius: 50% !important; object-fit: cover !important; display: block !important; margin: 0 !important;" />
          <span style="font-weight: 600; font-size: 0.9em; color: var(--color-text); line-height: 24px; display: inline-block;">${username}</span>
        </div>
        <span style="font-size: 0.8em; color: var(--color-secondary); background-color: var(--color-code-bg); padding: 2px 6px; border-radius: 10px;">👍 ${upCount}</span>
      </div>
      <div style="font-size: 0.9em; line-height: 1.4; color: var(--color-text); padding-left: 32px; word-break: break-word;">${text}</div>
      <div style="font-size: 0.75em; color: var(--color-caption); padding-left: 32px; margin-top: 2px;">${createdAt}</div>
    </div>`;
    };

    for (const comment of visibleComments) {
      htmlParts.push(renderComment(comment));
    }

    if (collapsedComments.length > 0) {
      htmlParts.push('    <div id="more-comments" style="display: none; flex-direction: column; gap: 12px;">');
      for (const comment of collapsedComments) {
        htmlParts.push(renderComment(comment));
      }
      htmlParts.push('    </div>');
      htmlParts.push(`    <button id="toggle-comments-btn" data-count="${collapsedComments.length}" style="width: 100%; padding: 10px; margin-top: 8px; background: none; border: 1px solid var(--color-table-border); border-radius: 8px; font-size: 0.85em; color: var(--color-link); cursor: pointer; text-align: center; font-weight: 600; outline: none; -webkit-tap-highlight-color: transparent;">
      展开更多评论 (${collapsedComments.length}条)
    </button>`);
    }

    htmlParts.push('  </div>');
    htmlParts.push('</div>');

    return htmlParts.join('\n');
  } catch (error) {
    logger.error('Error fetching comments in dongqiudiStrategy:', error);
    return '';
  }
}

export const dongqiudiStrategy: SourceParseStrategy = {
  id: 'dongqiudi',

  match(urlObj) {
    return urlObj.hostname.includes('dongqiudi.com');
  },

  normalizeTitle(title) {
    return title.split('|')[0].trim();
  },

  beforeReadability({ document, metaOut }) {
    const authorSpan = document.querySelector('article h5 span');
    if (authorSpan && metaOut) {
      metaOut.author = authorSpan.textContent?.trim();
    }

    const h5El = document.querySelector('article h5');
    if (h5El) {
      h5El.remove();
    }
  },

  async afterReadability(content, { url }) {
    try {
      const match = url.match(/\/article\/(\d+)\.html/);
      if (!match) return content;

      const commentsHtml = await getDongqiudiComments(match[1]);
      if (!commentsHtml) return content;

      if (content.endsWith('</div>')) {
        return content.substring(0, content.length - 6) + commentsHtml + '</div>';
      }
      return content + commentsHtml;
    } catch (error) {
      logger.error('Failed to append dongqiudi comments:', error);
      return content;
    }
  },
};
