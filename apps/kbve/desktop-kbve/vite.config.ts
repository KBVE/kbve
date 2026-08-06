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
		alias: [
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
		exclude: [
			// Never prebundle the RN cluster: the prebundled ESM drops default
			// exports the shims re-export, and the optimizer/runtime resolve
			// aliases differently — mismatched graphs break boot in WebKit.
			'react-native',
			'react-native-web',
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
