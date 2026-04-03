import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { compression } from 'vite-plugin-compression2';
import fs from 'fs';
import path from 'path';

const host = process.env.TAURI_DEV_HOST;

// Use mkcert certs for local HTTPS when available
const certDir = path.resolve(__dirname, 'certificates');
const httpsConfig =
	fs.existsSync(path.join(certDir, 'cert.pem')) &&
	fs.existsSync(path.join(certDir, 'key.pem'))
		? {
				cert: fs.readFileSync(path.join(certDir, 'cert.pem')),
				key: fs.readFileSync(path.join(certDir, 'key.pem')),
			}
		: undefined;

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
		https: httpsConfig,
		watch: {
			ignored: ['**/src-tauri/**'],
		},
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'require-corp',
		},
		proxy: {
			'/api/v1/telemetry': {
				target: process.env.GAME_API_TARGET || 'http://127.0.0.1:3080',
				changeOrigin: true,
				secure: false,
			},
			'/api/v1/auth/game-token': {
				target: process.env.GAME_API_TARGET || 'http://127.0.0.1:3080',
				changeOrigin: true,
				secure: false,
			},
			'/api': {
				target: process.env.ASTRO_API_TARGET || 'http://127.0.0.1:4321',
				changeOrigin: true,
				secure: false,
			},
		},
	},
	optimizeDeps: {
		exclude: ['isometric_game'],
	},
}));
