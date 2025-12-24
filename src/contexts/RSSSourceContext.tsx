import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { RSSSource } from '../types';
import { RSSService } from '../services/rss';
import cacheEventEmitter from '../services/CacheEventEmitter';

interface RSSSourceContextType {
  rssSources: RSSSource[];
  isLoading: boolean;
  refreshRSSSources: () => Promise<void>;
  addRSSSource: (source: RSSSource) => void;
  updateRSSSource: (sourceId: number, updatedSource: Partial<RSSSource>) => void;
  deleteRSSSource: (sourceId: number) => void;
  syncAllSources: (onProgress?: (current: number, total: number, sourceName: string) => void) => Promise<void>;
  syncSource: (sourceId: number) => Promise<void>;
}

const RSSSourceContext = createContext<RSSSourceContextType | undefined>(undefined);

interface RSSSourceProviderProps {
  children: ReactNode;
}

export const RSSSourceProvider: React.FC<RSSSourceProviderProps> = ({ children }) => {
  const [rssSources, setRssSources] = useState<RSSSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const rssService = RSSService.getInstance();

  // 初始化加载RSS源
  useEffect(() => {
    loadRSSSources();
  }, []);

  // 【升级】监听全局事件，支持多种事件类型
  useEffect(() => {
    const unsubscribe = cacheEventEmitter.subscribe((eventData) => {
      const { type, sourceId, sourceName } = eventData;
      
      switch (type) {
        case 'updateRSSStats':
          // RSS统计更新：重新加载RSS源列表（包含未读数量）
          console.log('[RSSSourceContext] 接收到 updateRSSStats 事件，刷新加载 RSS 源');
          loadRSSSources();
          break;
          
        case 'clearAll':
          // 清除所有数据：重新加载RSS源列表（未读数量已被重置）
          console.log('[RSSSourceContext] 接收到 clearAll 事件，刷新加载 RSS 源');
          loadRSSSources();
          break;
          
        case 'refreshSource':
          // 单个源刷新完成：重新加载RSS源列表（更新统计数据）
          console.log(`[RSSSourceContext] 接收到 refreshSource 事件: ${sourceName || sourceId}`);
          loadRSSSources();
          break;
          
        case 'refreshAllSources':
          // 所有源刷新完成：重新加载RSS源列表
          console.log('[RSSSourceContext] 接收到 refreshAllSources 事件，刷新加载 RSS 源');
          loadRSSSources();
          break;
          
        case 'clearSourceArticles':
          // 清除单个源的文章：重新加载RSS源列表（更新统计数据）
          console.log(`[RSSSourceContext] 接收到 clearSourceArticles 事件: ${sourceName || sourceId}`);
          loadRSSSources();
          break;
          
        case 'sourceDeleted':
          // 源被删除：重新加载RSS源列表
          console.log(`[RSSSourceContext] 接收到 sourceDeleted 事件: ${sourceName || sourceId}`);
          loadRSSSources();
          break;
          
        case 'sourceUpdated':
          // 源被更新：重新加载RSS源列表
          console.log(`[RSSSourceContext] 接收到 sourceUpdated 事件: ${sourceName || sourceId}`);
          loadRSSSources();
          break;
      }
    });
    
    return unsubscribe;
  }, []);

  const loadRSSSources = async () => {
    try {
      setIsLoading(true);
      const sources = await rssService.getAllRSSSources();
      setRssSources(sources);
    } catch (error) {
      console.error('Failed to load RSS sources:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshRSSSources = async () => {
    await loadRSSSources();
  };

  const addRSSSource = (source: RSSSource) => {
    setRssSources(prev => [...prev, source]);
  };

  const updateRSSSource = (sourceId: number, updatedSource: Partial<RSSSource>) => {
    setRssSources(prev =>
      prev.map(source =>
        source.id === sourceId
          ? { ...source, ...updatedSource }
          : source
      )
    );
  };

  const deleteRSSSource = (sourceId: number) => {
    setRssSources(prev => prev.filter(source => source.id !== sourceId));
  };
  const syncAllSources = async (onProgress?: (current: number, total: number, sourceName: string) => void) => {
    try {
      console.log('[RSSSourceContext.syncAllSources] 🚀 开始同步所有 RSS 源');
      setIsLoading(true);
      console.log('[RSSSourceContext.syncAllSources] 调用 rssService.refreshAllSources()');
      await rssService.refreshAllSources({ onProgress });
      console.log('[RSSSourceContext.syncAllSources] ✅ refreshAllSources 完成');
      await loadRSSSources();
      console.log('[RSSSourceContext.syncAllSources] ✅ 所有源同步完成');
    } catch (error) {
      console.error('[RSSSourceContext.syncAllSources] 💥 同步失败:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const syncSource = async (sourceId: number) => {
    try {
      console.log(`[RSSSourceContext.syncSource] 🚀 开始同步单个源 ID: ${sourceId}`);
      setIsLoading(true);
      const source = rssSources.find(s => s.id === sourceId);
      if (source) {
        // 直接调用 fetchArticlesFromSource，内部会自动判断代理模式
        await rssService.fetchArticlesFromSource(source);
        await loadRSSSources();
        console.log(`[RSSSourceContext.syncSource] ✅ 单个源同步完成: ${source.name}`);
      }
    } catch (error) {
      console.error(`[RSSSourceContext.syncSource] 💥 同步失败:`, error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const value: RSSSourceContextType = {
    rssSources,
    isLoading,
    refreshRSSSources,
    addRSSSource,
    updateRSSSource,
    deleteRSSSource,
    syncAllSources,
    syncSource,
  };

  return (
    <RSSSourceContext.Provider value={value}>
      {children}
    </RSSSourceContext.Provider>
  );
};

export const useRSSSource = (): RSSSourceContextType => {
  const context = useContext(RSSSourceContext);
  if (context === undefined) {
    throw new Error('useRSSSource must be used within a RSSSourceProvider');
  }
  return context;
};