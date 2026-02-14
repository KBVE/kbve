/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import * as path from 'path';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig({
	root: __dirname,
	cacheDir: '../../../node_modules/.vite/npm/astro',

	plugins: [
		react(),
		nxViteTsPaths(),
		nxCopyAssetsPlugin(['*.md']),
		dts({
			entryRoot: 'src',
			tsconfigPath: path.join(__dirname, 'tsconfig.lib.json'),
			outDir: '../../../dist/packages/npm/astro',
		}),
	],

	build: {
		outDir: '../../../dist/packages/npm/astro',
		reportCompressedSize: true,
		lib: {
			entry: path.resolve(__dirname, 'src/index.ts'),
			name: 'astro',
			fileName: (format) => `astro.${format}.js`,
			formats: ['es'],
		},
		rollupOptions: {
			external: [
				'react',
				'react-dom',
				'react/jsx-runtime',
				'astro',
				'@kbve/droid',
			],
			output: {
				globals: {
					react: 'React',
					'react-dom': 'ReactDOM',
				},
			},
		},
	},

	test: {
		globals: true,
		watch: false,
		environment: 'jsdom',
		include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
		reporters: ['default'],
		coverage: {
			reportsDirectory: '../../../coverage/packages/npm/astro',
			provider: 'v8',
		},
	},
});
