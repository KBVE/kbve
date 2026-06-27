import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const repoRoot = path.resolve(__dirname, '../../../..');

// Single source of truth for the client build version: version.toml (the same
// file the release/atom flow bumps). Baked into the bundle as PUBLIC_ARPG_VERSION
// and written to a no-cache version.json the running client polls to detect when
// it's serving a stale (CF/webview-cached) build and should reload.
const ARPG_VERSION = (() => {
	// Build-arg / env wins (CI passes the resolved release version so the bundle
	// matches the image tag even when version.toml is mid-publish-sync stale).
	// Falls back to version.toml for local builds where no env is set.
	const fromEnv = process.env.PUBLIC_ARPG_VERSION?.trim();
	if (fromEnv) return fromEnv;
	try {
		const toml = readFileSync(path.join(__dirname, 'version.toml'), 'utf8');
		return toml.match(/version\s*=\s*"([^"]+)"/)?.[1] ?? '0.0.0';
	} catch {
		return '0.0.0';
	}
})();

// Rent Earth brand logo, shown on the Discord Activity boot/sign-in screens. The
// discord build emits a copy beside index.html so the static boot page can load
// it same-origin (no URL-mapping/proxy dependency before the SDK is ready).
const BRAND_LOGO_SRC = path.join(
	__dirname,
	'public/assets/brand/logo/rentearthlogo.webp',
);
const BRAND_LOGO_NAME = 'rentearthlogo.webp';

// Content-hash the Discord Activity bundle and rewrite its index.html to match.
//
// vite's `build.lib` mode emits a fixed filename (`arpg.js`) with no content
// hash, so every release ships the SAME URL. The bundle has no nginx cache
// header (it falls through to `location /`), but Cloudflare caches `.js` by
// extension with a default ~4h edge TTL — and that cache is PER-COLO. So after a
// deploy, the colo Discord's Activity proxy hits can keep serving a stale
// `arpg.js` while another colo serves the fresh one. A content hash makes each
// build a unique, immutable URL: index.html (never edge-cached) always points at
// the newest hash, and no colo can pin an old bundle.
function hashDiscordBundle(htmlTemplatePath: string) {
	return {
		name: 'hash-discord-bundle',
		enforce: 'post' as const,
		generateBundle(_opts: unknown, bundle: Record<string, any>) {
			const chunk = Object.values(bundle).find(
				(b) => b.type === 'chunk' && b.isEntry,
			);
			if (!chunk) return;
			// Hash the FINAL (post-terser) code so the name tracks real content.
			const hash = createHash('sha256')
				.update(chunk.code)
				.digest('hex')
				.slice(0, 8);
			const hashedName = `arpg.${hash}.js`;
			delete bundle[chunk.fileName];
			chunk.fileName = hashedName;
			bundle[hashedName] = chunk;
			// Regenerate index.html (the app build copied the template verbatim
			// with `arpg.js`) so its <script> points at the hashed bundle.
			const template = readFileSync(htmlTemplatePath, 'utf8');
			const html = template.replace(
				/<script\s+src="arpg\.js"([^>]*)><\/script>/,
				`<script src="${hashedName}"$1></script>`,
			);
			(this as any).emitFile({
				type: 'asset',
				fileName: 'index.html',
				source: html,
			});
			// Fresh version marker the client polls at boot (nginx serves it
			// no-cache) — lets a stale-cached bundle detect it's outdated.
			(this as any).emitFile({
				type: 'asset',
				fileName: 'version.json',
				source: JSON.stringify({ version: ARPG_VERSION }),
			});
			// Brand logo beside index.html for the same-origin boot screen.
			try {
				(this as any).emitFile({
					type: 'asset',
					fileName: BRAND_LOGO_NAME,
					source: readFileSync(BRAND_LOGO_SRC),
				});
			} catch {
				/* logo missing — boot screen falls back to no image */
			}
		},
	};
}

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

const itemdbDataAlias = {
	find: /^@kbve\/itemdb-data$/,
	replacement: path.join(
		repoRoot,
		'packages/data/codegen/generated/itemdb.json',
	),
};

const spelldbDataAlias = {
	find: /^@kbve\/spelldb-data$/,
	replacement: path.join(
		repoRoot,
		'packages/data/codegen/generated/spelldb-data.json',
	),
};

const itemdbSchemaAlias = {
	find: /^@kbve\/itemdb-schema$/,
	replacement: path.join(
		repoRoot,
		'packages/data/codegen/generated/itemdb-schema.ts',
	),
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
			alias: [
				laserAlias,
				itemdbDataAlias,
				spelldbDataAlias,
				itemdbSchemaAlias,
			],
			extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
		},
	};

	if (mode === 'embed' || mode === 'discord') {
		const discord = mode === 'discord';
		return {
			...base,
			plugins: discord
				? [
						...base.plugins,
						hashDiscordBundle(
							path.join(
								__dirname,
								'public/discord/arpg/index.html',
							),
						),
					]
				: base.plugins,
			base: './',
			publicDir: false,
			define: {
				'process.env.NODE_ENV': JSON.stringify('production'),
				'import.meta.env.PUBLIC_DISCORD_CLIENT_ID': JSON.stringify(
					process.env.PUBLIC_DISCORD_CLIENT_ID ?? '',
				),
				'import.meta.env.PUBLIC_ARPG_VERSION':
					JSON.stringify(ARPG_VERSION),
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
			'import.meta.env.PUBLIC_ARPG_VERSION': JSON.stringify(ARPG_VERSION),
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
