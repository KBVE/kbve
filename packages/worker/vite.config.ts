import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/worker',

  plugins: [nxViteTsPaths()],

  worker: {
    plugins: () => [nxViteTsPaths()],
  },

  test: {
    globals: true,
    cache: { dir: '../../node_modules/.vitest' },
    environment: 'jsdom', // Using jsdom for a browser-like environment
    testTimeout: 30000,  // Extending out default timeout for longer-running tests
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/worker',
      provider: 'v8',
    },
  },
});
