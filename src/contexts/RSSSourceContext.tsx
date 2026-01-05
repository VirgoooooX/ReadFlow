import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ToastAndroid, Platform } from 'react-native';
import { RSSSource, RSSStartupSettings } from '../types';
import { RSSService } from '../services/rss';
import { SettingsService } from '../services/SettingsService';
import { logger } from '../services/rss/RSSUtils';
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
  syncSources: (sourceIds: number[], onProgress?: (current: number, total: number, sourceName: string) => void) => Promise<void>;
  
  // 启动刷新配置
  startupSettings: RSSStartupSettings;
  updateStartupSettings: (settings: RSSStartupSettings) => Promise<void>;
  triggerStartupRefresh: () => Promise<void>;
}

const RSSSourceContext = createContext<RSSSourceContextType | undefined>(undefined);

interface RSSSourceProviderProps {
  children: ReactNode;
}

export const RSSSourceProvider: React.FC<RSSSourceProviderProps> = ({ children }) => {
  const [rssSources, setRssSources] = useState<RSSSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [startupSettings, setStartupSettings] = useState<RSSStartupSettings>({ enabled: false, sourceIds: [] });
  const rssService = RSSService.getInstance();
  const settingsService = SettingsService.getInstance();

  // 初始化加载RSS源和设置
  useEffect(() => {
    loadRSSSources();
    loadStartupSettings();
  }, []);

  // 【升级】监听全局事件，支持多种事件类型
  useEffect(() => {
    const unsubscribe = cacheEventEmitter.subscribe((eventData) => {
      const { type, sourceId, sourceName } = eventData;
      
      switch (type) {
        case 'updateRSSStats':
          // RSS统计更新：重新加载RSS源列表（包含未读数量）
          logger.info('[RSSSourceContext] 接收到 updateRSSStats 事件，刷新加载 RSS 源');
          loadRSSSources();
          break;
          
        case 'clearAll':
          // 清除所有数据：重新加载RSS源列表（未读数量已被重置）
          logger.info('[RSSSourceContext] 接收到 clearAll 事件，刷新加载 RSS 源');
          loadRSSSources();
          break;
          
        case 'refreshSource':
          // 单个源刷新完成：重新加载RSS源列表（更新统计数据）
          logger.info(`[RSSSourceContext] 接收到 refreshSource 事件: ${sourceName || sourceId}`);
          loadRSSSources();
          break;
          
        case 'refreshAllSources':
          // 所有源刷新完成：重新加载RSS源列表
          logger.info('[RSSSourceContext] 接收到 refreshAllSources 事件，刷新加载 RSS 源');
          loadRSSSources();
          break;
          
        case 'clearSourceArticles':
          // 清除单个源的文章：重新加载RSS源列表（更新统计数据）
          logger.info(`[RSSSourceContext] 接收到 clearSourceArticles 事件: ${sourceName || sourceId}`);
          loadRSSSources();
          break;
          
        case 'sourceDeleted':
          // 源被删除：重新加载RSS源列表
          logger.info(`[RSSSourceContext] 接收到 sourceDeleted 事件: ${sourceName || sourceId}`);
          loadRSSSources();
          break;
          
        case 'sourceUpdated':
          // 源被更新：重新加载RSS源列表
          logger.info(`[RSSSourceContext] 接收到 sourceUpdated 事件: ${sourceName || sourceId}`);
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
      logger.error('Failed to load RSS sources:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStartupSettings = async () => {
    try {
      const settings = await settingsService.getRSSStartupSettings();
      setStartupSettings(settings);
    } catch (error) {
      logger.error('Failed to load startup settings:', error);
    }
  };

  const updateStartupSettings = async (settings: RSSStartupSettings) => {
    try {
      await settingsService.saveRSSStartupSettings(settings);
      setStartupSettings(settings);
    } catch (error) {
      logger.error('Failed to update startup settings:', error);
      throw error;
    }
  };

  const triggerStartupRefresh = async () => {
    try {
      const settings = await settingsService.getRSSStartupSettings();
      
      if (!settings.enabled) {
        logger.info('[RSSStartup] 启动刷新未启用，跳过');
        return;
      }

      logger.info('[RSSStartup] 触发启动自动刷新...');
      
      if (settings.sourceIds.length === 0) {
        logger.info('[RSSStartup] 未选择任何源进行启动刷新');
        return;
      }

      logger.info(`[RSSStartup] 将刷新 ${settings.sourceIds.length} 个源`);
      
      // 非阻塞执行
      syncSources(settings.sourceIds).catch(err => {
        logger.error('[RSSStartup] 启动刷新失败:', err);
      });
      
    } catch (error) {
      logger.error('[RSSStartup] 触发启动刷新出错:', error);
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
    cacheEventEmitter.batchSyncStart();
    try {
      console.log('[RSSSourceContext.syncAllSources] 🚀 开始同步所有 RSS 源');
      setIsLoading(true);
      console.log('[RSSSourceContext.syncAllSources] 调用 rssService.refreshAllSources()');
      const result = await rssService.refreshAllSources({ onProgress });
      console.log(`[RSSSourceContext.syncAllSources] ✅ refreshAllSources 完成，新增文章: ${result.insertedCount}`);
      
      await loadRSSSources();
      
      // 只有当有新文章时才触发全局刷新，避免无意义的列表重载
      if (result.insertedCount > 0) {
        cacheEventEmitter.refreshAllSources();
        console.log('[RSSSourceContext.syncAllSources] 📢 触发 refreshAllSources 事件');
      } else {
        console.log('[RSSSourceContext.syncAllSources] 🔕 无新文章，跳过 refreshAllSources 事件');
      }
      
      if (Platform.OS === 'android') {
        ToastAndroid.show(`已刷新，${result.insertedCount}篇新文章`, ToastAndroid.SHORT);
      }

      console.log('[RSSSourceContext.syncAllSources] ✅ 所有源同步完成');
    } catch (error) {
      console.error('[RSSSourceContext.syncAllSources] 💥 同步失败:', error);
      throw error;
    } finally {
      cacheEventEmitter.batchSyncEnd();
      setIsLoading(false);
    }
  };

  const syncSource = async (sourceId: number) => {
    cacheEventEmitter.batchSyncStart();
    try {
      console.log(`[RSSSourceContext.syncSource] 🚀 开始同步单个源 ID: ${sourceId}`);
      setIsLoading(true);
      const source = rssSources.find(s => s.id === sourceId);
      if (source) {
        if (!source.isActive) {
          console.log(`[RSSSourceContext.syncSource] ⏭️ 源已停用，跳过刷新: ${source.name}`);
          if (Platform.OS === 'android') {
            ToastAndroid.show('该 RSS 源已停用，跳过刷新', ToastAndroid.SHORT);
          }
          return;
        }

        // 直接调用 fetchArticlesFromSource，内部会自动判断代理模式
        const newArticles = await rssService.fetchArticlesFromSource(source);
        
        await loadRSSSources();

        // 只有当有新文章时才触发刷新
        if (newArticles && newArticles.length > 0) {
          cacheEventEmitter.refreshSources([sourceId]);
          // 同时也触发单源刷新事件，保持兼容性
          cacheEventEmitter.refreshSource(sourceId, source.name);
          console.log(`[RSSSourceContext.syncSource] 📢 触发 refreshSource 事件，新增: ${newArticles.length}`);
        } else {
          console.log(`[RSSSourceContext.syncSource] 🔕 无新文章，跳过 refreshSource 事件`);
        }
        
        if (Platform.OS === 'android') {
          ToastAndroid.show(`已刷新，${newArticles ? newArticles.length : 0}篇新文章`, ToastAndroid.SHORT);
        }

        console.log(`[RSSSourceContext.syncSource] ✅ 单个源同步完成: ${source.name}`);
      }
    } catch (error) {
      console.error(`[RSSSourceContext.syncSource] 💥 同步失败:`, error);
      throw error;
    } finally {
      cacheEventEmitter.batchSyncEnd();
      setIsLoading(false);
    }
  };

  const syncSources = async (sourceIds: number[], onProgress?: (current: number, total: number, sourceName: string) => void) => {
    cacheEventEmitter.batchSyncStart();
    try {
      logger.info(`[RSSSourceContext.syncSources] 🚀 开始同步 ${sourceIds.length} 个 RSS 源`);
      setIsLoading(true);
      
      const result = await rssService.refreshSources(sourceIds, { onProgress });
      
      logger.info(`[RSSSourceContext.syncSources] ✅ 批量同步完成，新增文章: ${result.insertedCount}`);
      await loadRSSSources();
      
      // 只有当有新文章时才触发刷新
      if (result.insertedCount > 0) {
        cacheEventEmitter.refreshSources(sourceIds);
        logger.info('[RSSSourceContext.syncSources] 📢 触发 refreshSources 事件');
      } else {
        logger.info('[RSSSourceContext.syncSources] 🔕 无新文章，跳过 refreshSources 事件');
      }

      if (Platform.OS === 'android') {
        ToastAndroid.show(`已刷新，${result.insertedCount}篇新文章`, ToastAndroid.SHORT);
      }
    } catch (error) {
      console.error('[RSSSourceContext.syncSources] 💥 同步失败:', error);
      throw error;
    } finally {
      cacheEventEmitter.batchSyncEnd();
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
    syncSources,
    startupSettings,
    updateStartupSettings,
    triggerStartupRefresh,
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
