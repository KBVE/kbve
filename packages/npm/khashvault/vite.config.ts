/// <reference types='vitest' />
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import * as path from 'path';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig({
	root: __dirname,
	cacheDir: '../../../node_modules/.vite/npm/khashvault',

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
		outDir: '../../../dist/packages/npm/khashvault',
		reportCompressedSize: true,
		lib: {
			entry: path.resolve(__dirname, 'src/index.ts'),
			name: 'khashvault',
			fileName: (format) => `khashvault.${format}.js`,
			formats: ['es'],
		},
		rollupOptions: {
			external: [
				'openpgp',
				'@kbve/droid',
				'comlink',
			],
		},
	},

	test: {
		globals: true,
		watch: false,
		environment: 'happy-dom',
		setupFiles: ['./src/test-setup.ts'],
		include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
		reporters: ['default'],
		coverage: {
			reportsDirectory: '../../../coverage/packages/npm/khashvault',
			provider: 'v8',
		},
	},
});
