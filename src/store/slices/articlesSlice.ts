import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Article, AppError } from '../../types';
import { articleService } from '../../services';

// 异步thunk actions
export const fetchArticles = createAsyncThunk(
  'articles/fetchArticles',
  async (params: {
    limit?: number;
    offset?: number;
    rssSourceId?: number;
    isRead?: boolean;
    isFavorite?: boolean;
    difficulty?: string;
    sortBy?: 'published_at' | 'title' | 'word_count';
    sortOrder?: 'ASC' | 'DESC';
  } = {}) => {
    return await articleService.getArticles(params);
  }
);

export const fetchArticleById = createAsyncThunk(
  'articles/fetchArticleById',
  async (id: number) => {
    const article = await articleService.getArticleById(id);
    if (!article) {
      throw new Error('Article not found');
    }
    return article;
  }
);

export const searchArticles = createAsyncThunk(
  'articles/searchArticles',
  async (params: {
    query: string;
    limit?: number;
    offset?: number;
    rssSourceId?: number;
  }) => {
    return await articleService.searchArticles(params.query, params);
  }
);

export const markArticleAsRead = createAsyncThunk(
  'articles/markAsRead',
  async (params: { id: number; progress?: number }) => {
    await articleService.markAsRead(params.id, params.progress);
    return params;
  }
);

export const markArticleAsUnread = createAsyncThunk(
  'articles/markAsUnread',
  async (id: number) => {
    await articleService.markAsUnread(id);
    return id;
  }
);

export const toggleArticleFavorite = createAsyncThunk(
  'articles/toggleFavorite',
  async (id: number) => {
    const isFavorite = await articleService.toggleFavorite(id);
    return { id, isFavorite };
  }
);

export const updateReadingProgress = createAsyncThunk(
  'articles/updateReadingProgress',
  async (params: { id: number; progress: number }) => {
    await articleService.updateReadingProgress(params.id, params.progress);
    return params;
  }
);

export const addArticleTag = createAsyncThunk(
  'articles/addTag',
  async (params: { id: number; tag: string }) => {
    await articleService.addTag(params.id, params.tag);
    return params;
  }
);

export const removeArticleTag = createAsyncThunk(
  'articles/removeTag',
  async (params: { id: number; tag: string }) => {
    await articleService.removeTag(params.id, params.tag);
    return params;
  }
);

export const fetchRecommendedArticles = createAsyncThunk(
  'articles/fetchRecommended',
  async (limit: number = 10) => {
    return await articleService.getRecommendedArticles(limit);
  }
);

export const fetchRecentlyRead = createAsyncThunk(
  'articles/fetchRecentlyRead',
  async (limit: number = 10) => {
    return await articleService.getRecentlyRead(limit);
  }
);

export const fetchCurrentlyReading = createAsyncThunk(
  'articles/fetchCurrentlyReading',
  async (limit: number = 5) => {
    return await articleService.getCurrentlyReading(limit);
  }
);

export const fetchReadingStats = createAsyncThunk(
  'articles/fetchReadingStats',
  async () => {
    return await articleService.getReadingStats();
  }
);

export const deleteArticle = createAsyncThunk(
  'articles/deleteArticle',
  async (id: number) => {
    await articleService.deleteArticle(id);
    return id;
  }
);

// State interface
interface ArticlesState {
  // 文章列表
  articles: Article[];
  currentArticle: Article | null;
  recommendedArticles: Article[];
  recentlyRead: Article[];
  currentlyReading: Article[];
  
  // 搜索相关
  searchResults: Article[];
  searchQuery: string;
  
  // 统计信息
  readingStats: {
    totalArticles: number;
    readArticles: number;
    favoriteArticles: number;
    totalWords: number;
    readWords: number;
    averageReadingTime: number;
  } | null;
  
  // 分页和过滤
  pagination: {
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
    limit: number;
  };
  
  filters: {
    rssSourceId?: number;
    isRead?: boolean;
    isFavorite?: boolean;
    difficulty?: string;
    sortBy: 'published_at' | 'title' | 'word_count';
    sortOrder: 'ASC' | 'DESC';
  };
  
  // 加载状态
  loading: {
    articles: boolean;
    currentArticle: boolean;
    search: boolean;
    recommended: boolean;
    stats: boolean;
  };
  
