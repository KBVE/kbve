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
			formats: ['es', 'cjs'],
		},
		outDir: '../../../dist/packages/npm/droid',
		target: 'esnext',
		rollupOptions: {
			external: ['comlink', '@nanostores/persistent'], // externalize dependencies
		},
	},

	worker: {
	plugins: () => [nxViteTsPaths()],
	},

	test: {
		setupFiles: ['src/setup-vitest.ts'],
		watch: false,
		globals: true,
		environment: 'jsdom',
		include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
		reporters: ['default'],
		coverage: {
			reportsDirectory: '../../../coverage/npm/droid',
			provider: 'v8' as const,
		},
	},
}));
