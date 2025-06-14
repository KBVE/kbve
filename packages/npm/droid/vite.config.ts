import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import path from 'path';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/npm/droid',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],

  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'droid',
      fileName: (format) => `droid.${format}.js`,
      formats: ['es'] as const,
    },
    outDir: '../../../dist/packages/npm/droid',
    target: 'esnext',
    rollupOptions: {
      input: {
        droid: path.resolve(__dirname, 'src/index.ts'),
        'workers/main': path.resolve(__dirname, 'src/lib/workers/main.ts'),
        'workers/canvas-worker': path.resolve(__dirname, 'src/lib/workers/canvas-worker.ts'),
        'workers/db-worker': path.resolve(__dirname, 'src/lib/workers/db-worker.ts'),
        'workers/ws-worker': path.resolve(__dirname, 'src/lib/workers/ws-worker.ts'),
      },
    output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.facadeModuleId?.includes('canvas-worker.ts')) return '/lib/workers/canvas-worker.js';
          if (chunkInfo.facadeModuleId?.includes('db-worker.ts')) return '/lib/workers/db-worker.js';
          if (chunkInfo.facadeModuleId?.includes('ws-worker.ts')) return '/lib/workers/ws-worker.js';
          if (chunkInfo.facadeModuleId?.includes('main.ts')) return 'workers/main.js';
        return '[name].[format].js';
      },
    },
		  external: [] as string[], // optionally add external deps here
    },
  },

  worker: {
    plugins: () => [nxViteTsPaths()],
  },

  test: {
    setupFiles: ['src/setup-vitest.ts'],
    watch: false,
    globals: true,
    threads: false,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/npm/droid',
      provider: 'v8' as const,
    },
  },
}));
