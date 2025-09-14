import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { ReadingSettings, AppSettings, AppError } from '../../types';
import { settingsService } from '../../services';

// 异步thunk actions
export const fetchReadingSettings = createAsyncThunk(
  'settings/fetchReadingSettings',
  async () => {
    return await settingsService.getReadingSettings();
  }
);

export const updateReadingSettings = createAsyncThunk(
  'settings/updateReadingSettings',
  async (settings: Partial<ReadingSettings>) => {
    await settingsService.updateReadingSettings(settings);
    return settings;
  }
);

export const resetReadingSettings = createAsyncThunk(
  'settings/resetReadingSettings',
  async () => {
    await settingsService.resetReadingSettings();
    return await settingsService.getReadingSettings();
  }
);

export const fetchAppSettings = createAsyncThunk(
  'settings/fetchAppSettings',
  async () => {
    return await settingsService.getAppSettings();
  }
);

export const updateAppSettings = createAsyncThunk(
  'settings/updateAppSettings',
  async (settings: Partial<AppSettings>) => {
    await settingsService.updateAppSettings(settings);
    return settings;
  }
);

export const resetAppSettings = createAsyncThunk(
  'settings/resetAppSettings',
  async () => {
    await settingsService.resetAppSettings();
    return await settingsService.getAppSettings();
  }
);

export const exportSettings = createAsyncThunk(
  'settings/exportSettings',
  async () => {
    return await settingsService.exportSettings();
  }
);

export const importSettings = createAsyncThunk(
  'settings/importSettings',
  async (settingsData: string) => {
    await settingsService.importSettings(settingsData);
    // 重新获取所有设置
    const [readingSettings, appSettings] = await Promise.all([
      settingsService.getReadingSettings(),
      settingsService.getAppSettings(),
    ]);
    return { readingSettings, appSettings };
  }
);

export const fetchStorageUsage = createAsyncThunk(
  'settings/fetchStorageUsage',
  async () => {
    return await settingsService.getStorageUsage();
  }
);

export const clearCache = createAsyncThunk(
  'settings/clearCache',
  async () => {
    await settingsService.clearCache();
    return await settingsService.getStorageUsage();
  }
);

export const clearReadingHistory = createAsyncThunk(
  'settings/clearReadingHistory',
  async () => {
    await settingsService.clearReadingHistory();
    return await settingsService.getStorageUsage();
  }
);

export const setUserPreference = createAsyncThunk(
  'settings/setUserPreference',
  async (params: { key: string; value: any }) => {
    await settingsService.setUserPreference(params.key, params.value);
    return params;
  }
);

export const getUserPreference = createAsyncThunk(
  'settings/getUserPreference',
  async (key: string) => {
    const value = await settingsService.getUserPreference(key);
    return { key, value };
  }
);

export const removeUserPreference = createAsyncThunk(
  'settings/removeUserPreference',
  async (key: string) => {
    await settingsService.removeUserPreference(key);
    return key;
  }
);

export const setTheme = createAsyncThunk(
  'settings/setTheme',
  async (theme: 'light' | 'dark' | 'system') => {
    await settingsService.setTheme(theme);
    return theme;
  }
);

export const getTheme = createAsyncThunk(
  'settings/getTheme',
  async () => {
    return await settingsService.getTheme();
  }
);

// State interface
interface SettingsState {
  // 阅读设置
  readingSettings: ReadingSettings | null;
  
  // 应用设置
  appSettings: AppSettings | null;
  
  // 用户偏好设置
  userPreferences: Record<string, any>;
  
  // 主题设置
  theme: 'light' | 'dark' | 'system';
  
  // 存储使用情况
  storageUsage: {
    totalSize: number;
    usedSize: number;
    availableSize: number;
    breakdown: {
      articles: number;
      vocabulary: number;
      cache: number;
      settings: number;
      other: number;
    };
  } | null;
  
  // 导入导出
  importExport: {
    importing: boolean;
    exporting: boolean;
    exportData: string | null;
    lastImportResult: {
      success: boolean;
      message: string;
    } | null;
  };
  
  // 临时设置（未保存）
  tempSettings: {
    reading: Partial<ReadingSettings>;
    app: Partial<AppSettings>;
  };
  
