import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [],
    testTimeout: 30000,
    exclude: ['**/node_modules/**', '**/dist/**', 'readflow-server/**'],
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
  },
  resolve: {
    alias: {
      'react-native': 'react-native-web',
    },
  },
});
