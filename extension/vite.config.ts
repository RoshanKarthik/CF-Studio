/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `vite` serves the preview page (index.html); `vite build` builds the extension's IDE page
// (ide.html) into dist/, next to public/manifest.json. The content script is built separately
// as a classic script by vite.content.config.ts.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      // monaco-editor's package "exports" map rewrites every subpath to *.js, which breaks its CSS
      // imports; point straight at the ESM tree instead (see src/editor/monaco.ts).
      'monaco-esm': fileURLToPath(new URL('./node_modules/monaco-editor/esm/vs', import.meta.url)),
    },
  },
  worker: { format: 'es' },
  build: {
    outDir: 'dist',
    // Loaded from disk by the browser, so bundle size matters far less than on the web.
    chunkSizeWarningLimit: 6000,
    rolldownOptions: { input: { ide: fileURLToPath(new URL('./ide.html', import.meta.url)) } },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
