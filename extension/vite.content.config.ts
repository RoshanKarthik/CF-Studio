import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Content scripts can't be ES modules, so this one is bundled into a single classic script.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: fileURLToPath(new URL('./src/extension/content.ts', import.meta.url)),
      formats: ['iife'],
      name: 'cfStudioContent',
      fileName: () => 'content.js',
    },
  },
});
