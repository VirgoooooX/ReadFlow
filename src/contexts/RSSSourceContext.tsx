import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { RSSSource } from '../types';
import { RSSService } from '../services/RSSService';

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
      setIsLoading(true);
      await rssService.refreshAllSources({ onProgress });
      await loadRSSSources();
    } catch (error) {
      console.error('Failed to sync all RSS sources:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const syncSource = async (sourceId: number) => {
    try {
      setIsLoading(true);
      const source = rssSources.find(s => s.id === sourceId);
      if (source) {
        await rssService.fetchArticlesFromSource(source);
        await loadRSSSources();
      }
    } catch (error) {
      console.error(`Failed to sync RSS source ${sourceId}:`, error);
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