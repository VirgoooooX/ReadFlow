import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { RSSSource, AppError } from '../../types';
import { rssService } from '../../services';

// 异步thunk actions
export const fetchRSSSources = createAsyncThunk(
  'rss/fetchSources',
  async () => {
    return await rssService.getAllSources();
  }
);

export const addRSSSource = createAsyncThunk(
  'rss/addSource',
  async (params: { url: string; name?: string; category?: string }) => {
    return await rssService.addSource(params.url, params.name, params.category);
  }
);

export const updateRSSSource = createAsyncThunk(
  'rss/updateSource',
  async (params: { id: number; updates: Partial<RSSSource> }) => {
    await rssService.updateSource(params.id, params.updates);
    return params;
  }
);

export const deleteRSSSource = createAsyncThunk(
  'rss/deleteSource',
  async (id: number) => {
    await rssService.deleteSource(id);
    return id;
  }
);

export const refreshRSSSource = createAsyncThunk(
  'rss/refreshSource',
  async (id: number) => {
    const articles = await rssService.refreshSource(id);
    return { id, articles };
  }
);

export const refreshAllRSSSources = createAsyncThunk(
  'rss/refreshAllSources',
  async () => {
    return await rssService.refreshAllSources();
  }
);

export const toggleRSSSourceActive = createAsyncThunk(
  'rss/toggleSourceActive',
  async (id: number) => {
    const isActive = await rssService.toggleSourceActive(id);
    return { id, isActive };
  }
);

export const validateRSSUrl = createAsyncThunk(
  'rss/validateUrl',
  async (url: string) => {
    return await rssService.validateRSSUrl(url);
  }
);

export const fetchRSSSourceById = createAsyncThunk(
  'rss/fetchSourceById',
  async (id: number) => {
    const source = await rssService.getSourceById(id);
    if (!source) {
      throw new Error('RSS source not found');
    }
    return source;
  }
);

export const fetchRSSSourcesByCategory = createAsyncThunk(
  'rss/fetchSourcesByCategory',
  async (category: string) => {
    return await rssService.getSourcesByCategory(category);
  }
);

export const fetchRSSCategories = createAsyncThunk(
  'rss/fetchCategories',
  async () => {
    return await rssService.getCategories();
  }
);

export const importOPML = createAsyncThunk(
  'rss/importOPML',
  async (opmlContent: string) => {
    return await rssService.importOPML(opmlContent);
  }
);

export const exportOPML = createAsyncThunk(
  'rss/exportOPML',
  async () => {
    return await rssService.exportOPML();
  }
);

// State interface
interface RSSState {
  // RSS源列表
  sources: RSSSource[];
  currentSource: RSSSource | null;
  
  // 分类
  categories: string[];
  selectedCategory: string | null;
  
  // 刷新状态
  refreshing: {
    all: boolean;
    sources: Set<number>; // 正在刷新的源ID集合
  };
  
  // 验证状态
  validation: {
    isValidating: boolean;
    lastValidatedUrl: string | null;
    validationResult: {
      isValid: boolean;
      title?: string;
      description?: string;
      error?: string;
    } | null;
  };
  
  // 导入导出状态
  importExport: {
    importing: boolean;
    exporting: boolean;
    lastImportResult: {
      success: number;
      failed: number;
      errors: string[];
    } | null;
  };
  
  // 统计信息
  stats: {
    totalSources: number;
    activeSources: number;
    totalArticles: number;
    lastRefreshTime: Date | null;
  };
  
  // 加载状态
  loading: {
    sources: boolean;
    currentSource: boolean;
    categories: boolean;
  };
  
  // 错误状态
  error: AppError | null;
}

// 初始状态
const initialState: RSSState = {
  sources: [],
  currentSource: null,
  
  categories: [],
  selectedCategory: null,
  
  refreshing: {
    all: false,
    sources: new Set(),
  },
  
  validation: {
    isValidating: false,
    lastValidatedUrl: null,
    validationResult: null,
  },
  
  importExport: {
    importing: false,
    exporting: false,
    lastImportResult: null,
  },
  
  stats: {
    totalSources: 0,
    activeSources: 0,
    totalArticles: 0,
    lastRefreshTime: null,
  },
  
  loading: {
    sources: false,
    currentSource: false,
    categories: false,
  },
  
  error: null,
};

