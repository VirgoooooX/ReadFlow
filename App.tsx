import React, { useState, useEffect, useCallback } from 'react';
import {
  StatusBar,
  useColorScheme,
  View,
  ActivityIndicator,
  Text,
  StyleSheet,
  Image,
  Dimensions,
} from 'react-native';
import { Provider } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { Asset } from 'expo-asset';

// 导入store和主题
import { store } from './src/store';
import { ThemeProvider } from './src/theme';
import { UserProvider } from './src/contexts/UserContext';
import { RSSSourceProvider } from './src/contexts/RSSSourceContext';
import { ReadingSettingsProvider } from './src/contexts/ReadingSettingsContext';
import { AppNavigator } from './src/navigation';

// 导入数据库初始化和认证服务
import { databaseService } from './src/database/DatabaseService';
import AuthService from './src/services/AuthService';

// 阻止原生启动屏自动消失
SplashScreen.preventAutoHideAsync();

function App(): React.JSX.Element {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  const [appIsReady, setAppIsReady] = useState(false);

  // 1. 保底机制：无论发生什么，5秒后必须尝试关闭启动页
  useEffect(() => {
    const timebomb = setTimeout(() => {
      console.log('💣 触发保底隐藏启动页 (5s)');
      SplashScreen.hideAsync().catch(() => { });
    }, 5000);
    return () => clearTimeout(timebomb);
  }, []);

  // 2. 主初始化逻辑
  useEffect(() => {
    async function prepare() {
      try {
        console.log('🚀 开始应用初始化 (带有 3s 超时保护)...');

        // 并行加载核心服务，并设置 3 秒超时 Race
        const initTasks = Promise.all([
          databaseService.initializeDatabase(),
          AuthService.initialize()
        ]);

        await Promise.race([
          initTasks,
          new Promise(resolve => setTimeout(resolve, 3000))
        ]);

        console.log('✅ 核心服务初始化阶段完成');
      } catch (e) {
        console.warn('⚠️ 初始化阶段发生非致命错误:', e);
      } finally {
        console.log('✨ 进入界面渲染阶段');
        setAppIsReady(true);

        // 最后一次确认隐藏启动页
        setTimeout(() => {
          SplashScreen.hideAsync().catch(() => { });
        }, 500);
      }
    }
    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      console.log('📐 布局完成触发隐藏');
      await SplashScreen.hideAsync().catch(() => { });
    }
  }, [appIsReady]);

  // 如果还没准备好，我们返回一个匹配背景色的空 View
  // 这会遮盖在 Native Splash 层，一旦 ready 就会替换为真正的 App
  if (!appIsReady) {
    return <View style={{ flex: 1, backgroundColor: '#E6FBFF' }} />;
  }

  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <ThemeProvider initialTheme="system">
          <UserProvider>
            <RSSSourceProvider>
              <ReadingSettingsProvider>
                <View style={styles.container} onLayout={onLayoutRootView}>
                  <StatusBar
                    barStyle={isDarkMode ? 'light-content' : 'dark-content'}
                    backgroundColor="transparent"
                    translucent
                  />
                  <AppNavigator />
                </View>
              </ReadingSettingsProvider>
            </RSSSourceProvider>
          </UserProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E6FBFF',
  },
});

export default App;
