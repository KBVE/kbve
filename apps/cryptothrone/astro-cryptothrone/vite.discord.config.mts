import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Discord Activity bundle. Same game graph as embed.js, but the entry runs the
// Discord OAuth handshake first (src/embed/discord.tsx). Main-thread only — the
// Activity iframe has no SharedWorkers (the game already imports the lean
// @kbve/astro/ui, so no droid workers are pulled in).
// Output: apps/cryptothrone/astro-cryptothrone/public/discord/discord.js
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
			{ find: '@kbve/laser/ecs', replacement: pkg('npm/laser/src/ecs.ts') },
			{ find: '@kbve/laser', replacement: pkg('npm/laser/src/index.ts') },
			{
				find: '@kbve/itemdb-data',
				replacement: pkg('data/codegen/generated/itemdb-data.json'),
			},
			{
				find: '@kbve/npcdb-data',
				replacement: pkg('data/codegen/generated/npcdb-data.json'),
			},
		],
	},
	publicDir: false,
	define: {
		'process.env.NODE_ENV': JSON.stringify('production'),
		// Raw `vite build` (not Astro) does not surface PUBLIC_* from process.env
		// into import.meta.env, so bake the Discord client id in explicitly from
		// the Docker build ENV. Public value — safe to inline client-side.
		'import.meta.env.PUBLIC_DISCORD_CLIENT_ID': JSON.stringify(
			process.env.PUBLIC_DISCORD_CLIENT_ID ?? '',
		),
	},
	build: {
		outDir: 'public/discord',
		emptyOutDir: false,
		minify: 'terser',
		sourcemap: false,
		target: 'es2020',
		lib: {
			entry: resolve(here, 'src/embed/discord.tsx'),
			name: 'CryptothroneDiscord',
			formats: ['iife'],
			fileName: () => 'discord.js',
		},
		rollupOptions: {
			output: {
				inlineDynamicImports: true,
				exports: 'named',
			},
		},
	},
});
