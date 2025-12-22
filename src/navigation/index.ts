// 导出主导航器
export { default as AppNavigator } from './AppNavigator';

// 导出导航类型（从 AppNavigator 直接导出）
export type {
  RootStackParamList,
  AuthStackParamList,
  MainTabParamList,
  HomeStackParamList,
  VocabularyStackParamList,
  RSSStackParamList,
  UserStackParamList,
} from './AppNavigator';

// 导出导航辅助函数
export { navigationRef, navigate, goBack, reset } from './AppNavigator';