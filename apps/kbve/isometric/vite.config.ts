import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { compression } from 'vite-plugin-compression2';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
	plugins: [
		react(),
		tailwindcss(),
		wasm(),
		topLevelAwait(),
		compression({
			include: /\.wasm$/i,
			exclude: /\.wgsl$/i,
			algorithm: 'brotliCompress',
			deleteOriginalAssets: false,
		}),
		compression({
			include: /\.wasm$/i,
			exclude: /\.wgsl$/i,
			algorithm: 'gzip',
			deleteOriginalAssets: /\.wasm$/i,
		}),
	],
	base: '/isometric/',
	clearScreen: false,
	build: {
		rollupOptions: {
			output: {
				entryFileNames: 'assets/index.js',
				chunkFileNames: 'assets/[name].js',
				assetFileNames: 'assets/[name].[ext]',
			},
		},
	},
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		watch: {
			ignored: ['**/src-tauri/**'],
		},
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'credentialless',
		},
	},
	optimizeDeps: {
		exclude: ['isometric_game'],
	},
}));
