/**
 * Vite configuration for clean-arcade.
 *
 * Defaults are pinned explicitly so:
 *   1. The dev server, the production build, and the single-file build all
 *      produce predictable asset paths that build-singlefile.cjs can locate.
 *   2. Asset filenames follow the `index-[hash].{js,css}` pattern so the
 *      single-file build's filename regex keeps working.
 *   3. The `base` is relative so the app can be served from a subpath or
 *      opened directly via file://.
 */

import { defineConfig } from 'vite';

export default defineConfig({
  // Relative URLs so the app works from any subpath (or directly from
  // file:// in the single-file build).
  base: './',

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    // Modern browsers only — keeps the bundle smaller.
    target: 'es2022',
    // No source maps in production (size).
    sourcemap: false,
    rollupOptions: {
      output: {
        // Stable, predictable file names so build-singlefile.cjs can find
        // the hashed bundle files in dist/assets/.
        entryFileNames: 'assets/index-[hash].js',
        chunkFileNames: 'assets/index-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },

  server: {
    port: 5173,
    strictPort: false,
    open: false
  },

  preview: {
    port: 4173,
    strictPort: false
  }
});