import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';

// 导入切片
import articlesSlice from './slices/articlesSlice';
import rssSlice from './slices/rssSlice';
import vocabularySlice from './slices/vocabularySlice';
import settingsSlice from './slices/settingsSlice';

// 配置store
export const store = configureStore({
  reducer: {
    articles: articlesSlice,
    rss: rssSlice,
    vocabulary: vocabularySlice,
    settings: settingsSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST'],
        ignoredActionsPaths: ['payload.timestamp'],
        ignoredPaths: ['articles.error.timestamp', 'rss.error.timestamp', 'vocabulary.error.timestamp', 'settings.error.timestamp'],
      },
    }),
});

// 导出类型
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// 导出类型化的hooks
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// 导出store实例
export default store;