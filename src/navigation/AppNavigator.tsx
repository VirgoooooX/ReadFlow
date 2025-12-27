import React from 'react';
import { Platform, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { useThemeContext } from '../theme';
import { logger } from '../services/rss/RSSUtils';
import { useUser } from '../contexts/UserContext';
import { useRSSSource } from '../contexts/RSSSourceContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTabBarHeight, getTabBarPaddingVertical, getHeaderHeight, HEADER_TITLE_STYLE } from '../constants/navigation';
import CustomHeader from '../components/CustomHeader';
import ScreenWithCustomHeader from '../components/ScreenWithCustomHeader';
import { getCommonScreenOptions } from './screenOptions';
import { HomeStackParamList, RSSStackParamList, MainTabParamList, UserStackParamList, VocabularyStackParamList } from './types';
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
  StatusBar,
} from 'react-native';

// 导入屏幕组件（暂时使用占位符）
import HomeScreen from '../screens/Home/HomeScreen';
import ArticleDetailScreen from '../screens/Article/ArticleDetailScreen';
import VocabularyScreen from '../screens/Vocabulary/VocabularyScreen';
import ReviewSessionScreen from '../screens/Vocabulary/ReviewSessionScreen';
import VocabularyDetailScreen from '../screens/Vocabulary/VocabularyDetailScreen';
import AddRSSSourceScreen from '../screens/RSS/AddRSSSourceScreen';
import ManageSubscriptionsScreen from '../screens/RSS/ManageSubscriptionsScreen';
import EditRSSSourceScreen from '../screens/RSS/EditRSSSourceScreen';
import GroupManagementScreen from '../screens/RSS/GroupManagementScreen';
import FilterRuleEditorScreen from '../screens/RSS/FilterRuleEditorScreen';
import FilterManagementScreen from '../screens/RSS/FilterManagementScreen';
import MineScreen from '../screens/Mine/MineScreen';
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';
import EditProfileScreen from '../screens/User/EditProfileScreen';
import ReadingSettingsScreen from '../screens/Settings/ReadingSettingsScreen';
import LLMSettingsScreen from '../screens/Settings/LLMSettingsScreen';
import ThemeSettingsScreen from '../screens/Settings/ThemeSettingsScreen';
import { ProxyServerSettingsScreen } from '../screens/Settings/ProxyServerSettingsScreen';
import { AddEditProxyServerScreen } from '../screens/Settings/AddEditProxyServerScreen';
import AboutScreen from '../screens/Settings/AboutScreen';
import StorageManagementScreen from '../screens/Settings/StorageManagementScreen';
import CustomColorScreen from '../screens/Settings/CustomColorScreen';
import RSSStartupSettingsScreen from '../screens/Settings/RSSStartupSettingsScreen';

// 导入类型定义
export type RootStackParamList = {
  Auth: undefined;
  MainTabs: undefined;
  ArticleDetail: { articleId: number };
  VocabularyDetail: { entryId: number };
  RSSSourceDetail: { sourceId: number };
  AddRSSSource: undefined;
  ManageSubscriptions: undefined;
  ReadingSettings: undefined;
  AppSettings: undefined;
  About: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

// 不需要在这里重新定义，使用 types.ts 中的定义

// 创建导航器
const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const VocabularyStack = createNativeStackNavigator<VocabularyStackParamList>();
const RSSStack = createNativeStackNavigator<RSSStackParamList>();
const UserStack = createNativeStackNavigator<UserStackParamList>();

// 主题配置
const lightTheme = {
  dark: false,
  colors: {
    primary: '#6750A4',
    background: '#FFFBFE',
    card: '#FFFBFE',
    text: '#1C1B1F',
    border: '#79747E',
    notification: '#B3261E',
  },
};

const darkTheme = {
  dark: true,
  colors: {
    primary: '#D0BCFF',
    background: '#1C1B1F',
    card: '#1C1B1F',
    text: '#E6E1E5',
    border: '#938F99',
    notification: '#F2B8B5',
  },
};

// 认证堆栈导航
function AuthStackNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <AuthStack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false }}
      />
      <AuthStack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ headerShown: false }}
      />
    </AuthStack.Navigator>
  );
}

