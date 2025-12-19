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
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    const prepare = async () => {
      try {
        // 1. 预加载启动图
        const splashImage = require('./assets/splash.png');
        await Asset.fromModule(splashImage).downloadAsync();

        // 2. 初始化数据库
        await databaseService.initializeDatabase();

        // 3. 初始化认证服务 (确保在进入导航器前已知晓登录状态，防止闪烁)
        await AuthService.initialize();

        // 模拟一些额外的加载时间以展示启动页 (可选，通常生产环境可移除或缩短)
        // await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('应用初始化失败:', error);
        setDbError('应用初始化失败，请重启应用');
      } finally {
        setAppIsReady(true);
      }
    };
    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      // 3. 当顶级 View 布局完成后，隐藏原生启动屏
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return (
      <View style={styles.splashContainer}>
        <Image
          source={require('./assets/splash.png')}
          style={styles.fullScreenImage}
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <Provider store={store}>
        <SafeAreaProvider>
          <ThemeProvider initialTheme="system">
            <UserProvider>
              <RSSSourceProvider>
                <ReadingSettingsProvider>
                  <StatusBar
                    barStyle={isDarkMode ? 'light-content' : 'dark-content'}
                    backgroundColor="transparent"
                    translucent
                  />
                  <AppNavigator />
                </ReadingSettingsProvider>
              </RSSSourceProvider>
            </UserProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  fullScreenImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFBFE',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#1C1B1F',
  },
});

export default App;
