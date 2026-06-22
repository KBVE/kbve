import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../../..');
const astroPublic = path.join(repoRoot, 'apps/kbve/astro-kbve/public');

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
//   --mode embed  -> IIFE mount()/unmount() bundle the astro kbve.com/arcade/arpg
//                    page loads (public/arpg/arpg-embed.js)
//   --mode discord-> IIFE for the Discord Activity (public/discord/arpg/arpg.js)
// The embed + discord bundles emit into astro's public dir so astro serves them
// as static files; the game source itself lives here and is the single source.
export default defineConfig(({ mode }) => {
	const base = {
		plugins: [stubLaserR3F(), react()],
		resolve: {
			dedupe: ['react', 'react-dom'],
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
				outDir: discord
					? path.join(astroPublic, 'discord/arpg')
					: path.join(astroPublic, 'arpg'),
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
			},
		},
	};
});
