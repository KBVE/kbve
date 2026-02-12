/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import * as path from 'path';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig({
	root: __dirname,
	cacheDir: '../../../node_modules/.vite/npm/laser',

	plugins: [
		react(),
		nxViteTsPaths(),
		nxCopyAssetsPlugin(['*.md']),
		dts({
			entryRoot: 'src',
			tsConfigFilePath: path.join(__dirname, 'tsconfig.lib.json'),
			skipDiagnostics: true,
		}),
	],

	build: {
		outDir: '../../../dist/packages/npm/laser',
		reportCompressedSize: true,
		lib: {
			entry: path.resolve(__dirname, 'src/index.ts'),
			name: 'laser',
			fileName: (format) => `laser.${format}.js`,
			formats: ['es'],
		},
		rollupOptions: {
			external: [
				'react',
				'react-dom',
				'react/jsx-runtime',
				'phaser',
				'three',
				'@react-three/fiber',
				'@react-three/drei',
			],
			output: {
				globals: {
					react: 'React',
					'react-dom': 'ReactDOM',
					phaser: 'Phaser',
					three: 'THREE',
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
			reportsDirectory: '../../../coverage/packages/npm/laser',
			provider: 'v8',
		},
	},
});
