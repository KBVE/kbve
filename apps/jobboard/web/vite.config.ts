import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const API_TARGET = process.env.JOBBOARD_API_TARGET || 'http://127.0.0.1:5400';
const repoRoot = path.resolve(__dirname, '../../..');

export default defineConfig({
	plugins: [
		react({
			babel: {
				// reanimated v4 ships its babel plugin via react-native-worklets
				plugins: ['react-native-worklets/plugin'],
			},
		}),
		tailwindcss(),
	],
	base: '/',
	resolve: {
		alias: [
			// buildless workspace sources consumed directly (vite transpiles them);
			// subpaths first so they win over the bare @kbve/rn match.
			{
				find: /^@kbve\/rn\/auth$/,
				replacement: path.join(
					repoRoot,
					'packages/npm/rn/src/auth/index.ts',
				),
			},
			{
				// extensionless so vite resolves ui/index.web.ts (drops nav) first
				find: /^@kbve\/rn\/ui$/,
				replacement: path.join(
					repoRoot,
					'packages/npm/rn/src/ui/index',
				),
			},
			{
				find: /^@kbve\/rn$/,
				replacement: path.join(
					repoRoot,
					'packages/npm/rn/src/index.ts',
				),
			},
			{
				find: /^@kbve\/core$/,
				replacement: path.join(
					repoRoot,
					'packages/npm/core/src/index.ts',
				),
			},
			// RN primitives render on web
			{ find: /^react-native$/, replacement: 'react-native-web' },
		],
		extensions: [
			'.web.tsx',
			'.web.ts',
			'.web.jsx',
			'.web.js',
			'.tsx',
			'.ts',
			'.jsx',
			'.js',
			'.json',
		],
	},
	optimizeDeps: {
		include: ['react-native-web'],
	},
	define: {
		global: 'globalThis',
	},
	build: {
		outDir: 'dist',
		emptyOutDir: true,
	},
	server: {
		port: 5401,
		strictPort: true,
		proxy: {
			'/api': {
				target: API_TARGET,
				changeOrigin: true,
				secure: false,
			},
		},
	},
});
