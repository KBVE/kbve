import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../../..');
const astroSrc = path.join(repoRoot, 'apps/kbve/astro-kbve/src');
const arpgSrc = path.join(astroSrc, 'arcade/isometric-arpg');

// Local arpg-server WebSocket (the compose service publishes :7979 on the host).
const GAME_WS = process.env.PUBLIC_ARPG_GAME_WS || 'ws://localhost:7979/ws';

// @kbve/laser's barrel re-exports an r3f layer (lib/r3f/*) whose three /
// @react-three peers (heavy 3D libs) the arpg never uses. Stub just that subtree
// so the barrel resolves without dragging three into the bundle. The lighter
// optional peers it also touches (bitecs, rapier-connector) are installed instead,
// so their real exports resolve and tree-shake if unused.
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

export default defineConfig(({ mode }) => ({
	plugins: [stubLaserR3F(), react()],
	base: '/',
	resolve: {
		// One React copy: the arpg source resolves react from the repo-root
		// node_modules while the app uses web/node_modules -> "Invalid hook call".
		dedupe: ['react', 'react-dom'],
		alias: [
			// Bare deps imported from the aliased astro source (outside this app's
			// dir) must resolve to THIS app's node_modules — node's upward lookup
			// from the astro tree wouldn't find them in a clean (Docker) build.
			...[
				'phaser',
				'react',
				'react-dom',
				'@supabase/supabase-js',
				'dexie',
				'bitecs',
				'@phaserjs/rapier-connector',
			].map((dep) => ({
				find: new RegExp(`^${dep.replace('/', '\\/')}$`),
				replacement: path.join(__dirname, 'node_modules', dep),
			})),
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
