import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../../..');
const astroSrc = path.join(repoRoot, 'apps/kbve/astro-kbve/src');
const arpgSrc = path.join(astroSrc, 'arcade/isometric-arpg');

// Local arpg-server WebSocket (the compose service publishes :7979 on the host).
const GAME_WS = process.env.PUBLIC_ARPG_GAME_WS || 'ws://localhost:7979/ws';

export default defineConfig(({ mode }) => ({
	plugins: [react()],
	base: '/',
	resolve: {
		// One React copy: the arpg source resolves react from the repo-root
		// node_modules while the app uses web/node_modules -> "Invalid hook call".
		dedupe: ['react', 'react-dom'],
		alias: [
			// The arpg game source lives in astro-kbve and is consumed buildless
			// (vite transpiles it). @arpg is this app's handle for that tree.
			{ find: /^@arpg\//, replacement: `${arpgSrc}/` },
			// @kbve/laser buildless source (the package ships a built bundle, but
			// vite transpiles the TS source directly for hot-reload).
			{
				find: /^@kbve\/laser$/,
				replacement: path.join(
					repoRoot,
					'packages/npm/laser/src/index.ts',
				),
			},
			// Supabase config -> web shim (proxy URL + public anon key). Must win
			// over the broad @/ alias, so it comes first.
			{
				find: /^@\/lib\/supa$/,
				replacement: path.join(__dirname, 'src/lib/supa.ts'),
			},
			// Everything else the arpg tree imports via @/ resolves into astro src
			// (IDBStorage, AuthBridge, etc.).
			{ find: /^@\//, replacement: `${astroSrc}/` },
		],
		extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
	},
	define: {
		'import.meta.env.PUBLIC_ARPG_LOCAL': JSON.stringify(
			process.env.PUBLIC_ARPG_LOCAL ?? 'false',
		),
		'import.meta.env.PUBLIC_ARPG_GAME_WS': JSON.stringify(GAME_WS),
	},
	// Serve the arpg sprite/tileset assets from astro's public dir at the same
	// `/assets/arcade/arpg/...` paths the game references (setArpgAssetBase('')).
	publicDir: path.join(repoRoot, 'apps/kbve/astro-kbve/public'),
	build: { outDir: 'dist', emptyOutDir: true },
	server: {
		host: '0.0.0.0',
		port: 5402,
		strictPort: true,
		proxy: {
			// supabase.kbve.com CORS allows only *.kbve.com origins, not localhost;
			// proxy auth/rest through the dev server so the browser sees same-origin.
			'/supabase': {
				target: 'https://supabase.kbve.com',
				changeOrigin: true,
				secure: true,
				rewrite: (p) => p.replace(/^\/supabase/, ''),
			},
		},
	},
}));
