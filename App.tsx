import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ActivityIndicator,
  Text,
  StyleSheet,
  Image,
  Dimensions,
  AppState,  // 添加 AppState监听应用生命周期
} from 'react-native';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { Asset } from 'expo-asset';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 导入store和主题
import { store } from './src/store';
import { ThemeProvider } from './src/theme';
import { UserProvider } from './src/contexts/UserContext';
import { RSSSourceProvider } from './src/contexts/RSSSourceContext';
import { RSSGroupProvider } from './src/contexts/RSSGroupContext';
import { ReadingSettingsProvider } from './src/contexts/ReadingSettingsContext';
import { AppNavigator } from './src/navigation';

// 导入数据库初始化和认证服务
import { databaseService } from './src/database/DatabaseService';
import AuthService from './src/services/AuthService';
import { logger } from './src/services/rss/RSSUtils';
import { configSyncService } from './src/services/ConfigSyncService';
import { cloudSyncService } from './src/services/rss/CloudSyncService';

// 阻止原生启动屏自动消失
SplashScreen.preventAutoHideAsync();


function App(): React.JSX.Element {
  const [appIsReady, setAppIsReady] = useState(false);

  // 1. 保底机制：无论发生什么，5秒后必须尝试关闭启动页
  useEffect(() => {
    const timebomb = setTimeout(() => {
      logger.info('💣 触发保底隐藏启动页 (5s)');
      SplashScreen.hideAsync().catch(() => { });
    }, 5000);
    return () => clearTimeout(timebomb);
  }, []);

  // 2. 主初始化逻辑
  useEffect(() => {
    async function prepare() {
      try {
        logger.info('🚀 开始应用初始化 (带有 3s 超时保护)...');

        // 并行加载核心服务，并设置 3 秒超时 Race
        const initTasks = Promise.all([
          databaseService.initializeDatabase(),
          AuthService.initialize()
        ]);

        await Promise.race([
          initTasks,
          new Promise(resolve => setTimeout(resolve, 3000))
        ]);

        logger.info('✅ 核心服务初始化完成');

        AsyncStorage.removeItem('llm_settings').catch(() => {});

      } catch (e) {
        logger.warn('⚠️ 初始化阶段发生非致命错误:', e);
      } finally {
        logger.info('✨ 进入界面渲染阶段');
        setAppIsReady(true);
      }
    }
    prepare();
  }, []);

  useEffect(() => {
    if (!appIsReady) return;
    configSyncService.syncConfigIfRemoteChanged('startup').catch((err) => {
      logger.warn('⚠️ 云端配置检查失败:', err);
    });
  }, [appIsReady]);

  // 3. App 生命周期管理：监听进入后台/前台，退出时同步
  useEffect(() => {
    if (!appIsReady) return;

    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        cloudSyncService.pullUserArticleStatesOnAppActiveIfNeeded().catch((e) => {
          logger.warn('⚠️ 前台回填阅读状态失败:', e);
        });
        configSyncService.syncConfigIfRemoteChanged('resume').catch((e) => {
          logger.warn('⚠️ 前台检查云端配置失败:', e);
        });
      }
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        cloudSyncService.flushPendingStateSyncOnAppBackground().catch((e) => {
          logger.warn('⚠️ 后台同步阅读状态失败:', e);
        });
      }
    });

    return () => {
      subscription?.remove();
    };
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
              <RSSGroupProvider>
                <ReadingSettingsProvider>
                  <View style={styles.container}>
                    <AppNavigator />
                  </View>
                </ReadingSettingsProvider>
              </RSSGroupProvider>
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
