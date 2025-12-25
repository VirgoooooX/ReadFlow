/**
 * 全局缓存事件发射器
 * 用于统一管理应用中所有状态变更事件
 * 
 * 🔥 事件类型说明：
 * - clearAll: 清除所有数据（触发所有页面刷新）
 * - clearArticles: 清除所有文章缓存
 * - clearSourceArticles: 清除单个源的文章缓存（带 sourceId）
 * - updateRSSStats: RSS 源统计信息更新（未读数量变更）
 * - refreshSource: 单个源刷新完成（带 sourceId）
 * - refreshAllSources: 所有源刷新完成
 * - sourceDeleted: 源被删除（带 sourceId）
 * - sourceUpdated: 源被更新（带 sourceId）
 * - articleRead: 文章标记为已读（带 articleId）
 */

// 事件类型定义
export type CacheEventType = 
  | 'clearAll' 
  | 'clearArticles' 
  | 'clearSourceArticles'
  | 'updateRSSStats'
  | 'refreshSource'
  | 'refreshAllSources'
  | 'sourceDeleted'
  | 'sourceUpdated'
  | 'articleRead';

// 事件数据接口
export interface CacheEventData {
  type: CacheEventType;
  sourceId?: number;  // 可选的源ID，用于细粒度操作
  sourceName?: string; // 可选的源名称，用于日志
  articleId?: number; // 可选的文章ID，用于单篇文章操作
}

// 监听函数类型
type CacheEventListener = (event: CacheEventData) => void;

class CacheEventEmitter {
  private static instance: CacheEventEmitter;
  private listeners: Set<CacheEventListener> = new Set();

  static getInstance(): CacheEventEmitter {
    if (!CacheEventEmitter.instance) {
      CacheEventEmitter.instance = new CacheEventEmitter();
    }
    return CacheEventEmitter.instance;
  }

  /**
   * 订阅缓存事件
   * @param listener 监听函数
   */
  subscribe(listener: CacheEventListener): () => void {
    this.listeners.add(listener);
    
    // 返回取消订阅函数
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 发射缓存事件
   * @param eventData 事件数据
   */
  emit(eventData: CacheEventData): void {
    const logInfo = eventData.sourceId 
      ? `${eventData.type} (sourceId: ${eventData.sourceId})` 
      : eventData.type;
    console.log(`[CacheEventEmitter] 发射事件: ${logInfo}`);
    
    this.listeners.forEach(listener => {
      try {
        listener(eventData);
      } catch (error) {
        console.error('[CacheEventEmitter] 监听函数执行出错:', error);
      }
    });
  }

  // ==================== 便捷方法 ====================

  /**
   * 清除所有缓存（用户主动清除数据时调用）
   * 触发：HomeScreen 清空 tabDataMap，RSSSourceContext 刷新
   */
  clearAll(): void {
    this.emit({ type: 'clearAll' });
  }

  /**
   * 清除文章缓存（仅清除文章数据）
   */
  clearArticles(): void {
    this.emit({ type: 'clearArticles' });
  }

  /**
   * 文章标记为已读
   * @param articleId 文章ID
   */
  emitArticleRead(articleId: number): void {
    this.emit({ type: 'articleRead', articleId });
  }

  /**
   * 清除单个源的文章缓存
   * @param sourceId 源ID
   * @param sourceName 源名称（可选，用于日志）
   */
  clearSourceArticles(sourceId: number, sourceName?: string): void {
    this.emit({ type: 'clearSourceArticles', sourceId, sourceName });
  }

  /**
   * 通知 RSS 源统计信息已更新（未读计数变更）
   * 触发：订阅源页面刷新统计数据
   */
  updateRSSStats(): void {
    this.emit({ type: 'updateRSSStats' });
  }

  /**
   * 通知单个源刷新完成
   * @param sourceId 源ID
   * @param sourceName 源名称（可选）
   * 触发：HomeScreen 刷新该源的 tab 和"全部"tab
   */
  refreshSource(sourceId: number, sourceName?: string): void {
    this.emit({ type: 'refreshSource', sourceId, sourceName });
  }

  /**
   * 通知所有源刷新完成
   * 触发：HomeScreen 刷新所有 tab 数据
   */
  refreshAllSources(): void {
    this.emit({ type: 'refreshAllSources' });
  }

  /**
   * 通知源被删除
   * @param sourceId 源ID
   * @param sourceName 源名称（可选）
   * 触发：HomeScreen 移除该源的 tab 缓存，刷新"全部"tab
   */
  sourceDeleted(sourceId: number, sourceName?: string): void {
    this.emit({ type: 'sourceDeleted', sourceId, sourceName });
  }

  /**
   * 通知源被更新（编辑）
   * @param sourceId 源ID
   * @param sourceName 源名称（可选）
   */
  sourceUpdated(sourceId: number, sourceName?: string): void {
    this.emit({ type: 'sourceUpdated', sourceId, sourceName });
  }

  /**
   * 获取当前监听器数量（用于调试）
   */
  getListenerCount(): number {
    return this.listeners.size;
  }
}

export default CacheEventEmitter.getInstance();

