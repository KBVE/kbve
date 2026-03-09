import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
	plugins: [react(), tailwindcss(), wasm(), topLevelAwait()],
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		watch: {
			ignored: ['**/src-tauri/**'],
		},
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'require-corp',
		},
	},
	optimizeDeps: {
		exclude: ['isometric_game'],
	},
}));
