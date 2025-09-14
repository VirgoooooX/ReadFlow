import React from 'react';
import {
  StatusBar,
  useColorScheme,
} from 'react-native';
import { Provider } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// 导入store和主题
import { store } from './src/store';
import { ThemeProvider } from './src/theme';
import { UserProvider } from './src/contexts/UserContext';
import { RSSSourceProvider } from './src/contexts/RSSSourceContext';
import { AppNavigator } from './src/navigation';

// 导入数据库初始化
import { databaseService } from './src/database/DatabaseService';

// 初始化数据库
databaseService.initializeDatabase().catch(console.error);

function App(): React.JSX.Element {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <ThemeProvider initialTheme="system">
          <UserProvider>
            <RSSSourceProvider>
              <StatusBar
                barStyle={isDarkMode ? 'light-content' : 'dark-content'}
                backgroundColor="transparent"
                translucent
              />
              <AppNavigator />
            </RSSSourceProvider>
          </UserProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </Provider>
  );
}

export default App;
