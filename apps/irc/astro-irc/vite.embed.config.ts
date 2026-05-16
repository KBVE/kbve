import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Standalone library build for the chat.js embed bundle.
// Output: apps/irc/astro-irc/public/embed/chat.js (served from chat.kbve.com/embed/chat.js)
//
// Bundles React, nanostores, IRC parser, transport, and the entire shadow-DOM
// chat UI into a single self-contained IIFE. Host pages drop in:
//   <div id="kbve-chat" data-channel="#general"></div>
//   <script src="https://chat.kbve.com/embed/chat.js" defer></script>
export default defineConfig({
	plugins: [react()],
	publicDir: false,
	define: {
		'process.env.NODE_ENV': JSON.stringify('production'),
	},
	build: {
		outDir: 'public/embed',
		// Don't wipe — public/embed also holds example.html (live docs).
		// Only chat.js gets overwritten on each build.
		emptyOutDir: false,
		minify: 'terser',
		sourcemap: false,
		target: 'es2020',
		lib: {
			entry: resolve(__dirname, 'src/embed/index.tsx'),
			name: 'KbveChat',
			formats: ['iife'],
			fileName: () => 'chat.js',
		},
		rollupOptions: {
			output: {
				inlineDynamicImports: true,
				exports: 'named',
			},
		},
	},
});
