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

// 导入store和主题
import { store } from './src/store';
import { ThemeProvider } from './src/theme';
import { UserProvider } from './src/contexts/UserContext';
import { RSSSourceProvider } from './src/contexts/RSSSourceContext';
import { RSSGroupProvider } from './src/contexts/RSSGroupContext';
import { ReadingSettingsProvider } from './src/contexts/ReadingSettingsContext';
import { AppSettingsProvider } from './src/contexts/AppSettingsContext';
import { AppNavigator } from './src/navigation';

// 导入数据库初始化和认证服务
import { databaseService } from './src/database/DatabaseService';
import AuthService from './src/services/AuthService';
import { VocabularyService } from './src/services/VocabularyService';
import { SettingsService } from './src/services/SettingsService';
import { RSSService } from './src/services/rss';
import { logger } from './src/services/rss/RSSUtils';
import { configSyncService } from './src/services/ConfigSyncService';

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

        // Cloud Config Sync (Cold Start)
        try {
          logger.info('☁️ 检查云端配置同步...');
          configSyncService.syncConfig('pull').catch(err => {
            logger.warn('⚠️ 云端配置同步失败:', err);
          });
        } catch (e) {
          logger.warn('⚠️ 云端配置同步初始化失败:', e);
        }

        // 【暂时禁用】如果启用了代理模式，尝试同步单词本和文章
        // 保留代码逻辑，但暂不自动调用，等后续手动触发
        // try {
        //   const proxyConfig = await SettingsService.getInstance().getProxyModeConfig();
        //   if (proxyConfig.enabled && proxyConfig.token) {
        //     logger.info('🔄 开始同步单词本...');
        //     const vocabService = VocabularyService.getInstance();
        //     // 异步同步单词本，不阻塞启动
        //     vocabService.syncToProxyServer().catch(err => {
        //       logger.warn('⚠️ 单词本同步失败:', err);
        //     });
        //     
        //     // 异步同步文章，不阻塞启动
        //     logger.info('📰 开始同步文章...');
        //     RSSService.getInstance().refreshAllSources().then(result => {
        //       logger.info(`✅ 文章同步完成: 成功 ${result.success}, 失败 ${result.failed}, 新文章 ${result.totalArticles}`);
        //     }).catch(err => {
        //       logger.warn('⚠️ 文章同步失败:', err);
        //     });
        //   }
        // } catch (syncError) {
        //   logger.warn('⚠️ 同步检查失败:', syncError);
        // }
      } catch (e) {
        logger.warn('⚠️ 初始化阶段发生非致命错误:', e);
      } finally {
        logger.info('✨ 进入界面渲染阶段');
        setAppIsReady(true);
      }
    }
    prepare();
  }, []);

  // 3. App 生命周期管理：监听进入后台/前台，退出时同步
  // 【暂时禁用】保留代码逻辑，但暂不自动调用
  // useEffect(() => {
  //   if (!appIsReady) return;
  //
  //   const subscription = AppState.addEventListener('change', async (nextAppState) => {
  //     if (nextAppState === 'background' || nextAppState === 'inactive') {
  //       // 进入后台或非活跃状态，同步单词本
  //       console.log('💾 App 进入后台，开始同步单词本...');
  //       try {
  //         const config = await SettingsService.getInstance().getProxyModeConfig();
  //         if (config.enabled && config.token) {
  //           await VocabularyService.getInstance().syncToProxyServer();
  //           console.log('✅ 后台同步完成');
  //         }
  //       } catch (error) {
  //         console.warn('⚠️ 后台同步失败:', error);
  //       }
  //     }
  //   });
  //
  //   return () => {
  //     subscription?.remove();
  //   };
  // }, [appIsReady]);


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
            <AppSettingsProvider>
              <RSSSourceProvider>
                <RSSGroupProvider>
                  <ReadingSettingsProvider>
                    <View style={styles.container}>
                      <AppNavigator />
                    </View>
                  </ReadingSettingsProvider>
                </RSSGroupProvider>
              </RSSSourceProvider>
            </AppSettingsProvider>
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