  // 设置变更历史
  changeHistory: {
    timestamp: Date;
    category: 'reading' | 'app' | 'preference';
    key: string;
    oldValue: any;
    newValue: any;
  }[];
  
  // 加载状态
  loading: {
    readingSettings: boolean;
    appSettings: boolean;
    storageUsage: boolean;
    theme: boolean;
    importExport: boolean;
  };
  
  // 错误状态
  error: AppError | null;
  
  // 设置是否有未保存的更改
  hasUnsavedChanges: boolean;
}

// 初始状态
const initialState: SettingsState = {
  readingSettings: null,
  appSettings: null,
  userPreferences: {},
  theme: 'system',
  storageUsage: null,
  
  importExport: {
    importing: false,
    exporting: false,
    exportData: null,
    lastImportResult: null,
  },
  
  tempSettings: {
    reading: {},
    app: {},
  },
  
  changeHistory: [],
  
  loading: {
    readingSettings: false,
    appSettings: false,
    storageUsage: false,
    theme: false,
    importExport: false,
  },
  
  error: null,
  hasUnsavedChanges: false,
};

// 创建slice
const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    // 设置临时阅读设置
    setTempReadingSettings: (state, action: PayloadAction<Partial<ReadingSettings>>) => {
      state.tempSettings.reading = { ...state.tempSettings.reading, ...action.payload };
      state.hasUnsavedChanges = true;
    },
    
    // 设置临时应用设置
    setTempAppSettings: (state, action: PayloadAction<Partial<AppSettings>>) => {
      state.tempSettings.app = { ...state.tempSettings.app, ...action.payload };
      state.hasUnsavedChanges = true;
    },
    
    // 重置临时设置
    resetTempSettings: (state) => {
      state.tempSettings = {
        reading: {},
        app: {},
      };
      state.hasUnsavedChanges = false;
    },
    
    // 应用临时设置到实际设置
    applyTempSettings: (state) => {
      if (state.readingSettings && Object.keys(state.tempSettings.reading).length > 0) {
        state.readingSettings = { ...state.readingSettings, ...state.tempSettings.reading };
      }
      
      if (state.appSettings && Object.keys(state.tempSettings.app).length > 0) {
        state.appSettings = { ...state.appSettings, ...state.tempSettings.app };
      }
      
      state.tempSettings = {
        reading: {},
        app: {},
      };
      state.hasUnsavedChanges = false;
    },
    
    // 添加变更历史记录
    addChangeHistory: (state, action: PayloadAction<{
      category: 'reading' | 'app' | 'preference';
      key: string;
      oldValue: any;
      newValue: any;
    }>) => {
      state.changeHistory.unshift({
        timestamp: new Date(),
        ...action.payload,
      });
      
      // 保持历史记录不超过100条
      if (state.changeHistory.length > 100) {
        state.changeHistory = state.changeHistory.slice(0, 100);
      }
    },
    
    // 清除变更历史
    clearChangeHistory: (state) => {
      state.changeHistory = [];
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
    
    // 设置用户偏好（本地状态）
    setUserPreferenceLocal: (state, action: PayloadAction<{ key: string; value: any }>) => {
      const { key, value } = action.payload;
      const oldValue = state.userPreferences[key];
      state.userPreferences[key] = value;
      
      // 添加到变更历史
      settingsSlice.caseReducers.addChangeHistory(state, {
        payload: {
          category: 'preference',
          key,
          oldValue,
          newValue: value,
        },
        type: 'addChangeHistory',
      });
    },
    
    // 移除用户偏好（本地状态）
    removeUserPreferenceLocal: (state, action: PayloadAction<string>) => {
      const key = action.payload;
      const oldValue = state.userPreferences[key];
      delete state.userPreferences[key];
      
      // 添加到变更历史
      settingsSlice.caseReducers.addChangeHistory(state, {
        payload: {
          category: 'preference',
          key,
          oldValue,
          newValue: undefined,
        },
        type: 'addChangeHistory',
      });
    },
  },
  
  extraReducers: (builder) => {
    // 获取阅读设置
    builder
      .addCase(fetchReadingSettings.pending, (state) => {
        state.loading.readingSettings = true;
        state.error = null;
      })
      .addCase(fetchReadingSettings.fulfilled, (state, action) => {
        state.loading.readingSettings = false;
        state.readingSettings = action.payload;
      })
      .addCase(fetchReadingSettings.rejected, (state, action) => {
        state.loading.readingSettings = false;
        state.error = {
          code: 'FETCH_READING_SETTINGS_ERROR',
          message: action.error.message || 'Failed to fetch reading settings',
          timestamp: new Date(),
        };
      })
      
      // 更新阅读设置
      .addCase(updateReadingSettings.fulfilled, (state, action) => {
        if (state.readingSettings) {
          const oldSettings = { ...state.readingSettings };
          state.readingSettings = { ...state.readingSettings, ...action.payload };
          
          // 记录变更
          Object.keys(action.payload).forEach(key => {
            settingsSlice.caseReducers.addChangeHistory(state, {
              payload: {
                category: 'reading',
                key,
                oldValue: oldSettings[key as keyof ReadingSettings],
                newValue: action.payload[key as keyof ReadingSettings],
              },
              type: 'addChangeHistory',
            });
          });
        }
      })
      
      // 重置阅读设置
      .addCase(resetReadingSettings.fulfilled, (state, action) => {
        state.readingSettings = action.payload;
      })
      
      // 获取应用设置
      .addCase(fetchAppSettings.pending, (state) => {
        state.loading.appSettings = true;
      })
      .addCase(fetchAppSettings.fulfilled, (state, action) => {
        state.loading.appSettings = false;
        state.appSettings = action.payload;
      })
      .addCase(fetchAppSettings.rejected, (state, action) => {
        state.loading.appSettings = false;
        state.error = {
          code: 'FETCH_APP_SETTINGS_ERROR',
          message: action.error.message || 'Failed to fetch app settings',
          timestamp: new Date(),
        };
      })
      
      // 更新应用设置
      .addCase(updateAppSettings.fulfilled, (state, action) => {
        if (state.appSettings) {
          const oldSettings = { ...state.appSettings };
          state.appSettings = { ...state.appSettings, ...action.payload };
          
          // 记录变更
          Object.keys(action.payload).forEach(key => {
            settingsSlice.caseReducers.addChangeHistory(state, {
              payload: {
                category: 'app',
                key,
                oldValue: oldSettings[key as keyof AppSettings],
                newValue: action.payload[key as keyof AppSettings],
              },
              type: 'addChangeHistory',
            });
          });
        }
      })
      
      // 重置应用设置
      .addCase(resetAppSettings.fulfilled, (state, action) => {
        state.appSettings = action.payload;
      })
      
      // 导出设置
      .addCase(exportSettings.pending, (state) => {
        state.loading.importExport = true;
        state.importExport.exporting = true;
      })
      .addCase(exportSettings.fulfilled, (state, action) => {
        state.loading.importExport = false;
        state.importExport.exporting = false;
        state.importExport.exportData = action.payload;
      })
      .addCase(exportSettings.rejected, (state, action) => {
        state.loading.importExport = false;
        state.importExport.exporting = false;
        state.error = {
          code: 'EXPORT_SETTINGS_ERROR',
          message: action.error.message || 'Failed to export settings',
          timestamp: new Date(),
        };
      })
      
      // 导入设置
      .addCase(importSettings.pending, (state) => {
        state.loading.importExport = true;
        state.importExport.importing = true;
      })
      .addCase(importSettings.fulfilled, (state, action) => {
        state.loading.importExport = false;
        state.importExport.importing = false;
        state.readingSettings = action.payload.readingSettings;
        state.appSettings = action.payload.appSettings;
        state.importExport.lastImportResult = {
          success: true,
          message: 'Settings imported successfully',
        };
      })
      .addCase(importSettings.rejected, (state, action) => {
        state.loading.importExport = false;
        state.importExport.importing = false;
        state.importExport.lastImportResult = {
          success: false,
          message: action.error.message || 'Failed to import settings',
        };
        state.error = {
          code: 'IMPORT_SETTINGS_ERROR',
          message: action.error.message || 'Failed to import settings',
          timestamp: new Date(),
        };
      })
      
      // 获取存储使用情况
      .addCase(fetchStorageUsage.pending, (state) => {
        state.loading.storageUsage = true;
      })
      .addCase(fetchStorageUsage.fulfilled, (state, action) => {
        state.loading.storageUsage = false;
        state.storageUsage = action.payload;
      })
      .addCase(fetchStorageUsage.rejected, (state) => {
        state.loading.storageUsage = false;
      })
      
      // 清除缓存
      .addCase(clearCache.fulfilled, (state, action) => {
        state.storageUsage = action.payload;
      })
      
      // 清除阅读历史
      .addCase(clearReadingHistory.fulfilled, (state, action) => {
        state.storageUsage = action.payload;
      })
      
      // 设置用户偏好
      .addCase(setUserPreference.fulfilled, (state, action) => {
        const { key, value } = action.payload;
        settingsSlice.caseReducers.setUserPreferenceLocal(state, {
          payload: { key, value },
          type: 'setUserPreferenceLocal',
        });
      })
      
      // 获取用户偏好
      .addCase(getUserPreference.fulfilled, (state, action) => {
        const { key, value } = action.payload;
        state.userPreferences[key] = value;
      })
      
      // 移除用户偏好
      .addCase(removeUserPreference.fulfilled, (state, action) => {
        const key = action.payload;
        settingsSlice.caseReducers.removeUserPreferenceLocal(state, {
          payload: key,
          type: 'removeUserPreferenceLocal',
        });
      })
      
      // 设置主题
      .addCase(setTheme.pending, (state) => {
        state.loading.theme = true;
      })
      .addCase(setTheme.fulfilled, (state, action) => {
        state.loading.theme = false;
        const oldTheme = state.theme;
        state.theme = action.payload;
        
        // 记录变更
        settingsSlice.caseReducers.addChangeHistory(state, {
          payload: {
            category: 'app',
            key: 'theme',
            oldValue: oldTheme,
            newValue: action.payload,
          },
          type: 'addChangeHistory',
        });
      })
      .addCase(setTheme.rejected, (state) => {
        state.loading.theme = false;
      })
      
      // 获取主题
      .addCase(getTheme.fulfilled, (state, action) => {
        state.theme = action.payload;
      });
  },
});

