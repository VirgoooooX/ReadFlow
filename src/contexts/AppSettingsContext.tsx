import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { SettingsService } from '../services/SettingsService';
import cacheEventEmitter from '../services/CacheEventEmitter';

/**
 * 全局应用设置Context
 * 统一管理所有开关、配置和全局状态
 */

// LLM配置
export interface LLMConfig {
  provider: 'ollama' | 'openai' | 'anthropic';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

// 应用设置状态
interface AppSettingsState {

  // LLM配置
  llmConfig: LLMConfig;

  // RSS刷新设置
  autoRefreshEnabled: boolean;
  refreshInterval: number; // 分钟

  // 加载状态
  isLoading: boolean;
}

// Context类型定义
interface AppSettingsContextType {
  // 状态
  settings: AppSettingsState;


  // LLM配置操作
  updateLLMConfig: (config: Partial<LLMConfig>) => Promise<void>;

  // RSS刷新设置
  updateAutoRefresh: (enabled: boolean, interval?: number) => Promise<void>;

  // 刷新所有设置
  refreshSettings: () => Promise<void>;
}

const AppSettingsContext = createContext<AppSettingsContextType | undefined>(undefined);

interface AppSettingsProviderProps {
  children: ReactNode;
}

// 默认配置
const DEFAULT_SETTINGS: AppSettingsState = {
  llmConfig: {
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
  },
  autoRefreshEnabled: false,
  refreshInterval: 60,
  isLoading: false,
};

export const AppSettingsProvider: React.FC<AppSettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettingsState>(DEFAULT_SETTINGS);
  const settingsService = SettingsService.getInstance();

  // 初始化加载所有设置
  useEffect(() => {
    loadAllSettings();
  }, []);

  useEffect(() => {
    const unsubscribe = cacheEventEmitter.subscribe((eventData) => {
      if (eventData.type === 'settingsUpdated') {
        loadAllSettings();
      }
    });
    return unsubscribe;
  }, []);

  /**
   * 加载所有设置
   */
  const loadAllSettings = async () => {
    try {
      setSettings(prev => ({ ...prev, isLoading: true }));

      const [llmConfig, rssSettings] = await Promise.all([
        settingsService.getLLMSettings(),
        settingsService.getRSSSettings(),
      ]);

      setSettings({
        llmConfig: llmConfig || DEFAULT_SETTINGS.llmConfig,
        autoRefreshEnabled: rssSettings?.autoRefreshEnabled ?? DEFAULT_SETTINGS.autoRefreshEnabled,
        refreshInterval: rssSettings?.refreshInterval ?? DEFAULT_SETTINGS.refreshInterval,
        isLoading: false,
      });

      console.log('[AppSettings] ✅ 设置加载完成', {
        llmProvider: llmConfig?.provider,
        autoRefresh: rssSettings?.autoRefreshEnabled,
      });
    } catch (error) {
      console.error('[AppSettings] 加载设置失败:', error);
      setSettings(prev => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * 更新LLM配置
   */
  const updateLLMConfig = useCallback(async (config: Partial<LLMConfig>) => {
    try {
      const newConfig = { ...settings.llmConfig, ...config };

      await settingsService.saveLLMSettings(newConfig);

      setSettings(prev => ({ ...prev, llmConfig: newConfig }));
      console.log('[AppSettings] LLM配置已更新:', newConfig);
    } catch (error) {
      console.error('[AppSettings] 更新LLM配置失败:', error);
      throw error;
    }
  }, [settings.llmConfig]);

  /**
   * 更新自动刷新设置
   */
  const updateAutoRefresh = useCallback(async (enabled: boolean, interval?: number) => {
    try {
      const newInterval = interval ?? settings.refreshInterval;

      await settingsService.saveRSSSettings({
        autoRefreshEnabled: enabled,
        refreshInterval: newInterval,
      });

      setSettings(prev => ({
        ...prev,
        autoRefreshEnabled: enabled,
        refreshInterval: newInterval,
      }));
      console.log('[AppSettings] 自动刷新设置已更新:', { enabled, interval: newInterval });
    } catch (error) {
      console.error('[AppSettings] 更新自动刷新设置失败:', error);
      throw error;
    }
  }, [settings.refreshInterval]);

  const refreshSettings = useCallback(async () => {
    await loadAllSettings();
  }, []);

  const value: AppSettingsContextType = {
    settings,
    updateLLMConfig,
    updateAutoRefresh,
    refreshSettings,
  };

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
};

export const useAppSettings = (): AppSettingsContextType => {
  const context = useContext(AppSettingsContext);
  if (context === undefined) {
    throw new Error('useAppSettings must be used within an AppSettingsProvider');
  }
  return context;
};

export const useLLMConfig = () => {
  const { settings, updateLLMConfig } = useAppSettings();
  return {
    llmConfig: settings.llmConfig,
    updateLLMConfig,
  };
};

export const useAutoRefresh = () => {
  const { settings, updateAutoRefresh } = useAppSettings();
  return {
    autoRefreshEnabled: settings.autoRefreshEnabled,
    refreshInterval: settings.refreshInterval,
    updateAutoRefresh,
  };
};
