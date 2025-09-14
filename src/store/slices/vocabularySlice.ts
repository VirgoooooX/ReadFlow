import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { VocabularyEntry, LearningStats, AppError } from '../../types';
import { vocabularyService } from '../../services';

// 异步thunk actions
export const fetchVocabularyEntries = createAsyncThunk(
  'vocabulary/fetchEntries',
  async (params: {
    limit?: number;
    offset?: number;
    tags?: string[];
    difficulty?: string;
    sortBy?: 'added_at' | 'word' | 'review_count' | 'last_reviewed';
    sortOrder?: 'ASC' | 'DESC';
  } = {}) => {
    return await vocabularyService.getVocabularyEntries(params);
  }
);

export const searchVocabulary = createAsyncThunk(
  'vocabulary/searchEntries',
  async (params: {
    query: string;
    limit?: number;
    offset?: number;
  }) => {
    return await vocabularyService.searchVocabulary(params.query, params);
  }
);

export const addVocabularyEntry = createAsyncThunk(
  'vocabulary/addEntry',
  async (params: {
    word: string;
    context?: string;
    sourceArticleId?: number;
    tags?: string[];
    notes?: string;
  }) => {
    return await vocabularyService.addWord(
      params.word,
      params.context,
      params.sourceArticleId,
      params.tags,
      params.notes
    );
  }
);

export const updateVocabularyEntry = createAsyncThunk(
  'vocabulary/updateEntry',
  async (params: {
    id: number;
    updates: {
      notes?: string;
      tags?: string[];
      difficulty?: string;
      isArchived?: boolean;
    };
  }) => {
    const { id, updates } = params;
    
    if (updates.notes !== undefined) {
      await vocabularyService.updateNotes(id, updates.notes);
    }
    
    if (updates.tags !== undefined) {
      // 这里需要实现标签的完整更新逻辑
      // 暂时简化处理
      for (const tag of updates.tags) {
        await vocabularyService.addTag(id, tag);
      }
    }
    
    return { id, updates };
  }
);

export const deleteVocabularyEntry = createAsyncThunk(
  'vocabulary/deleteEntry',
  async (id: number) => {
    await vocabularyService.deleteWord(id);
    return id;
  }
);

export const recordReviewResult = createAsyncThunk(
  'vocabulary/recordReview',
  async (params: {
    id: number;
    isCorrect: boolean;
    reviewType: 'recognition' | 'recall' | 'spelling';
    responseTime?: number;
  }) => {
    await vocabularyService.recordReviewResult(
      params.id,
      params.isCorrect,
      params.reviewType,
      params.responseTime
    );
    return params;
  }
);

export const addVocabularyTag = createAsyncThunk(
  'vocabulary/addTag',
  async (params: { id: number; tag: string }) => {
    await vocabularyService.addTag(params.id, params.tag);
    return params;
  }
);

export const removeVocabularyTag = createAsyncThunk(
  'vocabulary/removeTag',
  async (params: { id: number; tag: string }) => {
    await vocabularyService.removeTag(params.id, params.tag);
    return params;
  }
);

export const fetchLearningStats = createAsyncThunk(
  'vocabulary/fetchLearningStats',
  async () => {
    return await vocabularyService.getLearningStats();
  }
);

export const fetchVocabularyTags = createAsyncThunk(
  'vocabulary/fetchTags',
  async () => {
    return await vocabularyService.getAllTags();
  }
);

export const fetchDueForReview = createAsyncThunk(
  'vocabulary/fetchDueForReview',
  async (limit: number = 20) => {
    return await vocabularyService.getDueForReview(limit);
  }
);

export const fetchRecentlyAdded = createAsyncThunk(
  'vocabulary/fetchRecentlyAdded',
  async (limit: number = 10) => {
    return await vocabularyService.getRecentlyAdded(limit);
  }
);

export const fetchDifficultWords = createAsyncThunk(
  'vocabulary/fetchDifficultWords',
  async (limit: number = 10) => {
    return await vocabularyService.getDifficultWords(limit);
  }
);

