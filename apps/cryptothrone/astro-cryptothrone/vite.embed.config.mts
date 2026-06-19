import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Standalone library build for the embed.js bundle (ESM config — the tailwind
// vite plugin is ESM-only).
// Output: apps/cryptothrone/astro-cryptothrone/public/embed/embed.js
//
// Bundles React, Phaser, grid-engine, @kbve/laser, and the whole game UI into
// one self-contained IIFE that mounts into a shadow root. The game's Tailwind
// is compiled and inlined (global.css?inline) so the bundle needs no external
// stylesheet. Host pages drop in:
//   <div data-cryptothrone data-jwt="..." data-username="..."></div>
//   <script src="https://cryptothrone.com/embed/embed.js" defer></script>
const here = fileURLToPath(new URL('.', import.meta.url));

const pkg = (p: string) => resolve(here, '../../../packages', p);

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: [
			{ find: /^@\//, replacement: resolve(here, 'src') + '/' },
			{ find: '@kbve/astro/ui', replacement: pkg('npm/astro/src/ui.ts') },
			{ find: '@kbve/astro', replacement: pkg('npm/astro/src/index.ts') },
			{ find: '@kbve/droid', replacement: pkg('npm/droid/src/index.ts') },
			{
				find: '@kbve/laser/ecs',
				replacement: pkg('npm/laser/src/ecs.ts'),
			},
			{ find: '@kbve/laser', replacement: pkg('npm/laser/src/index.ts') },
			{
				find: '@kbve/chat/gamechat',
				replacement: pkg('npm/chat/src/gamechat.ts'),
			},
			{
				find: '@kbve/itemdb-data',
				replacement: pkg('data/codegen/generated/itemdb.json'),
			},
			{
				find: '@kbve/npcdb-data',
				replacement: pkg('data/codegen/generated/npcdb-data.json'),
			},
			{
				find: '@kbve/npcdb',
				replacement: pkg('data/codegen/npcdb.ts'),
			},
		],
	},
	publicDir: false,
	define: {
		'process.env.NODE_ENV': JSON.stringify('production'),
	},
	build: {
		outDir: 'public/embed',
		emptyOutDir: false,
		minify: 'terser',
		sourcemap: false,
		target: 'es2020',
		lib: {
			entry: resolve(here, 'src/embed/index.tsx'),
			name: 'Cryptothrone',
			formats: ['iife'],
			fileName: () => 'embed.js',
		},
		rolldownOptions: {
			output: {
				inlineDynamicImports: true,
				exports: 'named',
			},
		},
	},
});
