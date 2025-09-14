import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

// 根堆栈参数列表
export type RootStackParamList = {
  MainTabs: undefined;
  ArticleDetail: { articleId: number };
  VocabularyDetail: { entryId: number };
  RSSSourceDetail: { sourceId: number };
  AddRSSSource: undefined;
  ReadingSettings: undefined;
  AppSettings: undefined;
  About: undefined;
  Export: undefined;
  Import: undefined;
};

// 主标签参数列表
export type MainTabParamList = {
  Articles: undefined; // 文章（合并Home和Reading）
  Vocabulary: undefined; // 词汇本
  Settings: undefined; // 设置
};

// 首页堆栈参数列表
export type HomeStackParamList = {
  HomeMain: undefined;
  ArticleDetail: { articleId: number };
  Search: { query?: string };
};



// 单词本堆栈参数列表
export type VocabularyStackParamList = {
  VocabularyMain: undefined;
  VocabularyDetail: { entryId: number };
  AddWord: { word?: string; context?: string; articleId?: number };
  ReviewSession: undefined;
  VocabularyStats: undefined;
};

// RSS堆栈参数列表
export type RSSStackParamList = {
  RSSMain: undefined;
  RSSSourceDetail: { sourceId: number };
  AddRSSSource: undefined;
  RSSSettings: undefined;
};

// 设置堆栈参数列表
export type SettingsStackParamList = {
  SettingsMain: undefined;
  ReadingSettings: undefined;
  AppSettings: undefined;
  About: undefined;
  Export: undefined;
  Import: undefined;
  StorageManagement: undefined;
};

// 屏幕属性类型定义
export type RootStackScreenProps<Screen extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, Screen>;

export type MainTabScreenProps<Screen extends keyof MainTabParamList> =
  BottomTabScreenProps<MainTabParamList, Screen>;

export type HomeStackScreenProps<Screen extends keyof HomeStackParamList> =
  NativeStackScreenProps<HomeStackParamList, Screen>;



export type VocabularyStackScreenProps<Screen extends keyof VocabularyStackParamList> =
  NativeStackScreenProps<VocabularyStackParamList, Screen>;

export type RSSStackScreenProps<Screen extends keyof RSSStackParamList> =
  NativeStackScreenProps<RSSStackParamList, Screen>;

export type SettingsStackScreenProps<Screen extends keyof SettingsStackParamList> =
  NativeStackScreenProps<SettingsStackParamList, Screen>;

// 导航钩子类型
export type NavigationProp = {
  navigate: (screen: keyof RootStackParamList, params?: any) => void;
  goBack: () => void;
  reset: (state: any) => void;
  canGoBack: () => boolean;
  getId: () => string | undefined;
  getParent: () => any;
  getState: () => any;
};

// 路由参数类型
export type RouteProp<
  ParamList extends Record<string, object | undefined>,
  RouteName extends keyof ParamList
> = {
  key: string;
  name: RouteName;
  params: ParamList[RouteName];
};

// 导航状态类型
export type NavigationState = {
  key: string;
  index: number;
  routeNames: string[];
  history?: unknown[];
  routes: Array<{
    key: string;
    name: string;
    params?: object;
    state?: NavigationState;
  }>;
  type: string;
  stale: false;
};

// 导航选项类型
export type ScreenOptions = {
  title?: string;
  headerShown?: boolean;
  headerTitle?: string;
  headerTitleStyle?: object;
  headerStyle?: object;
  headerTintColor?: string;
  headerBackTitle?: string;
  headerBackTitleVisible?: boolean;
  headerLeft?: () => React.ReactNode;
  headerRight?: () => React.ReactNode;
  gestureEnabled?: boolean;
  animationTypeForReplace?: 'push' | 'pop';
  animation?: 'default' | 'fade' | 'slide_from_right' | 'slide_from_left' | 'slide_from_bottom' | 'none';
};

// 标签栏选项类型
export type TabBarOptions = {
  tabBarLabel?: string;
  tabBarIcon?: ({ focused, color, size }: { focused: boolean; color: string; size: number }) => React.ReactNode;
  tabBarBadge?: string | number;
  tabBarActiveTintColor?: string;
  tabBarInactiveTintColor?: string;
  tabBarActiveBackgroundColor?: string;
  tabBarInactiveBackgroundColor?: string;
  tabBarShowLabel?: boolean;
  tabBarLabelStyle?: object;
  tabBarIconStyle?: object;
  tabBarStyle?: object;
  tabBarItemStyle?: object;
};

// 导航主题类型
export type NavigationTheme = {
  dark: boolean;
  colors: {
    primary: string;
    background: string;
    card: string;
    text: string;
    border: string;
    notification: string;
  };
};

// 导航事件类型
export type NavigationEventMap = {
  focus: { data: undefined };
  blur: { data: undefined };
  state: { data: { state: NavigationState } };
  beforeRemove: {
    data: { action: any };
    preventDefault: () => void;
  };
};

// 导航监听器类型
export type NavigationListener<EventName extends keyof NavigationEventMap> = (
  e: NavigationEventMap[EventName]
) => void;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}