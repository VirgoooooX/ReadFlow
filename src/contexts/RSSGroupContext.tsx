import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { RSSGroup, RSSSource, VIRTUAL_GROUPS } from '../types';
import { RSSGroupService } from '../services/RSSGroupService';

interface RSSGroupContextType {
  // 状态
  groups: RSSGroup[];
  activeGroupId: number;           // -1=全部, 0=未分组, >0=实际分组
  isLoading: boolean;
  
  // 操作
  setActiveGroup: (groupId: number) => void;
  createGroup: (group: Omit<RSSGroup, 'id' | 'createdAt' | 'updatedAt'>) => Promise<RSSGroup>;
  updateGroup: (groupId: number, updates: Partial<RSSGroup>) => Promise<void>;
  deleteGroup: (groupId: number, deleteSourcesToo?: boolean) => Promise<void>;
  reorderGroups: (groupIds: number[]) => Promise<void>;
  refreshGroups: () => Promise<void>;
  
  // 批量操作
  moveSourcesToGroup: (sourceIds: number[], groupId: number | null) => Promise<void>;
  addSourceToGroup: (sourceId: number, groupId: number) => Promise<void>;
  removeSourceFromGroup: (sourceId: number) => Promise<void>;
  
  // 获取
  getSourcesInGroup: (groupId: number) => Promise<RSSSource[]>;
  getGroupStats: (groupId: number) => { sourceCount: number; unreadCount: number };
  
  // 智能推荐
  suggestGroupForSource: (source: RSSSource) => string[];
  getDefaultIcon: (group: RSSGroup, sources?: RSSSource[]) => string;
}

const RSSGroupContext = createContext<RSSGroupContextType | undefined>(undefined);

interface RSSGroupProviderProps {
  children: ReactNode;
}

export const RSSGroupProvider: React.FC<RSSGroupProviderProps> = ({ children }) => {
  const [groups, setGroups] = useState<RSSGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<number>(VIRTUAL_GROUPS.ALL.id); // 默认显示全部
  const [isLoading, setIsLoading] = useState(false);
  const groupService = RSSGroupService.getInstance();
  const hasMigrated = useRef(false); // 🚀 迷移只执行一次

  // 初始化加载分组
  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      setIsLoading(true);
      
      // 🚀 只在首次加载时运行迁移
      if (!hasMigrated.current) {
        await groupService.migrateCategoryToGroups();
        hasMigrated.current = true;
      }
      
      const allGroups = await groupService.getAllGroups();
      setGroups(allGroups);
    } catch (error) {
      console.error('[RSSGroupContext] Failed to load groups:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshGroups = async () => {
    await loadGroups();
  };

  const setActiveGroup = (groupId: number) => {
    setActiveGroupId(groupId);
  };

  const createGroup = async (group: Omit<RSSGroup, 'id' | 'createdAt' | 'updatedAt'>): Promise<RSSGroup> => {
    try {
      const newGroup = await groupService.createGroup(group);
      await refreshGroups();
      return newGroup;
    } catch (error) {
      console.error('[RSSGroupContext] Failed to create group:', error);
      throw error;
    }
  };

  const updateGroup = async (groupId: number, updates: Partial<RSSGroup>): Promise<void> => {
    try {
      await groupService.updateGroup(groupId, updates);
      await refreshGroups();
    } catch (error) {
      console.error('[RSSGroupContext] Failed to update group:', error);
      throw error;
    }
  };

  const deleteGroup = async (groupId: number, deleteSourcesToo: boolean = false): Promise<void> => {
    try {
      await groupService.deleteGroup(groupId, deleteSourcesToo);
      
      // 如果删除的是当前激活的分组，切换到"全部"
      if (activeGroupId === groupId) {
        setActiveGroupId(VIRTUAL_GROUPS.ALL.id);
      }
      
      await refreshGroups();
    } catch (error) {
      console.error('[RSSGroupContext] Failed to delete group:', error);
      throw error;
    }
  };

  const reorderGroups = async (groupIds: number[]): Promise<void> => {
    try {
      await groupService.reorderGroups(groupIds);
      await refreshGroups();
    } catch (error) {
      console.error('[RSSGroupContext] Failed to reorder groups:', error);
      throw error;
    }
  };

  const moveSourcesToGroup = async (sourceIds: number[], groupId: number | null): Promise<void> => {
    try {
      await groupService.moveSourcesToGroup(sourceIds, groupId);
      await refreshGroups(); // 刷新统计数据
    } catch (error) {
      console.error('[RSSGroupContext] Failed to move sources:', error);
      throw error;
    }
  };

  const addSourceToGroup = async (sourceId: number, groupId: number): Promise<void> => {
    await moveSourcesToGroup([sourceId], groupId);
  };

  const removeSourceFromGroup = async (sourceId: number): Promise<void> => {
    await moveSourcesToGroup([sourceId], null);
  };

  const getSourcesInGroup = async (groupId: number): Promise<RSSSource[]> => {
    try {
      return await groupService.getSourcesByGroup(groupId);
    } catch (error) {
      console.error('[RSSGroupContext] Failed to get sources:', error);
      return [];
    }
  };

  const getGroupStats = (groupId: number): { sourceCount: number; unreadCount: number } => {
    const group = groups.find(g => g.id === groupId);
    return {
      sourceCount: group?.sourceCount || 0,
      unreadCount: group?.unreadCount || 0,
    };
  };

  const suggestGroupForSource = (source: RSSSource): string[] => {
    return groupService.suggestGroupForSource(source);
  };

  const getDefaultIcon = (group: RSSGroup, sources: RSSSource[] = []): string => {
    return groupService.getDefaultIcon(group, sources);
  };

  const value: RSSGroupContextType = {
    groups,
    activeGroupId,
    isLoading,
    setActiveGroup,
    createGroup,
    updateGroup,
    deleteGroup,
    reorderGroups,
    refreshGroups,
    moveSourcesToGroup,
    addSourceToGroup,
    removeSourceFromGroup,
    getSourcesInGroup,
    getGroupStats,
    suggestGroupForSource,
    getDefaultIcon,
  };

  return (
    <RSSGroupContext.Provider value={value}>
      {children}
    </RSSGroupContext.Provider>
  );
};

export const useRSSGroup = (): RSSGroupContextType => {
  const context = useContext(RSSGroupContext);
  if (context === undefined) {
    throw new Error('useRSSGroup must be used within a RSSGroupProvider');
  }
  return context;
};