export const fetchMasteredWords = createAsyncThunk(
  'vocabulary/fetchMasteredWords',
  async (limit: number = 10) => {
    return await vocabularyService.getMasteredWords(limit);
  }
);

export const exportVocabulary = createAsyncThunk(
  'vocabulary/exportVocabulary',
  async (format: 'json' | 'csv' | 'anki') => {
    return await vocabularyService.exportVocabulary(format);
  }
);

export const importVocabulary = createAsyncThunk(
  'vocabulary/importVocabulary',
  async (params: { data: string; format: 'json' | 'csv' }) => {
    return await vocabularyService.importVocabulary(params.data, params.format);
  }
);

export const batchUpdateEntries = createAsyncThunk(
  'vocabulary/batchUpdate',
  async (params: {
    ids: number[];
    updates: {
      tags?: string[];
      difficulty?: string;
      isArchived?: boolean;
    };
  }) => {
    // 批量更新逻辑
    const { ids, updates } = params;
    const results = [];
    
    for (const id of ids) {
      if (updates.tags) {
        for (const tag of updates.tags) {
          await vocabularyService.addTag(id, tag);
        }
      }
      results.push({ id, updates });
    }
    
    return results;
  }
);

// State interface
interface VocabularyState {
  // 单词条目
  entries: VocabularyEntry[];
  currentEntry: VocabularyEntry | null;
  
  // 搜索相关
  searchResults: VocabularyEntry[];
  searchQuery: string;
  
  // 学习相关
  dueForReview: VocabularyEntry[];
  recentlyAdded: VocabularyEntry[];
  difficultWords: VocabularyEntry[];
  masteredWords: VocabularyEntry[];
  
  // 标签
  tags: string[];
  selectedTags: string[];
  
  // 学习统计
  learningStats: LearningStats | null;
  
  // 复习会话
  reviewSession: {
    isActive: boolean;
    currentIndex: number;
    entries: VocabularyEntry[];
    results: {
      entryId: number;
      isCorrect: boolean;
      reviewType: 'recognition' | 'recall' | 'spelling';
      responseTime: number;
    }[];
    startTime: Date | null;
  };
  
  // 过滤和排序
  filters: {
    difficulty?: string;
    tags: string[];
    isArchived: boolean;
    sortBy: 'added_at' | 'word' | 'review_count' | 'last_reviewed';
    sortOrder: 'ASC' | 'DESC';
  };
  
  // 分页
  pagination: {
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
    limit: number;
  };
  
  // 导入导出
  importExport: {
    importing: boolean;
    exporting: boolean;
    lastImportResult: {
      success: number;
      failed: number;
      errors: string[];
    } | null;
    exportData: string | null;
  };
  
  // 加载状态
  loading: {
    entries: boolean;
    search: boolean;
    stats: boolean;
    tags: boolean;
    review: boolean;
  };
  
  // 错误状态
  error: AppError | null;
}

// 初始状态
const initialState: VocabularyState = {
  entries: [],
  currentEntry: null,
  
  searchResults: [],
  searchQuery: '',
  
  dueForReview: [],
  recentlyAdded: [],
  difficultWords: [],
  masteredWords: [],
  
  tags: [],
  selectedTags: [],
  
  learningStats: null,
  
  reviewSession: {
    isActive: false,
    currentIndex: 0,
    entries: [],
    results: [],
    startTime: null,
  },
  
  filters: {
    tags: [],
    isArchived: false,
    sortBy: 'added_at',
    sortOrder: 'DESC',
  },
  
  pagination: {
    currentPage: 1,
    totalPages: 1,
    hasMore: true,
    limit: 20,
  },
  
  importExport: {
    importing: false,
    exporting: false,
    lastImportResult: null,
    exportData: null,
  },
  
  loading: {
    entries: false,
    search: false,
    stats: false,
    tags: false,
    review: false,
  },
  
  error: null,
};

