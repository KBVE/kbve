import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import path from 'path';
import copy from 'rollup-plugin-copy';

export default defineConfig(() => ({
	root: __dirname,
	cacheDir: '../../../node_modules/.vite/npm/droid',
	plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],

	build: {
		lib: {
			entry: path.resolve(__dirname, 'src/index.ts'),
			name: 'droid',
			fileName: (format) => `droid.js`,
			formats: ['es', 'cjs'],
		},
		outDir: '../../../dist/packages/npm/droid',
		target: 'esnext',
		rollupOptions: {
			input: {
				main: path.resolve(__dirname, 'src/main.ts'),
				canvasWorker: path.resolve(
					__dirname,
					'src/workers/canvas-worker.ts',
				),
				aiWorker: path.resolve(__dirname, 'src/workers/ai-worker.ts'),
			},
			output: {
				entryFileNames: (chunkInfo) => {
					if (chunkInfo.name?.includes('Worker')) {
						return '[name].js';
					}
					return 'droid.js';
				},
			},
			external: [], // externalize dependencies - 'comlink', '@nanostores/persistent'
			plugins: [],
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
