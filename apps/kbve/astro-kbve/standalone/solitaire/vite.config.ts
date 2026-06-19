import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../..');

export default defineConfig({
	root: here,
	base: './',
	resolve: {
		alias: {
			'@kbve/laser': path.resolve(
				repoRoot,
				'packages/npm/laser/src/index.ts',
			),
		},
	},
	plugins: [react()],
	build: {
		outDir: path.resolve(here, '../../dist/solitaire-standalone'),
		emptyOutDir: true,
		target: 'es2020',
		minify: 'terser',
		cssCodeSplit: false,
		chunkSizeWarningLimit: 8000,
		rollupOptions: {
			output: {
				inlineDynamicImports: true,
				entryFileNames: 'assets/solitaire.js',
				chunkFileNames: 'assets/solitaire.js',
				assetFileNames: 'assets/solitaire.[ext]',
			},
		},
	},
});
