import { describe, expect, it } from 'vitest';
import { xchuxingStrategy } from './xchuxingStrategy';

describe('xchuxingStrategy', () => {
  it('extracts vote options from RSS description', () => {
    const urlObj = new URL('https://www.xchuxing.com/vote/2197');
    const content = xchuxingStrategy.extractFromRssDescription?.({
      source: {
        id: 1,
        sortOrder: 0,
        name: '新出行',
        url: 'https://rsshub.example/xchuxing',
        category: 'Auto',
        contentType: 'image_text',
        isActive: true,
        errorCount: 0,
        groupId: null,
      },
      url: urlObj.toString(),
      urlObj,
      rawContent: '[投票选项] 取消第三排，二排空间大幅加宽<br><br>[投票选项] 后备箱容积暴涨，露营/户外装载拉满<br><br>[投票选项] 预计比六/七座版价格更低，性价比提升<br><br>[投票选项] 其他，评论区聊聊',
    });

    expect(content).toContain('<li>取消第三排，二排空间大幅加宽</li>');
    expect(content).toContain('<li>后备箱容积暴涨，露营/户外装载拉满</li>');
    expect(content).not.toContain('商城');
    expect(content).not.toContain('APP');
  });
});