  // 错误状态
  error: AppError | null;
}

// 初始状态
const initialState: ArticlesState = {
  articles: [],
  currentArticle: null,
  recommendedArticles: [],
  recentlyRead: [],
  currentlyReading: [],
  
  searchResults: [],
  searchQuery: '',
  
  readingStats: null,
  
  pagination: {
    currentPage: 1,
    totalPages: 1,
    hasMore: true,
    limit: 20,
  },
  
  filters: {
    sortBy: 'published_at',
    sortOrder: 'DESC',
  },
  
  loading: {
    articles: false,
    currentArticle: false,
    search: false,
    recommended: false,
    stats: false,
  },
  
  error: null,
};

// 创建slice
const articlesSlice = createSlice({
  name: 'articles',
  initialState,
  reducers: {
    // 设置过滤器
    setFilters: (state, action: PayloadAction<Partial<ArticlesState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
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
    
    // 重置分页
    resetPagination: (state) => {
      state.pagination = {
        currentPage: 1,
        totalPages: 1,
        hasMore: true,
        limit: 20,
      };
    },
    
    // 设置当前文章
    setCurrentArticle: (state, action: PayloadAction<Article | null>) => {
      state.currentArticle = action.payload;
    },
    
    // 清除错误
    clearError: (state) => {
      state.error = null;
    },
    
    // 更新文章在列表中的状态
    updateArticleInList: (state, action: PayloadAction<{ id: number; updates: Partial<Article> }>) => {
      const { id, updates } = action.payload;
      
      // 更新主列表
      const articleIndex = state.articles.findIndex(article => article.id === id);
      if (articleIndex !== -1) {
        state.articles[articleIndex] = { ...state.articles[articleIndex], ...updates };
      }
      
      // 更新当前文章
      if (state.currentArticle?.id === id) {
        state.currentArticle = { ...state.currentArticle, ...updates };
      }
      
      // 更新其他列表
      const updateList = (list: Article[]) => {
        const index = list.findIndex(article => article.id === id);
        if (index !== -1) {
          list[index] = { ...list[index], ...updates };
        }
      };
      
      updateList(state.recommendedArticles);
      updateList(state.recentlyRead);
      updateList(state.currentlyReading);
      updateList(state.searchResults);
    },
  },
  
  extraReducers: (builder) => {
    // 获取文章列表
    builder
      .addCase(fetchArticles.pending, (state) => {
        state.loading.articles = true;
        state.error = null;
      })
      .addCase(fetchArticles.fulfilled, (state, action) => {
        state.loading.articles = false;
        
        if (state.pagination.currentPage === 1) {
          state.articles = action.payload;
        } else {
          state.articles.push(...action.payload);
        }
        
        state.pagination.hasMore = action.payload.length === state.pagination.limit;
        if (action.payload.length > 0) {
          state.pagination.currentPage += 1;
        }
      })
      .addCase(fetchArticles.rejected, (state, action) => {
        state.loading.articles = false;
        state.error = {
          code: 'FETCH_ARTICLES_ERROR',
          message: action.error.message || 'Failed to fetch articles',
          timestamp: new Date(),
        };
      })
      
      // 获取单篇文章
      .addCase(fetchArticleById.pending, (state) => {
        state.loading.currentArticle = true;
        state.error = null;
      })
      .addCase(fetchArticleById.fulfilled, (state, action) => {
        state.loading.currentArticle = false;
        state.currentArticle = action.payload;
      })
      .addCase(fetchArticleById.rejected, (state, action) => {
        state.loading.currentArticle = false;
        state.error = {
          code: 'FETCH_ARTICLE_ERROR',
          message: action.error.message || 'Failed to fetch article',
          timestamp: new Date(),
        };
      })
      
      // 搜索文章
      .addCase(searchArticles.pending, (state) => {
        state.loading.search = true;
        state.error = null;
      })
      .addCase(searchArticles.fulfilled, (state, action) => {
        state.loading.search = false;
        state.searchResults = action.payload;
      })
      .addCase(searchArticles.rejected, (state, action) => {
        state.loading.search = false;
        state.error = {
          code: 'SEARCH_ARTICLES_ERROR',
          message: action.error.message || 'Failed to search articles',
          timestamp: new Date(),
        };
      })
      
      // 标记为已读
      .addCase(markArticleAsRead.fulfilled, (state, action) => {
        const { id, progress = 100 } = action.payload;
        articlesSlice.caseReducers.updateArticleInList(state, {
          payload: {
            id,
            updates: {
              isRead: true,
              readProgress: progress,
              readAt: new Date(),
            },
          },
          type: 'updateArticleInList',
        });
      })
      
      // 标记为未读
      .addCase(markArticleAsUnread.fulfilled, (state, action) => {
        const id = action.payload;
        articlesSlice.caseReducers.updateArticleInList(state, {
          payload: {
            id,
            updates: {
              isRead: false,
              readProgress: 0,
              readAt: undefined,
            },
          },
          type: 'updateArticleInList',
        });
      })
      
      // 切换收藏状态
      .addCase(toggleArticleFavorite.fulfilled, (state, action) => {
        const { id, isFavorite } = action.payload;
        articlesSlice.caseReducers.updateArticleInList(state, {
          payload: {
            id,
            updates: { isFavorite },
          },
          type: 'updateArticleInList',
        });
      })
      
      // 更新阅读进度
      .addCase(updateReadingProgress.fulfilled, (state, action) => {
        const { id, progress } = action.payload;
        articlesSlice.caseReducers.updateArticleInList(state, {
          payload: {
            id,
            updates: { readProgress: progress },
          },
          type: 'updateArticleInList',
        });
      })
      
      // 获取推荐文章
      .addCase(fetchRecommendedArticles.pending, (state) => {
        state.loading.recommended = true;
      })
      .addCase(fetchRecommendedArticles.fulfilled, (state, action) => {
        state.loading.recommended = false;
        state.recommendedArticles = action.payload;
      })
      .addCase(fetchRecommendedArticles.rejected, (state) => {
        state.loading.recommended = false;
      })
      
      // 获取最近阅读
      .addCase(fetchRecentlyRead.fulfilled, (state, action) => {
        state.recentlyRead = action.payload;
      })
      
      // 获取正在阅读
      .addCase(fetchCurrentlyReading.fulfilled, (state, action) => {
        state.currentlyReading = action.payload;
      })
      
      // 获取阅读统计
      .addCase(fetchReadingStats.pending, (state) => {
        state.loading.stats = true;
      })
      .addCase(fetchReadingStats.fulfilled, (state, action) => {
        state.loading.stats = false;
        state.readingStats = action.payload;
      })
      .addCase(fetchReadingStats.rejected, (state) => {
        state.loading.stats = false;
      })
      
      // 删除文章
      .addCase(deleteArticle.fulfilled, (state, action) => {
        const id = action.payload;
        state.articles = state.articles.filter(article => article.id !== id);
        state.searchResults = state.searchResults.filter(article => article.id !== id);
        state.recommendedArticles = state.recommendedArticles.filter(article => article.id !== id);
        state.recentlyRead = state.recentlyRead.filter(article => article.id !== id);
        state.currentlyReading = state.currentlyReading.filter(article => article.id !== id);
        
        if (state.currentArticle?.id === id) {
          state.currentArticle = null;
        }
      });
  },
});

// 导出actions
export const {
  setFilters,
  setSearchQuery,
  clearSearchResults,
  resetPagination,
  setCurrentArticle,
  clearError,
  updateArticleInList,
} = articlesSlice.actions;

// 导出reducer
export default articlesSlice.reducer;

// 选择器
export const selectArticles = (state: { articles: ArticlesState }) => state.articles.articles;
export const selectCurrentArticle = (state: { articles: ArticlesState }) => state.articles.currentArticle;
export const selectSearchResults = (state: { articles: ArticlesState }) => state.articles.searchResults;
export const selectRecommendedArticles = (state: { articles: ArticlesState }) => state.articles.recommendedArticles;
export const selectReadingStats = (state: { articles: ArticlesState }) => state.articles.readingStats;
export const selectArticlesLoading = (state: { articles: ArticlesState }) => state.articles.loading;
export const selectArticlesError = (state: { articles: ArticlesState }) => state.articles.error;
export const selectFilters = (state: { articles: ArticlesState }) => state.articles.filters;
export const selectPagination = (state: { articles: ArticlesState }) => state.articles.pagination;