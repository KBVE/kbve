import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { kbveRnTauri } from '../../../packages/npm/rn-tauri/src/vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const host = process.env.TAURI_DEV_HOST;
const root = fileURLToPath(new URL('.', import.meta.url));
const packagesDir = resolve(root, '../../../packages/npm');

export default defineConfig({
	plugins: [react(), tailwindcss(), kbveRnTauri({ packagesDir })],
	resolve: {
		alias: {
			'@': resolve(root, 'src'),
			'react-i18next': resolve(root, 'src/i18n/react-i18next.ts'),
		},
	},
	clearScreen: false,
	server: {
		port: 1421,
		strictPort: true,
		host: host || false,
		watch: {
			ignored: ['**/src-tauri/**'],
		},
	},
	build: {
		target: 'esnext',
		minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
		sourcemap: !!process.env.TAURI_DEBUG,
		rollupOptions: {
			input: {
				main: resolve(root, 'index.html'),
				overlay: resolve(root, 'src/overlay/index.html'),
			},
		},
	},
});
