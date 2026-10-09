import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const source = path.join(root, 'src') + path.sep;

export default defineConfig({
  root,
  base: '/homepage/',
  publicDir: 'public',
  plugins: [
    {
      name: 'homepage-public-asset-urls',
      enforce: 'pre',
      transform(code, id) {
        // JSX/dynamic media URLs are strings, so Vite cannot relocate them.
        // Only this homepage's source-local /assets paths are rewritten.
        const filename = path.normalize(id.split('?')[0]);
        if (!filename.startsWith(source) || !/\.[cm]?[jt]sx?$/.test(filename)) return null;
        return code.replace(/(["'`])\/assets\//g, '$1/homepage/assets/');
      },
    },
    react(),
  ],
  build: {
    outDir: path.resolve(root, '../dist/homepage'),
    emptyOutDir: false,
    assetsDir: 'build',
  },
  server: { host: '127.0.0.1' },
});