// 创建slice
const vocabularySlice = createSlice({
  name: 'vocabulary',
  initialState,
  reducers: {
    // 设置过滤器
    setFilters: (state, action: PayloadAction<Partial<VocabularyState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
      state.pagination.currentPage = 1;
    },
    
    // 设置选中的标签
    setSelectedTags: (state, action: PayloadAction<string[]>) => {
      state.selectedTags = action.payload;
      state.filters.tags = action.payload;
      state.pagination.currentPage = 1;
    },
    
    // 设置搜索查询
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    
    // 清除搜索结果
    clearSearchResults: (state) => {
      state.searchResults = [];
      state.searchQuery = '';
    },
    
    // 设置当前条目
    setCurrentEntry: (state, action: PayloadAction<VocabularyEntry | null>) => {
      state.currentEntry = action.payload;
    },
    
    // 开始复习会话
    startReviewSession: (state, action: PayloadAction<VocabularyEntry[]>) => {
      state.reviewSession = {
        isActive: true,
        currentIndex: 0,
        entries: action.payload,
        results: [],
        startTime: new Date(),
      };
    },
    
    // 结束复习会话
    endReviewSession: (state) => {
      state.reviewSession = {
        isActive: false,
        currentIndex: 0,
        entries: [],
        results: [],
        startTime: null,
      };
    },
    
    // 下一个复习项目
    nextReviewItem: (state) => {
      if (state.reviewSession.currentIndex < state.reviewSession.entries.length - 1) {
        state.reviewSession.currentIndex += 1;
      }
    },
    
    // 上一个复习项目
    previousReviewItem: (state) => {
      if (state.reviewSession.currentIndex > 0) {
        state.reviewSession.currentIndex -= 1;
      }
    },
    
    // 添加复习结果
    addReviewResult: (state, action: PayloadAction<{
      entryId: number;
      isCorrect: boolean;
      reviewType: 'recognition' | 'recall' | 'spelling';
      responseTime: number;
    }>) => {
      state.reviewSession.results.push(action.payload);
    },
    
    // 重置分页
    resetPagination: (state) => {
      state.pagination = {
        currentPage: 1,
        totalPages: 1,
        hasMore: true,
        limit: 20,
      };
    },
    
    // 清除错误
    clearError: (state) => {
      state.error = null;
    },
    
    // 清除导入结果
    clearImportResult: (state) => {
      state.importExport.lastImportResult = null;
    },
    
    // 清除导出数据
    clearExportData: (state) => {
      state.importExport.exportData = null;
    },
    
    // 更新条目在列表中的状态
    updateEntryInList: (state, action: PayloadAction<{ id: number; updates: Partial<VocabularyEntry> }>) => {
      const { id, updates } = action.payload;
      
      // 更新主列表
      const entryIndex = state.entries.findIndex(entry => entry.id === id);
      if (entryIndex !== -1) {
        state.entries[entryIndex] = { ...state.entries[entryIndex], ...updates };
      }
      
      // 更新当前条目
      if (state.currentEntry?.id === id) {
        state.currentEntry = { ...state.currentEntry, ...updates };
      }
      
      // 更新其他列表
      const updateList = (list: VocabularyEntry[]) => {
        const index = list.findIndex(entry => entry.id === id);
        if (index !== -1) {
          list[index] = { ...list[index], ...updates };
        }
      };
      
      updateList(state.searchResults);
      updateList(state.dueForReview);
      updateList(state.recentlyAdded);
      updateList(state.difficultWords);
      updateList(state.masteredWords);
      updateList(state.reviewSession.entries);
    },
  },
  
  extraReducers: (builder) => {
    // 获取单词条目
    builder
      .addCase(fetchVocabularyEntries.pending, (state) => {
        state.loading.entries = true;
        state.error = null;
      })
      .addCase(fetchVocabularyEntries.fulfilled, (state, action) => {
        state.loading.entries = false;
        
        if (state.pagination.currentPage === 1) {
          state.entries = action.payload;
        } else {
          state.entries.push(...action.payload);
        }
        
        state.pagination.hasMore = action.payload.length === state.pagination.limit;
        if (action.payload.length > 0) {
          state.pagination.currentPage += 1;
        }
      })
      .addCase(fetchVocabularyEntries.rejected, (state, action) => {
        state.loading.entries = false;
        state.error = {
          code: 'FETCH_VOCABULARY_ERROR',
          message: action.error.message || 'Failed to fetch vocabulary entries',
          timestamp: new Date(),
        };
      })
      
      // 搜索单词
      .addCase(searchVocabulary.pending, (state) => {
        state.loading.search = true;
      })
      .addCase(searchVocabulary.fulfilled, (state, action) => {
        state.loading.search = false;
        state.searchResults = action.payload;
      })
      .addCase(searchVocabulary.rejected, (state) => {
        state.loading.search = false;
      })
      
      // 添加单词
      .addCase(addVocabularyEntry.fulfilled, (state, action) => {
        state.entries.unshift(action.payload);
        state.recentlyAdded.unshift(action.payload);
        
        // 更新标签列表
        if (action.payload.tags) {
          action.payload.tags.forEach(tag => {
            if (!state.tags.includes(tag)) {
              state.tags.push(tag);
            }
          });
        }
      })
      
      // 更新单词条目
      .addCase(updateVocabularyEntry.fulfilled, (state, action) => {
        const { id, updates } = action.payload;
        vocabularySlice.caseReducers.updateEntryInList(state, {
          payload: { id, updates },
          type: 'updateEntryInList',
        });
      })
      
      // 删除单词条目
      .addCase(deleteVocabularyEntry.fulfilled, (state, action) => {
        const id = action.payload;
        state.entries = state.entries.filter(entry => entry.id !== id);
        state.searchResults = state.searchResults.filter(entry => entry.id !== id);
        state.dueForReview = state.dueForReview.filter(entry => entry.id !== id);
        state.recentlyAdded = state.recentlyAdded.filter(entry => entry.id !== id);
        state.difficultWords = state.difficultWords.filter(entry => entry.id !== id);
        state.masteredWords = state.masteredWords.filter(entry => entry.id !== id);
        
        if (state.currentEntry?.id === id) {
          state.currentEntry = null;
        }
      })
      
      // 记录复习结果
      .addCase(recordReviewResult.fulfilled, (state, action) => {
        const { id, isCorrect } = action.payload;
        
        // 更新条目的复习统计
        vocabularySlice.caseReducers.updateEntryInList(state, {
          payload: {
            id,
            updates: {
              reviewCount: (state.entries.find(e => e.id === id)?.reviewCount || 0) + 1,
              lastReviewedAt: new Date(),
              correctCount: isCorrect 
                ? ((state.entries.find(e => e.id === id)?.correctCount || 0) + 1)
                : (state.entries.find(e => e.id === id)?.correctCount || 0),
            },
          },
          type: 'updateEntryInList',
        });
      })
      
      // 获取学习统计
      .addCase(fetchLearningStats.pending, (state) => {
        state.loading.stats = true;
      })
      .addCase(fetchLearningStats.fulfilled, (state, action) => {
        state.loading.stats = false;
        state.learningStats = action.payload;
      })
      .addCase(fetchLearningStats.rejected, (state) => {
        state.loading.stats = false;
      })
      
      // 获取标签
      .addCase(fetchVocabularyTags.pending, (state) => {
        state.loading.tags = true;
      })
      .addCase(fetchVocabularyTags.fulfilled, (state, action) => {
        state.loading.tags = false;
        state.tags = action.payload;
      })
      .addCase(fetchVocabularyTags.rejected, (state) => {
        state.loading.tags = false;
      })
      
      // 获取待复习单词
      .addCase(fetchDueForReview.pending, (state) => {
        state.loading.review = true;
      })
      .addCase(fetchDueForReview.fulfilled, (state, action) => {
        state.loading.review = false;
        state.dueForReview = action.payload;
      })
      .addCase(fetchDueForReview.rejected, (state) => {
        state.loading.review = false;
      })
      
      // 获取最近添加
      .addCase(fetchRecentlyAdded.fulfilled, (state, action) => {
        state.recentlyAdded = action.payload;
      })
      
      // 获取困难单词
      .addCase(fetchDifficultWords.fulfilled, (state, action) => {
        state.difficultWords = action.payload;
      })
      
      // 获取已掌握单词
      .addCase(fetchMasteredWords.fulfilled, (state, action) => {
        state.masteredWords = action.payload;
      })
      
      // 导出单词本
      .addCase(exportVocabulary.pending, (state) => {
        state.importExport.exporting = true;
      })
      .addCase(exportVocabulary.fulfilled, (state, action) => {
        state.importExport.exporting = false;
        state.importExport.exportData = action.payload;
      })
      .addCase(exportVocabulary.rejected, (state, action) => {
        state.importExport.exporting = false;
        state.error = {
          code: 'EXPORT_VOCABULARY_ERROR',
          message: action.error.message || 'Failed to export vocabulary',
          timestamp: new Date(),
        };
      })
      
      // 导入单词本
      .addCase(importVocabulary.pending, (state) => {
        state.importExport.importing = true;
      })
      .addCase(importVocabulary.fulfilled, (state, action) => {
        state.importExport.importing = false;
        state.importExport.lastImportResult = action.payload;
      })
      .addCase(importVocabulary.rejected, (state, action) => {
        state.importExport.importing = false;
        state.error = {
          code: 'IMPORT_VOCABULARY_ERROR',
          message: action.error.message || 'Failed to import vocabulary',
          timestamp: new Date(),
        };
      });
  },
});

