import React, { useState, useEffect } from 'react';
import {
  StatusBar,
  useColorScheme,
  View,
  ActivityIndicator,
  Text,
  StyleSheet,
} from 'react-native';
import { Provider } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// 导入store和主题
import { store } from './src/store';
import { ThemeProvider } from './src/theme';
import { UserProvider } from './src/contexts/UserContext';
import { RSSSourceProvider } from './src/contexts/RSSSourceContext';
import { ReadingSettingsProvider } from './src/contexts/ReadingSettingsContext'; // 1. 导入 Provider
import { AppNavigator } from './src/navigation';

// 导入数据库初始化
import { databaseService } from './src/database/DatabaseService';

function App(): React.JSX.Element {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  const [isDbReady, setIsDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    const initDb = async () => {
      try {
        await databaseService.initializeDatabase();
        setIsDbReady(true);
      } catch (error) {
        console.error('数据库初始化失败:', error);
        setDbError('数据库初始化失败，请重启应用');
        // 即使数据库初始化失败，也继续加载应用
        setIsDbReady(true);
      }
    };
    initDb();
  }, []);

  if (!isDbReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6750A4" />
        <Text style={styles.loadingText}>正在初始化...</Text>
      </View>
    );
  }

  return (
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
  );
}

const styles = StyleSheet.create({
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
