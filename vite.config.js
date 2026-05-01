import process from 'node:process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  define: {
    __GLASSMOOCS_ENABLE_DEBUG_LOGS__: JSON.stringify(
      process.env.GLASSMOOCS_DEBUG_LOGS === 'true',
    ),
  },
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom/client': 'preact/compat/client',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        options: 'options.html',
      },
    },
  },
});