// 首页堆栈导航
function HomeStackNavigator() {
  const { theme } = useThemeContext();
  const isDark = theme.isDark;

  return (
    <HomeStack.Navigator
      screenOptions={{
        headerShown: false, // 隐藏原生导航栏
        ...getCommonScreenOptions(theme, isDark),
      }}
    >
      <HomeStack.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{ title: '文章' }}
      />

      <HomeStack.Screen
        name="Search"
        options={{ title: '搜索' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="\u641c\u7d22"
            showBackButton={true}
          >
            <HomeScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </HomeStack.Screen>
    </HomeStack.Navigator>
  );
}



// 单词本堆栈导航
function VocabularyStackNavigator() {
  const { theme } = useThemeContext();
  const isDark = theme.isDark;

  return (
    <VocabularyStack.Navigator
      screenOptions={{
        headerShown: false, // 隐藏原生导航栏
        ...getCommonScreenOptions(theme, isDark),
      }}
    >
      <VocabularyStack.Screen
        name="VocabularyMain"
        options={{ title: '词汇本' }}
      >
        {(props) => (
          <ScreenWithCustomHeader
            title="词汇本"
            showBackButton={false}
          >
            <VocabularyScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </VocabularyStack.Screen>
      <VocabularyStack.Screen
        name="VocabularyDetail"
        options={{ title: '单词详情' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="单词详情"
            showBackButton={true}
          >
            <VocabularyDetailScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </VocabularyStack.Screen>
      <VocabularyStack.Screen
        name="AddWord"
        options={{ title: '添加单词' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="添加单词"
            showBackButton={true}
          >
            <VocabularyScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </VocabularyStack.Screen>
      <VocabularyStack.Screen
        name="ReviewSession"
        options={{ title: '复习模式' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="复习模式"
            showBackButton={true}
          >
            <ReviewSessionScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </VocabularyStack.Screen>
      <VocabularyStack.Screen
        name="VocabularyStats"
        options={{ title: '学习统计' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="\u5b66\u4e60\u7edf\u8ba1"
            showBackButton={true}
          >
            <VocabularyScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </VocabularyStack.Screen>
    </VocabularyStack.Navigator>
  );
}

// RSS堆栈导航（直接使用 ManageSubscriptionsScreen 作为主页）
function RSSStackNavigator() {
  const { theme } = useThemeContext();
  const isDark = theme.isDark;

  return (
    <RSSStack.Navigator
      screenOptions={{
        headerShown: false, // 隐藏原生导航栏
        ...getCommonScreenOptions(theme, isDark),
      }}
    >
      <RSSStack.Screen
        name="RSSMain"
        options={{ title: '订阅源' }}
      >
        {({ navigation }: any) => (
          <ScreenWithCustomHeader
            title="订阅源"
            showBackButton={false}
            rightComponent={
              <TouchableOpacity
                onPress={() => navigation.navigate('AddRSSSource')}
                style={{ padding: 4, marginRight: 8 }}
                activeOpacity={0.6}
              >
                <MaterialIcons 
                  name="add" 
                  size={26} 
                  color={isDark ? theme.colors.onSurface : theme.colors.onPrimary} 
                />
              </TouchableOpacity>
            }
          >
            <ManageSubscriptionsScreen />
          </ScreenWithCustomHeader>
        )}
      </RSSStack.Screen>
      <RSSStack.Screen
        name="AddRSSSource"
        options={{ title: '添加RSS源' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="添加RSS源"
            showBackButton={true}
          >
            <AddRSSSourceScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </RSSStack.Screen>
      <RSSStack.Screen
        name="EditRSSSource"
        options={{ title: '编辑RSS源' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="编辑RSS源"
            showBackButton={true}
          >
            <EditRSSSourceScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </RSSStack.Screen>
      <RSSStack.Screen
        name="GroupManagement"
        options={{ title: '分组管理' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="分组管理"
            showBackButton={true}
          >
            <GroupManagementScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </RSSStack.Screen>
      <RSSStack.Screen
        name="FilterManagement"
        options={{ title: '过滤规则' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="过滤规则"
            showBackButton={true}
          >
            <FilterManagementScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </RSSStack.Screen>
      <RSSStack.Screen
        name="FilterRuleEditor"
        options={({ route }: any) => ({ 
          title: route?.params?.ruleId ? '编辑规则' : '新建规则' 
        })}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title={props.route?.params?.ruleId ? '编辑规则' : '新建规则'}
            showBackButton={true}
          >
            <FilterRuleEditorScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </RSSStack.Screen>
    </RSSStack.Navigator>
  );
}

// 用户堆栈导航（"我的"页面）
function UserStackNavigator() {
  const { theme } = useThemeContext();
  const isDark = theme.isDark;

  return (
    <UserStack.Navigator
      screenOptions={{
        headerShown: false, // 隐藏原生导航栏
        ...getCommonScreenOptions(theme, isDark),
      }}
    >
      <UserStack.Screen
        name="UserMain"
        options={{ title: '我的' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="我的"
            showBackButton={false}
          >
            <MineScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </UserStack.Screen>
      <UserStack.Screen
        name="EditProfile"
        options={{ title: '编辑资料' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="编辑资料"
            showBackButton={true}
          >
            <EditProfileScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </UserStack.Screen>
      <UserStack.Screen
        name="ReadingSettings"
        options={{ title: '阅读偏好' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="阅读偏好"
            showBackButton={true}
          >
            <ReadingSettingsScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </UserStack.Screen>
      <UserStack.Screen
        name="LLMSettings"
        options={{ title: 'LLM设置' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="LLM设置"
            showBackButton={true}
          >
            <LLMSettingsScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </UserStack.Screen>
      <UserStack.Screen
        name="ThemeSettings"
        options={{ title: '主题设置' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="主题设置"
            showBackButton={true}
          >
            <ThemeSettingsScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </UserStack.Screen>
      <UserStack.Screen
        name="CustomColor"
        options={{ title: '自定义颜色' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="自定义颜色"
            showBackButton={true}
          >
            <CustomColorScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </UserStack.Screen>
      <UserStack.Screen
        name="ProxyServerSettings"
        options={{ title: '代理服务器' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="代理服务器"
            showBackButton={true}
          >
            <ProxyServerSettingsScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </UserStack.Screen>
      <UserStack.Screen
        name="AddEditProxyServer"
        options={({ route }: any) => ({ 
          title: route?.params?.serverId ? '编辑服务器' : '添加服务器' 
        })}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title={props.route?.params?.serverId ? '编辑服务器' : '添加服务器'}
            showBackButton={true}
          >
            <AddEditProxyServerScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </UserStack.Screen>
      <UserStack.Screen
        name="About"
        options={{ title: '关于' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="关于"
            showBackButton={true}
          >
            <AboutScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </UserStack.Screen>

      <UserStack.Screen
        name="StorageManagement"
        options={{ title: '存储空间管理' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="存储空间管理"
            showBackButton={true}
          >
            <StorageManagementScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </UserStack.Screen>
      <UserStack.Screen
        name="ManageSubscriptions"
        options={{ title: '管理订阅源' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="管理订阅源"
            showBackButton={true}
          >
            <ManageSubscriptionsScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </UserStack.Screen>

      <UserStack.Screen
        name="GroupManagement"
        options={{ title: '分组管理' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="分组管理"
            showBackButton={true}
          >
            <GroupManagementScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </UserStack.Screen>

      <UserStack.Screen
        name="AddRSSSource"
        options={{ title: '添加RSS源' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="添加RSS源"
            showBackButton={true}
          >
            <AddRSSSourceScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </UserStack.Screen>

      <UserStack.Screen
        name="EditRSSSource"
        options={{ title: '编辑RSS源' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="编辑RSS源"
            showBackButton={true}
          >
            <EditRSSSourceScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </UserStack.Screen>

      <UserStack.Screen
        name="RSSStartupSettings"
        options={{ title: '启动自动刷新' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="启动自动刷新"
            showBackButton={true}
          >
            <RSSStartupSettingsScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </UserStack.Screen>

      <UserStack.Screen
        name="FilterManagement"
        options={{ title: '过滤规则' }}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title="过滤规则"
            showBackButton={true}
          >
            <FilterManagementScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </UserStack.Screen>

      <UserStack.Screen
        name="FilterRuleEditor"
        options={({ route }: any) => ({ 
          title: route?.params?.ruleId ? '编辑规则' : '新建规则' 
        })}
      >
        {(props: any) => (
          <ScreenWithCustomHeader
            title={props.route?.params?.ruleId ? '编辑规则' : '新建规则'}
            showBackButton={true}
          >
            <FilterRuleEditorScreen {...props} />
          </ScreenWithCustomHeader>
        )}
      </UserStack.Screen>

    </UserStack.Navigator>
  );
}



// 底部标签导航 - 符合设计规范的3个标签页
function MainTabNavigator() {
  const { theme, isDark } = useThemeContext();
  const insets = useSafeAreaInsets();
  const { rssSources } = useRSSSource();

  // 计算所有未读文章总数
  const unreadCount = rssSources.reduce((acc, source) => acc + (source.unread_count || 0), 0);

  // 计算实际的标签栏高度，包含底部安全区域
  const tabBarHeight = getTabBarHeight();
  const bottomInset = insets.bottom;
  // 总高度 = 标签栏高度 + 底部安全区域
  const totalTabBarHeight = tabBarHeight + bottomInset;

  return (
    <MainTab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof MaterialIcons.glyphMap;

          switch (route.name) {
            case 'Articles':
              iconName = 'article';
              break;
            case 'Vocabulary':
              iconName = 'book';
              break;
            case 'RSS':
              iconName = 'rss-feed';
              break;
            case 'User':
              iconName = 'person';
              break;
            default:
              iconName = 'help';
          }

          return <MaterialIcons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
        tabBarStyle: {
          backgroundColor: theme.colors.surface || (isDark ? '#1C1B1F' : '#FFFBFE'),
          borderTopColor: theme.colors.outlineVariant || (isDark ? '#49454F' : '#CAC4D0'),
          borderTopWidth: 0.5,
          // 显式设置底部内边距，包含安全区域
          paddingBottom: getTabBarPaddingVertical() + bottomInset,
          paddingTop: getTabBarPaddingVertical(),
          // 总高度包含底部安全区域
          height: totalTabBarHeight,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        headerShown: false,
        // 禁用自动安全区域处理，我们手动控制
        tabBarHideOnKeyboard: true,
      })}
      // 禁用 React Navigation 默认的安全区域处理
      safeAreaInsets={{ bottom: 0 }}
    >
      <MainTab.Screen
        name="Articles"
        component={HomeStackNavigator}
        options={{ tabBarLabel: '文章' }}
      />
      <MainTab.Screen
        name="RSS"
        component={RSSStackNavigator}
        options={{ 
          tabBarLabel: 'RSS',
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: theme.colors.error,
            color: theme.colors.onError,
            fontSize: 10,
          }
        }}
      />
      <MainTab.Screen
        name="Vocabulary"
        component={VocabularyStackNavigator}
        options={{ tabBarLabel: '词汇本' }}
      />
      <MainTab.Screen
        name="User"
        component={UserStackNavigator}
        options={{ tabBarLabel: '我的' }}
      />
    </MainTab.Navigator>
  );
}

// 根导航器
function RootNavigator() {
  const { theme } = useThemeContext();
  const isDark = theme.isDark;
  const { state } = useUser();
  const { triggerStartupRefresh } = useRSSSource();

  // 核心逻辑：直到用户信息加载完成（确定是去登录页还是主页）后，才允许关闭原生启动页
  React.useEffect(() => {
    if (!state.isLoading) {
      // 触发启动自动刷新 (非阻塞)
      triggerStartupRefresh();

      // 稍微延时（100-200ms）确保 React Navigation 的第一帧画面已经渲染到屏幕上
      const timer = setTimeout(() => {
        logger.info('🏁 业务就绪，正式通过 Navigator 触发隐藏启动页');
        SplashScreen.hideAsync().catch(() => { });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [state.isLoading]);

  return (
    <RootStack.Navigator
      screenOptions={{
        headerShown: false,
        ...getCommonScreenOptions(theme, isDark),
      }}
    >
      {state.isAuthenticated ? (
        <RootStack.Screen name="MainTabs" component={MainTabNavigator} />
      ) : (
        <RootStack.Screen name="Auth" component={AuthStackNavigator} />
      )}
      <RootStack.Screen
        name="ArticleDetail"
        component={ArticleDetailScreen}
        options={({ navigation, route }) => {
          const isNextArticle = (route as any).params?.isNextArticle || false;
          return {
            ...getCommonScreenOptions(theme, theme.isDark),
            headerShown: true,
            title: '文章详情',
            // 翻页用 fade，不影响返回动画
            ...(isNextArticle && {
              animation: 'fade',
              animationDuration: 200,
            }),
          };
        }}
      />
      <RootStack.Screen
        name="VocabularyDetail"
        component={ArticleDetailScreen}
        options={({ navigation }) => ({
          headerShown: true,
          title: '单词详情',
          ...getCommonScreenOptions(theme, theme.isDark),
        })}
      />
      <RootStack.Screen
        name="RSSSourceDetail"
        component={ArticleDetailScreen}
        options={({ navigation }) => ({
          headerShown: true,
          title: 'RSS源详情',
          ...getCommonScreenOptions(theme, theme.isDark),
        })}
      />
      <RootStack.Screen
        name="AddRSSSource"
        component={AddRSSSourceScreen}
        options={{
          headerShown: true,
          title: '添加RSS源',
          ...getCommonScreenOptions(theme, theme.isDark),
        }}
      />
    </RootStack.Navigator>
  );
}

// 主应用导航器
export default function AppNavigator() {
  return (
    <NavigationContainer ref={navigationRef}>
      <RootNavigator />
    </NavigationContainer>
  );
}

// 导航辅助函数
export const navigationRef = React.createRef<any>();

export function navigate(name: string, params?: any) {
  if (navigationRef.current?.isReady()) {
    navigationRef.current?.navigate(name, params);
  }
}

export function goBack() {
  if (navigationRef.current?.isReady() && navigationRef.current?.canGoBack()) {
    navigationRef.current?.goBack();
  }
}

export function reset(state: any) {
  if (navigationRef.current?.isReady()) {
    navigationRef.current?.reset(state);
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E6FBFF',
  },
});