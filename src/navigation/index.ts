// 导出主导航器
export { default as AppNavigator } from './AppNavigator';

// 导出导航类型
export type {
  RootStackParamList,
  MainTabParamList,
  HomeStackParamList,
  ReadingStackParamList,
  VocabularyStackParamList,
  RSSStackParamList,
  SettingsStackParamList,
  RootStackScreenProps,
  MainTabScreenProps,
  HomeStackScreenProps,
  ReadingStackScreenProps,
  VocabularyStackScreenProps,
  RSSStackScreenProps,
  SettingsStackScreenProps,
  NavigationProp,
  RouteProp,
  NavigationState,
  ScreenOptions,
  TabBarOptions,
  NavigationTheme,
  NavigationEventMap,
  NavigationListener,
} from './types';

// 导出导航辅助函数
export { navigationRef, navigate, goBack, reset } from './AppNavigator';