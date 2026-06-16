import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const API_TARGET = process.env.JOBBOARD_API_TARGET || 'http://127.0.0.1:5400';
const repoRoot = path.resolve(__dirname, '../../..');

export default defineConfig(({ mode }) => ({
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
		// @kbve/rn source resolves react from the repo-root node_modules while the
		// app uses web/node_modules -> two React copies -> "Invalid hook call".
		// Force a single copy of each.
		dedupe: ['react', 'react-dom', 'react-native-web'],
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
			{
				find: /^@kbve\/fx$/,
				replacement: path.join(
					repoRoot,
					'packages/npm/fx/src/index.ts',
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
		// the prebundle scanner ignores resolve.extensions; without this it
		// grabs reanimated's native *.js (Flow syntax) instead of the *.web.js
		// variants and esbuild fails ("Expected from but found {").
		esbuildOptions: {
			resolveExtensions: [
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
	},
	define: {
		global: 'globalThis',
		// react-native / react-native-web / reanimated reference these RN globals
		// that Metro injects but vite does not -> ReferenceError, blank page.
		__DEV__: JSON.stringify(mode !== 'production'),
		'process.env.NODE_ENV': JSON.stringify(mode),
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
			// supabase.kbve.com CORS only allows *.kbve.com origins, not
			// localhost; proxy auth/rest through the dev server so the browser
			// sees same-origin. Prod (jobs.kbve.com) hits supabase directly.
			'/supabase': {
				target: 'https://supabase.kbve.com',
				changeOrigin: true,
				secure: true,
				rewrite: (p) => p.replace(/^\/supabase/, ''),
			},
			// kbve.com API (profile/wallet) — same CORS dodge as /supabase.
			'/kbveapi': {
				target: 'https://kbve.com',
				changeOrigin: true,
				secure: true,
				rewrite: (p) => p.replace(/^\/kbveapi/, ''),
			},
		},
	},
}));
