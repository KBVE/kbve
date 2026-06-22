import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../../..');

const GAME_WS = process.env.PUBLIC_ARPG_GAME_WS || 'ws://localhost:7979/ws';

function stubLaserR3F() {
	const virtual = '\0arpg-laser-r3f-stub';
	return {
		name: 'stub-laser-r3f',
		enforce: 'pre' as const,
		resolveId(source: string) {
			return /[\\/]lib[\\/]r3f[\\/]/.test(source) ? virtual : null;
		},
		load(id: string) {
			return id === virtual
				? 'export const Stage = () => null; export const useGameLoop = () => {};'
				: null;
		},
	};
}

const laserAlias = {
	find: /^@kbve\/laser$/,
	replacement: path.join(repoRoot, 'packages/npm/laser/src/index.ts'),
};

// Build modes:
//   (default)     -> the standalone app for arpg.kbve.com (dist/)
//   --mode embed  -> window.ArpgEmbed IIFE (mount/mountApp) -> dist/arpg-embed.js,
//                    so arpg.kbve.com serves it as a CDN and kbve.com/arcade/arpg
//                    loads it cross-origin (npm run build emits app + embed)
//   --mode discord-> IIFE for the Discord Activity -> astro public/discord/arpg/
//                    arpg.js (served same-origin from kbve.com, loaded relatively)
// arpg.kbve.com is the single source: app, embed bundle, and art all ship here.
export default defineConfig(({ mode }) => {
	const base = {
		plugins: [stubLaserR3F(), react()],
		resolve: {
			// dedupe bitecs: laser declares it an optional peer, so aliasing
			// @kbve/laser to source otherwise lets vite resolve laser's `bitecs`
			// import to its optional-peer stub. That works at the repo root
			// (hoisted node_modules) but breaks the container's isolated install
			// ("query is not exported by __vite-optional-peer-dep:bitecs"). This
			// app depends on bitecs directly, so pin everyone to that one copy.
			// phaser + @phaserjs/rapier-connector are the same trap: laser source
			// lives outside web/, so vite resolves its bare imports relative to
			// packages/npm/laser, which has no node_modules in the container
			// ("Could not resolve 'phaser' imported by @kbve/laser"). Pin them
			// to this app's copy. Local builds mask it via root node_modules.
			dedupe: [
				'react',
				'react-dom',
				'bitecs',
				'phaser',
				'@phaserjs/rapier-connector',
			],
			alias: [laserAlias],
			extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
		},
	};

	if (mode === 'embed' || mode === 'discord') {
		const discord = mode === 'discord';
		return {
			...base,
			base: './',
			publicDir: false,
			define: {
				'process.env.NODE_ENV': JSON.stringify('production'),
				'import.meta.env.PUBLIC_DISCORD_CLIENT_ID': JSON.stringify(
					process.env.PUBLIC_DISCORD_CLIENT_ID ?? '',
				),
			},
			build: {
				// Both bundles emit into this app's own dist so arpg.kbve.com
				// serves everything (CDN). The app build's publicDir copies the
				// Discord page (public/discord/arpg/index.html) into dist, and
				// these lib builds drop the JS beside it:
				//   embed   -> dist/arpg-embed.js   (kbve.com/arcade/arpg loads it)
				//   discord -> dist/discord/arpg/arpg.js (Discord Activity root)
				outDir: discord
					? path.join(__dirname, 'dist/discord/arpg')
					: path.join(__dirname, 'dist'),
				emptyOutDir: false,
				minify: 'terser',
				sourcemap: false,
				target: 'es2020',
				lib: {
					entry: path.join(
						__dirname,
						discord
							? 'src/embed/discord.tsx'
							: 'src/embed/index.tsx',
					),
					name: discord ? 'ArpgDiscord' : 'ArpgEmbed',
					formats: ['iife' as const],
					fileName: () => (discord ? 'arpg.js' : 'arpg-embed.js'),
				},
				rollupOptions: {
					output: { inlineDynamicImports: true, exports: 'named' },
				},
			},
		};
	}

	return {
		...base,
		base: '/',
		define: {
			'import.meta.env.PUBLIC_ARPG_LOCAL': JSON.stringify(
				process.env.PUBLIC_ARPG_LOCAL ?? 'false',
			),
			'import.meta.env.PUBLIC_ARPG_GAME_WS': JSON.stringify(GAME_WS),
			'import.meta.env.PUBLIC_SUPABASE_URL': JSON.stringify(
				process.env.PUBLIC_SUPABASE_URL ?? '',
			),
			'import.meta.env.PUBLIC_ARPG_CHAT_WS': JSON.stringify(
				process.env.PUBLIC_ARPG_CHAT_WS ?? '',
			),
		},
		publicDir: path.join(__dirname, 'public'),
		build: { outDir: 'dist', emptyOutDir: true },
		server: {
			host: '0.0.0.0',
			port: 5402,
			strictPort: true,
			proxy: {
				'/supabase': {
					target: 'https://supabase.kbve.com',
					changeOrigin: true,
					secure: true,
					rewrite: (p) => p.replace(/^\/supabase/, ''),
				},
				'/gamechat': {
					target: 'wss://chat.kbve.com',
					ws: true,
					changeOrigin: true,
					secure: true,
					headers: { origin: 'https://arpg.kbve.com' },
				},
			},
		},
	};
});
