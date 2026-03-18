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
		proxy: {
			// Game server routes → axum (3080)
			'/api/v1/telemetry': {
				target: 'http://127.0.0.1:3080',
				changeOrigin: true,
			},
			'/api/v1/auth/game-token': {
				target: 'http://127.0.0.1:3080',
				changeOrigin: true,
			},
			// Everything else → Astro (4321)
			'/api': {
				target: 'http://127.0.0.1:4321',
				changeOrigin: true,
			},
		},
	},
	optimizeDeps: {
		exclude: ['isometric_game'],
	},
}));
