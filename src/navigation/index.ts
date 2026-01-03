// 导出主导航器
export { default as AppNavigator } from './AppNavigator';

// 导出导航类型
export type {
  RootStackParamList,
  MainTabParamList,
  HomeStackParamList,
  VocabularyStackParamList,
  RSSStackParamList,
  UserStackParamList,
} from './types';

export type { AuthStackParamList } from './AppNavigator';

// 导出导航辅助函数
export { navigationRef, navigate, goBack, reset } from './AppNavigator';