// 导出actions
export const {
  setTempReadingSettings,
  setTempAppSettings,
  resetTempSettings,
  applyTempSettings,
  addChangeHistory,
  clearChangeHistory,
  clearError,
  clearImportResult,
  clearExportData,
  setUserPreferenceLocal,
  removeUserPreferenceLocal,
} = settingsSlice.actions;

// 导出reducer
export default settingsSlice.reducer;

// 选择器
export const selectReadingSettings = (state: { settings: SettingsState }) => state.settings.readingSettings;
export const selectAppSettings = (state: { settings: SettingsState }) => state.settings.appSettings;
export const selectUserPreferences = (state: { settings: SettingsState }) => state.settings.userPreferences;
export const selectTheme = (state: { settings: SettingsState }) => state.settings.theme;
export const selectStorageUsage = (state: { settings: SettingsState }) => state.settings.storageUsage;
export const selectSettingsLoading = (state: { settings: SettingsState }) => state.settings.loading;
export const selectSettingsError = (state: { settings: SettingsState }) => state.settings.error;
export const selectTempSettings = (state: { settings: SettingsState }) => state.settings.tempSettings;
export const selectHasUnsavedChanges = (state: { settings: SettingsState }) => state.settings.hasUnsavedChanges;
export const selectChangeHistory = (state: { settings: SettingsState }) => state.settings.changeHistory;
export const selectImportExportState = (state: { settings: SettingsState }) => state.settings.importExport;

// 复合选择器
export const selectEffectiveReadingSettings = (state: { settings: SettingsState }) => {
  const { readingSettings, tempSettings } = state.settings;
  if (!readingSettings) return null;
  return { ...readingSettings, ...tempSettings.reading };
};

export const selectEffectiveAppSettings = (state: { settings: SettingsState }) => {
  const { appSettings, tempSettings } = state.settings;
  if (!appSettings) return null;
  return { ...appSettings, ...tempSettings.app };
};

export const selectUserPreference = (state: { settings: SettingsState }, key: string) => {
  return state.settings.userPreferences[key];
};

export const selectRecentChanges = (state: { settings: SettingsState }, limit: number = 10) => {
  return state.settings.changeHistory.slice(0, limit);
};