// 导出actions
export const {
  setFilters,
  setSelectedTags,
  setSearchQuery,
  clearSearchResults,
  setCurrentEntry,
  startReviewSession,
  endReviewSession,
  nextReviewItem,
  previousReviewItem,
  addReviewResult,
  resetPagination,
  clearError,
  clearImportResult,
  clearExportData,
  updateEntryInList,
} = vocabularySlice.actions;

// 导出reducer
export default vocabularySlice.reducer;

// 选择器
export const selectVocabularyEntries = (state: { vocabulary: VocabularyState }) => state.vocabulary.entries;
export const selectCurrentEntry = (state: { vocabulary: VocabularyState }) => state.vocabulary.currentEntry;
export const selectSearchResults = (state: { vocabulary: VocabularyState }) => state.vocabulary.searchResults;
export const selectDueForReview = (state: { vocabulary: VocabularyState }) => state.vocabulary.dueForReview;
export const selectLearningStats = (state: { vocabulary: VocabularyState }) => state.vocabulary.learningStats;
export const selectVocabularyTags = (state: { vocabulary: VocabularyState }) => state.vocabulary.tags;
export const selectReviewSession = (state: { vocabulary: VocabularyState }) => state.vocabulary.reviewSession;
export const selectVocabularyLoading = (state: { vocabulary: VocabularyState }) => state.vocabulary.loading;
export const selectVocabularyError = (state: { vocabulary: VocabularyState }) => state.vocabulary.error;
export const selectVocabularyFilters = (state: { vocabulary: VocabularyState }) => state.vocabulary.filters;
export const selectImportExportState = (state: { vocabulary: VocabularyState }) => state.vocabulary.importExport;

