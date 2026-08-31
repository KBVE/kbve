/// <reference types='vitest' />
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import * as path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
	root: __dirname,
	cacheDir: '../../../node_modules/.vite/npm/devops',

	plugins: [
		tsconfigPaths(),
		dts({
			entryRoot: 'src',
			tsconfigPath: path.join(__dirname, 'tsconfig.lib.json'),
			outDir: '../../../dist/packages/npm/devops',
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
				'zod',
				'@bufbuild/protobuf',
				'@bufbuild/protobuf/wkt',
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
				'node:fs',
				'node:path',
				'node:child_process',
				'node:url',
				'node:http',
				'node:https',
				'node:stream',
				'node:zlib',
				'node:util',
				'node:os',
				'node:crypto',
				'node:events',
				'node:buffer',
				'node:querystring',
				'node:net',
				'node:tls',
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
