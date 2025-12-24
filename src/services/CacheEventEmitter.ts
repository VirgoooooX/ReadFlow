/**
 * 全局缓存事件发射器
 * 用于通知应用不同部分的缓存清除事件
 */

type CacheEventListener = (event: 'clearAll' | 'clearArticles') => void;

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
   * 发射缓存清除事件
   * @param event 事件类型
   */
  emit(event: 'clearAll' | 'clearArticles'): void {
    console.log(`[CacheEventEmitter] 发射事件: ${event}`);
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[CacheEventEmitter] 监听函数执行出错:', error);
      }
    });
  }

  /**
   * 清除所有缓存（用户主动清除数据时调用）
   */
  clearAll(): void {
    this.emit('clearAll');
  }

  /**
   * 清除文章缓存（仅清除文章数据）
   */
  clearArticles(): void {
    this.emit('clearArticles');
  }

  /**
   * 获取当前监听器数量（用于调试）
   */
  getListenerCount(): number {
    return this.listeners.size;
  }
}

export default CacheEventEmitter.getInstance();
