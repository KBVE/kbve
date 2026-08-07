import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { kbveRnTauri } from '../../../packages/npm/rn-tauri/src/vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const host = process.env.TAURI_DEV_HOST;
const root = fileURLToPath(new URL('.', import.meta.url));
const packagesDir = resolve(root, '../../../packages/npm');

import type { Plugin } from 'vite';

// Webview console is invisible in dev; the index.html boot guard POSTs
// errors here so they show up in the `cargo tauri dev` terminal.
function clientLog(): Plugin {
	return {
		name: 'kbve-client-log',
		configureServer(server) {
			server.middlewares.use('/__client_log', (req, res) => {
				let body = '';
				req.on('data', (c) => (body += c));
				req.on('end', () => {
					console.log('[webview]', body);
					res.statusCode = 204;
					res.end();
				});
			});
		},
	};
}

export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		kbveRnTauri({ packagesDir }),
		clientLog(),
	],
	resolve: {
		alias: [
			// @kbve/rn-tauri is consumed from source via alias (like @kbve/rn
			// inside the kbveRnTauri plugin) — it is not an installed package.
			{
				find: /^@kbve\/rn-tauri$/,
				replacement: resolve(packagesDir, 'rn-tauri/src/index.ts'),
			},
			// RN libraries import native-runtime pieces (TurboModuleRegistry,
			// Fabric codegen helpers) that react-native-web does not export;
			// shims cover them so the module graph loads in the webview.
			{
				find: /^react-native$/,
				replacement: resolve(root, 'src/lib/rn-web-shim.ts'),
			},
			{
				find: /^react-native\/.*/,
				replacement: resolve(root, 'src/lib/rn-internals-shim.ts'),
			},
			{ find: '@', replacement: resolve(root, 'src') },
			{
				find: 'react-i18next',
				replacement: resolve(root, 'src/i18n/react-i18next.ts'),
			},
		],
	},
	// Native RN libs resolve fine through the full rollup pipeline (prod build
	// proves it) but esbuild's dep pre-bundler chokes on their Fabric/codegen
	// internals — keep them out of optimizeDeps.
	optimizeDeps: {
		// react-native-web must go THROUGH the optimizer: its ESM dist
		// default-imports CJS deps (fbjs, normalize-colors, …) that only the
		// optimizer's interop makes importable in the browser.
		include: ['react-native-web'],
		exclude: [
			// 'react-native' resolves to the src shim (never optimizable);
			// keeping it out of the optimizer keeps the optimizer's graph and
			// the runtime graph identical.
			'react-native',
			'react-native-svg',
			'react-native-reanimated',
			'react-native-safe-area-context',
			'react-native-worklets',
		],
	},
	clearScreen: false,
	server: {
		port: 1421,
		strictPort: true,
		// Pre-transform the entry (and run dep optimization) at server start,
		// so the webview's first load never races the optimizer.
		warmup: {
			clientFiles: ['./src/main.tsx', './src/overlay/index.html'],
		},
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
