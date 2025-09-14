import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import HTMLRenderingDemo from './components/HTMLRenderingDemo';

const App: React.FC = () => {
  return (
    <SafeAreaView style={styles.container}>
      <HTMLRenderingDemo contentWidth={300} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});

export default App;