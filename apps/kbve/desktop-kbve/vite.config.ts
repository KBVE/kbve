import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const host = process.env.TAURI_DEV_HOST;

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
	},
});
