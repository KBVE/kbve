import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const host = process.env.TAURI_DEV_HOST;
const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
	plugins: [react(), tailwindcss()],
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
