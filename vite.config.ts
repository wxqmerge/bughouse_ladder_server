import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';
import fs from 'fs';

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
const BUILD_TIMESTAMP = Date.now().toString();

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile(),
    {
      name: 'cache-bust',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          return html.replace(
            '<head>',
            `<head><meta name="build-timestamp" content="${BUILD_TIMESTAMP}">`
          );
        },
      },
    },
  ],
  define: {
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  publicDir: 'public',
});
