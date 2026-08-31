/// <reference types='vitest' />
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import * as path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
	root: __dirname,
	cacheDir: '../../../node_modules/.vite/npm/khashvault',

	plugins: [
		tsconfigPaths(),
		dts({
			entryRoot: 'src',
			tsconfigPath: path.join(__dirname, 'tsconfig.lib.json'),
			outDir: '../../../dist/packages/npm/khashvault',
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
			external: ['openpgp', '@kbve/droid', 'comlink'],
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