// 复合选择器
export const selectCurrentReviewItem = (state: { vocabulary: VocabularyState }) => {
  const { reviewSession } = state.vocabulary;
  if (!reviewSession.isActive || reviewSession.entries.length === 0) {
    return null;
  }
  return reviewSession.entries[reviewSession.currentIndex];
};

export const selectReviewProgress = (state: { vocabulary: VocabularyState }) => {
  const { reviewSession } = state.vocabulary;
  if (!reviewSession.isActive) {
    return { current: 0, total: 0, percentage: 0 };
  }
  
  const current = reviewSession.currentIndex + 1;
  const total = reviewSession.entries.length;
  const percentage = total > 0 ? (current / total) * 100 : 0;
  
  return { current, total, percentage };
};

export const selectReviewSessionStats = (state: { vocabulary: VocabularyState }) => {
  const { reviewSession } = state.vocabulary;
  const { results } = reviewSession;
  
  const total = results.length;
  const correct = results.filter(r => r.isCorrect).length;
  const accuracy = total > 0 ? (correct / total) * 100 : 0;
  const averageTime = total > 0 
    ? results.reduce((sum, r) => sum + r.responseTime, 0) / total 
    : 0;
  
  return {
    total,
    correct,
    incorrect: total - correct,
    accuracy,
    averageTime,
  };
};