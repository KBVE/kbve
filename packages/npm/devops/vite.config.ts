/// <reference types='vitest' />
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import * as path from 'path';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig({
	root: __dirname,
	cacheDir: '../../../node_modules/.vite/npm/devops',

	plugins: [
		nxViteTsPaths(),
		nxCopyAssetsPlugin(['*.md']),
		dts({
			entryRoot: 'src',
			tsConfigFilePath: path.join(__dirname, 'tsconfig.lib.json'),
			skipDiagnostics: true,
		}),
	],

	build: {
		outDir: '../../../dist/packages/npm/devops',
		reportCompressedSize: true,
		lib: {
			entry: path.resolve(__dirname, 'src/index.ts'),
			name: 'devops',
			fileName: (format) => `devops.${format}.js`,
			formats: ['es'],
		},
		rollupOptions: {
			external: [
				'axios',
				'jsdom',
				'marked',
				'dompurify',
				'child_process',
				'path',
				'fs',
				'url',
				'http',
				'https',
				'stream',
				'zlib',
				'util',
				'os',
				'crypto',
				'events',
				'buffer',
				'querystring',
				'net',
				'tls',
			],
		},
	},

	test: {
		globals: true,
		watch: false,
		environment: 'node',
		include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
		reporters: ['default'],
		coverage: {
			reportsDirectory: '../../../coverage/packages/npm/devops',
			provider: 'v8',
		},
	},
});