// 创建slice
const rssSlice = createSlice({
  name: 'rss',
  initialState,
  reducers: {
    // 设置选中的分类
    setSelectedCategory: (state, action: PayloadAction<string | null>) => {
      state.selectedCategory = action.payload;
    },
    
    // 设置当前RSS源
    setCurrentSource: (state, action: PayloadAction<RSSSource | null>) => {
      state.currentSource = action.payload;
    },
    
    // 清除验证结果
    clearValidationResult: (state) => {
      state.validation.validationResult = null;
      state.validation.lastValidatedUrl = null;
    },
    
    // 清除导入结果
    clearImportResult: (state) => {
      state.importExport.lastImportResult = null;
    },
    
    // 清除错误
    clearError: (state) => {
      state.error = null;
    },
    
    // 更新RSS源在列表中的状态
    updateSourceInList: (state, action: PayloadAction<{ id: number; updates: Partial<RSSSource> }>) => {
      const { id, updates } = action.payload;
      
      const sourceIndex = state.sources.findIndex(source => source.id === id);
      if (sourceIndex !== -1) {
        state.sources[sourceIndex] = { ...state.sources[sourceIndex], ...updates };
      }
      
      if (state.currentSource?.id === id) {
        state.currentSource = { ...state.currentSource, ...updates };
      }
    },
    
    // 更新统计信息
    updateStats: (state) => {
      state.stats.totalSources = state.sources.length;
      state.stats.activeSources = state.sources.filter(source => source.isActive).length;
    },
  },
  
  extraReducers: (builder) => {
    // 获取RSS源列表
    builder
      .addCase(fetchRSSSources.pending, (state) => {
        state.loading.sources = true;
        state.error = null;
      })
      .addCase(fetchRSSSources.fulfilled, (state, action) => {
        state.loading.sources = false;
        state.sources = action.payload;
        rssSlice.caseReducers.updateStats(state);
      })
      .addCase(fetchRSSSources.rejected, (state, action) => {
        state.loading.sources = false;
        state.error = {
          code: 'FETCH_RSS_SOURCES_ERROR',
          message: action.error.message || 'Failed to fetch RSS sources',
          timestamp: new Date(),
        };
      })
      
      // 添加RSS源
      .addCase(addRSSSource.pending, (state) => {
        state.error = null;
      })
      .addCase(addRSSSource.fulfilled, (state, action) => {
        state.sources.push(action.payload);
        rssSlice.caseReducers.updateStats(state);
        
        // 更新分类列表
        if (action.payload.category && !state.categories.includes(action.payload.category)) {
          state.categories.push(action.payload.category);
        }
      })
      .addCase(addRSSSource.rejected, (state, action) => {
        state.error = {
          code: 'ADD_RSS_SOURCE_ERROR',
          message: action.error.message || 'Failed to add RSS source',
          timestamp: new Date(),
        };
      })
      
      // 更新RSS源
      .addCase(updateRSSSource.fulfilled, (state, action) => {
        const { id, updates } = action.payload;
        rssSlice.caseReducers.updateSourceInList(state, { payload: { id, updates }, type: 'updateSourceInList' });
        
        // 更新分类列表
        if (updates.category && !state.categories.includes(updates.category)) {
          state.categories.push(updates.category);
        }
      })
      
      // 删除RSS源
      .addCase(deleteRSSSource.fulfilled, (state, action) => {
        const id = action.payload;
        state.sources = state.sources.filter(source => source.id !== id);
        
        if (state.currentSource?.id === id) {
          state.currentSource = null;
        }
        
        rssSlice.caseReducers.updateStats(state);
      })
      
      // 刷新单个RSS源
      .addCase(refreshRSSSource.pending, (state, action) => {
        const sourceId = action.meta.arg;
        state.refreshing.sources.add(sourceId);
        state.error = null;
      })
      .addCase(refreshRSSSource.fulfilled, (state, action) => {
        const { id } = action.payload;
        state.refreshing.sources.delete(id);
        
        // 更新最后刷新时间
        rssSlice.caseReducers.updateSourceInList(state, {
          payload: {
            id,
            updates: { lastFetchedAt: new Date() },
          },
          type: 'updateSourceInList',
        });
      })
      .addCase(refreshRSSSource.rejected, (state, action) => {
        const sourceId = action.meta.arg;
        state.refreshing.sources.delete(sourceId);
        state.error = {
          code: 'REFRESH_RSS_SOURCE_ERROR',
          message: action.error.message || 'Failed to refresh RSS source',
          timestamp: new Date(),
        };
      })
      
      // 刷新所有RSS源
      .addCase(refreshAllRSSSources.pending, (state) => {
        state.refreshing.all = true;
        state.error = null;
      })
      .addCase(refreshAllRSSSources.fulfilled, (state, action) => {
        state.refreshing.all = false;
        state.stats.lastRefreshTime = new Date();
        
        // 更新所有源的最后刷新时间
        const now = new Date();
        state.sources.forEach(source => {
          if (source.isActive) {
            source.lastFetchedAt = now;
          }
        });
      })
      .addCase(refreshAllRSSSources.rejected, (state, action) => {
        state.refreshing.all = false;
        state.error = {
          code: 'REFRESH_ALL_RSS_SOURCES_ERROR',
          message: action.error.message || 'Failed to refresh RSS sources',
          timestamp: new Date(),
        };
      })
      
      // 切换RSS源激活状态
      .addCase(toggleRSSSourceActive.fulfilled, (state, action) => {
        const { id, isActive } = action.payload;
        rssSlice.caseReducers.updateSourceInList(state, {
          payload: { id, updates: { isActive } },
          type: 'updateSourceInList',
        });
        rssSlice.caseReducers.updateStats(state);
      })
      
      // 验证RSS URL
      .addCase(validateRSSUrl.pending, (state, action) => {
        state.validation.isValidating = true;
        state.validation.lastValidatedUrl = action.meta.arg;
        state.validation.validationResult = null;
      })
      .addCase(validateRSSUrl.fulfilled, (state, action) => {
        state.validation.isValidating = false;
        state.validation.validationResult = action.payload;
      })
      .addCase(validateRSSUrl.rejected, (state, action) => {
        state.validation.isValidating = false;
        state.validation.validationResult = {
          isValid: false,
          error: action.error.message || 'Validation failed',
        };
      })
      
      // 获取单个RSS源
      .addCase(fetchRSSSourceById.pending, (state) => {
        state.loading.currentSource = true;
      })
      .addCase(fetchRSSSourceById.fulfilled, (state, action) => {
        state.loading.currentSource = false;
        state.currentSource = action.payload;
      })
      .addCase(fetchRSSSourceById.rejected, (state, action) => {
        state.loading.currentSource = false;
        state.error = {
          code: 'FETCH_RSS_SOURCE_ERROR',
          message: action.error.message || 'Failed to fetch RSS source',
          timestamp: new Date(),
        };
      })
      
      // 获取分类
      .addCase(fetchRSSCategories.pending, (state) => {
        state.loading.categories = true;
      })
      .addCase(fetchRSSCategories.fulfilled, (state, action) => {
        state.loading.categories = false;
        state.categories = action.payload;
      })
      .addCase(fetchRSSCategories.rejected, (state) => {
        state.loading.categories = false;
      })
      
      // 导入OPML
      .addCase(importOPML.pending, (state) => {
        state.importExport.importing = true;
        state.importExport.lastImportResult = null;
      })
      .addCase(importOPML.fulfilled, (state, action) => {
        state.importExport.importing = false;
        state.importExport.lastImportResult = action.payload;
        
        // 重新获取源列表
        // 注意：这里应该触发fetchRSSSources，但在reducer中不能直接dispatch
        // 实际使用时需要在组件中监听这个action并手动dispatch fetchRSSSources
      })
      .addCase(importOPML.rejected, (state, action) => {
        state.importExport.importing = false;
        state.error = {
          code: 'IMPORT_OPML_ERROR',
          message: action.error.message || 'Failed to import OPML',
          timestamp: new Date(),
        };
      })
      
      // 导出OPML
      .addCase(exportOPML.pending, (state) => {
        state.importExport.exporting = true;
      })
      .addCase(exportOPML.fulfilled, (state) => {
        state.importExport.exporting = false;
      })
      .addCase(exportOPML.rejected, (state, action) => {
        state.importExport.exporting = false;
        state.error = {
          code: 'EXPORT_OPML_ERROR',
          message: action.error.message || 'Failed to export OPML',
          timestamp: new Date(),
        };
      });
  },
});

