import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// ARPG Discord Activity bundle. The entry runs the Discord OAuth handshake
// (src/embed/arpg/discord.tsx), exchanges the code for a session via axum-kbve,
// then mounts the arpg game (ReactIsoArpgApp) with the jwt + username.
// Output: apps/kbve/astro-kbve/public/discord/arpg/arpg.js
const here = fileURLToPath(new URL('.', import.meta.url));
const pkg = (p: string) => resolve(here, '../../../packages', p);

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: [
			{
				find: '@kbve/laser/ecs',
				replacement: pkg('npm/laser/src/ecs.ts'),
			},
			{ find: '@kbve/laser', replacement: pkg('npm/laser/src/index.ts') },
		],
	},
	publicDir: false,
	define: {
		'process.env.NODE_ENV': JSON.stringify('production'),
		// Raw `vite build` (not Astro) does not surface PUBLIC_* from process.env
		// into import.meta.env, so bake the Discord client id in explicitly from
		// the build ENV. Public value — safe to inline client-side.
		'import.meta.env.PUBLIC_DISCORD_CLIENT_ID': JSON.stringify(
			process.env.PUBLIC_DISCORD_CLIENT_ID ?? '',
		),
	},
	build: {
		outDir: 'public/discord/arpg',
		emptyOutDir: false,
		minify: 'terser',
		sourcemap: false,
		target: 'es2020',
		lib: {
			entry: resolve(here, 'src/embed/arpg/discord.tsx'),
			name: 'ArpgDiscord',
			formats: ['iife'],
			fileName: () => 'arpg.js',
		},
		rollupOptions: {
			output: {
				inlineDynamicImports: true,
				exports: 'named',
			},
		},
	},
});