// 导出actions
export const {
  setSelectedCategory,
  setCurrentSource,
  clearValidationResult,
  clearImportResult,
  clearError,
  updateSourceInList,
  updateStats,
} = rssSlice.actions;

// 导出reducer
export default rssSlice.reducer;

// 选择器
export const selectRSSSources = (state: { rss: RSSState }) => state.rss.sources;
export const selectCurrentSource = (state: { rss: RSSState }) => state.rss.currentSource;
export const selectRSSCategories = (state: { rss: RSSState }) => state.rss.categories;
export const selectSelectedCategory = (state: { rss: RSSState }) => state.rss.selectedCategory;
export const selectRSSStats = (state: { rss: RSSState }) => state.rss.stats;
export const selectRSSLoading = (state: { rss: RSSState }) => state.rss.loading;
export const selectRSSError = (state: { rss: RSSState }) => state.rss.error;
export const selectRefreshingState = (state: { rss: RSSState }) => state.rss.refreshing;
export const selectValidationState = (state: { rss: RSSState }) => state.rss.validation;
export const selectImportExportState = (state: { rss: RSSState }) => state.rss.importExport;

// 复合选择器
export const selectActiveRSSSources = (state: { rss: RSSState }) => 
  state.rss.sources.filter(source => source.isActive);

export const selectRSSSourcesByCategory = (state: { rss: RSSState }, category: string) => 
  state.rss.sources.filter(source => source.category === category);

export const selectIsRefreshing = (state: { rss: RSSState }, sourceId?: number) => {
  if (sourceId) {
    return state.rss.refreshing.sources.has(sourceId);
  }
  return state.rss.refreshing.all || state.rss.refreshing.sources.size > 0;
};