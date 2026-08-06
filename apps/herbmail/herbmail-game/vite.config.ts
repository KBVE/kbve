/// <reference types='vitest' />
import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import {
	animationChannelCountsInFile,
	meshNodeNamesInFile,
	restoreMeshNamesInFile,
} from './tools/glbNames';

const laserSrc = path.resolve(__dirname, '../../../packages/npm/laser/src');
const generated = path.resolve(
	__dirname,
	'../../../packages/data/codegen/generated',
);

const itemdbDataAlias = {
	find: /^@kbve\/itemdb-data$/,
	replacement: path.join(generated, 'itemdb.json'),
};
const itemdbSchemaAlias = {
	find: /^@kbve\/itemdb-schema$/,
	replacement: path.join(generated, 'itemdb-schema.ts'),
};

// Dev-only Icon Studio sink: the Codex snapshot tool POSTs a confirmed 64x64
// PNG here and it lands in both icon dirs (game + astro site). Refs are
// validated against the itemdb bundle so the endpoint can't write outside
// the icon folders. Absent from production builds entirely.
function iconStudioWriter(): Plugin {
	const gameDir = path.resolve(__dirname, 'public/icons/items');
	const astroDir = path.resolve(
		__dirname,
		'../../../apps/kbve/astro-kbve/public/assets/items/equipment',
	);
	const validRefs = () => {
		const bundle = JSON.parse(
			fs.readFileSync(path.join(generated, 'itemdb.json'), 'utf8'),
		) as { items: { ref: string }[] };
		return new Set(bundle.items.map((i) => i.ref));
	};
	return {
		name: 'icon-studio-writer',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use('/__icon-studio', (req, res) => {
				if (req.method !== 'POST') {
					res.statusCode = 405;
					res.end();
					return;
				}
				let body = '';
				req.on('data', (c) => (body += c));
				req.on('end', () => {
					try {
						const { ref, png } = JSON.parse(body) as {
							ref: string;
							png: string;
						};
						if (!validRefs().has(ref))
							throw new Error(`unknown ref ${ref}`);
						const data = Buffer.from(
							png.replace(/^data:image\/png;base64,/, ''),
							'base64',
						);
						const paths = [
							path.join(gameDir, `${ref}.png`),
							path.join(astroDir, `${ref}.png`),
						];
						for (const p of paths) {
							fs.mkdirSync(path.dirname(p), { recursive: true });
							fs.writeFileSync(p, data);
						}
						res.setHeader('Content-Type', 'application/json');
						res.end(JSON.stringify({ written: paths }));
					} catch (e) {
						res.statusCode = 400;
						res.end(JSON.stringify({ error: String(e) }));
					}
				});
			});
		},
	};
}

const ASSET_HASHES_ID = 'virtual:asset-hashes';

// public/textures is a bake output committed at its final resolution, so a
// retarget changes the file itself and the content hash moves with it.
function assetHashes(): Plugin {
	const publicDir = path.resolve(__dirname, 'public');
	const build = () => {
		const out: Record<string, string> = {};
		const walk = (dir: string, match: RegExp, salt: string) => {
			if (!fs.existsSync(dir)) return;
			for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
				const p = path.join(dir, e.name);
				if (e.isDirectory()) {
					walk(p, match, salt);
					continue;
				}
				if (!match.test(e.name)) continue;
				const url = `/${path.relative(publicDir, p).split(path.sep).join('/')}`;
				out[url] = crypto
					.createHash('sha256')
					.update(fs.readFileSync(p))
					.update(salt)
					.digest('hex')
					.slice(0, 8);
			}
		};
		walk(path.join(publicDir, 'models'), /\.glb$/i, '');
		walk(path.join(publicDir, 'textures'), /\.(png|jpe?g)$/i, '');
		return out;
	};
	return {
		name: 'asset-hashes',
		resolveId(id) {
			return id === ASSET_HASHES_ID ? `\0${ASSET_HASHES_ID}` : null;
		},
		load(id) {
			if (id !== `\0${ASSET_HASHES_ID}`) return null;
			return `export default ${JSON.stringify(build())};`;
		},
	};
}

// gltfpack re-parents every skinned mesh onto a fresh unnamed child node and
// leaves the slot name on the parent, so SkinnedMesh.name is '' in a packed
// build while it is 'SKIN_TORS' in dev. Armor visibility, the SKIN_WRAP morph
// and the part-set dedupe all key on that name, so a packed player spawned
// wearing every mesh in the GLB. Push each name back down onto the node that
// actually carries the mesh, restoring dev semantics.
// Post-build gltfpack pass (meshopt EXT_meshopt_compression) over the copied
// public/ models. Sources in public/models stay uncompressed LFS truth; only
// dist output is packed. -kn keeps node/mesh names (armor slots + bone lookups
// key on them), -ke keeps extras. LFS pointer stubs (offline build) are skipped.
//
// -ac and -af 0 are load-bearing, not size knobs. Without -ac gltfpack drops
// every animation track that holds a constant value, which took the 15 rig
// clips from 270 channels down to 54: a bone the previous clip moved then has
// nothing driving it back, so the mixer leaves it where it was and the stance
// snaps — prod only, since dev serves the unpacked GLB. -af 0 turns off the
// 30Hz resample that was lengthening 33 clips by up to a frame.
//
// Compression is -c, NOT -cc. Under -cc the packed rig decodes wrong at
// runtime: measured per-frame world movement of hand_r/hand_l/head roughly
// doubles against the unpacked build while pelvis and spine match exactly, so
// the arms and head jitter. -c measures identical to unpacked and only costs
// ~0.5MB on character-anim.glb. Quantization is not involved — -cc reproduces
// it with -noq, and -c is clean with quantization on.
function gltfpackModels(): Plugin {
	let outDir = '';
	return {
		name: 'gltfpack-models',
		apply: 'build',
		configResolved(config) {
			outDir = path.resolve(config.root, config.build.outDir);
		},
		closeBundle() {
			const cli = createRequire(import.meta.url).resolve(
				'gltfpack/cli.js',
			);
			const glbs: string[] = [];
			const walk = (dir: string) => {
				if (!fs.existsSync(dir)) return;
				for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
					const p = path.join(dir, e.name);
					if (e.isDirectory()) walk(p);
					else if (e.name.endsWith('.glb')) glbs.push(p);
				}
			};
			walk(path.join(outDir, 'models'));
			for (const f of glbs) {
				const head = Buffer.alloc(4);
				const fd = fs.openSync(f, 'r');
				fs.readSync(fd, head, 0, 4, 0);
				fs.closeSync(fd);
				if (head.toString('latin1') !== 'glTF') {
					console.warn(`gltfpack: skipping non-GLB (LFS stub?) ${f}`);
					continue;
				}
				const before = fs.statSync(f).size;
				const wanted = meshNodeNamesInFile(f);
				const wantedClips = animationChannelCountsInFile(f);
				const tmp = `${f}.pack.glb`;
				const run = spawnSync(
					process.execPath,
					[
						cli,
						'-i',
						f,
						'-o',
						tmp,
						'-c',
						'-kn',
						'-ke',
						'-ac',
						'-af',
						'0',
					],
					{ stdio: 'inherit' },
				);
				if (run.status !== 0 || !fs.existsSync(tmp))
					throw new Error(`gltfpack failed on ${f}`);
				fs.renameSync(tmp, f);
				const moved = restoreMeshNamesInFile(f);
				const got = meshNodeNamesInFile(f);
				const missing = [...wanted].filter((n) => !got.has(n));
				if (missing.length)
					throw new Error(
						`gltfpack dropped mesh names in ${path.relative(outDir, f)}: ${missing.join(', ')}`,
					);
				const gotClips = animationChannelCountsInFile(f);
				const thinned = [...wantedClips]
					.filter(([name, n]) => (gotClips.get(name) ?? 0) < n)
					.map(
						([name, n]) =>
							`${name} ${n}->${gotClips.get(name) ?? 0}`,
					);
				if (thinned.length)
					throw new Error(
						`gltfpack dropped animation channels in ${path.relative(outDir, f)}: ${thinned.slice(0, 5).join(', ')}${thinned.length > 5 ? ` (+${thinned.length - 5} more)` : ''}`,
					);
				const after = fs.statSync(f).size;
				console.log(
					`gltfpack: ${path.relative(outDir, f)} ${(before / 1024).toFixed(0)}K -> ${(after / 1024).toFixed(0)}K (${moved} mesh names restored)`,
				);
			}
		},
	};
}

// Cross-origin isolation enables SharedArrayBuffer (worker/GPU shared memory).
// Dev + preview set the headers directly; the built bundle relies on
// coi-serviceworker.js (public/) so the itch upload is isolated on any static host.
const coiHeaders = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
	root: __dirname,
	base: './',
	plugins: [
		react(),
		nxViteTsPaths(),
		iconStudioWriter(),
		assetHashes(),
		gltfpackModels(),
	],
	resolve: {
		alias: [itemdbDataAlias, itemdbSchemaAlias],
	},
	server: {
		port: 4310,
		headers: coiHeaders,
	},
	preview: {
		headers: coiHeaders,
	},
	worker: {
		format: 'es',
		plugins: () => [nxViteTsPaths(), assetHashes()],
	},
	build: {
		outDir: '../../../dist/apps/herbmail/herbmail-game',
		emptyOutDir: true,
	},
	test: {
		globals: true,
		watch: false,
		environment: 'node',
		include: ['src/**/*.{test,spec}.{ts,tsx}', 'tools/**/*.{test,spec}.ts'],
		reporters: ['default'],
		// vitest's node resolver doesn't pick up the @kbve/laser/* tsconfig-path
		// aliases (nxViteTsPaths only wires them for build/dev), so map the subpaths to
		// source here and inline the package for transform.
		alias: [
			{
				find: '@kbve/laser/mecs',
				replacement: path.join(laserSrc, 'mecs.ts'),
			},
			{
				find: '@kbve/laser/ecs',
				replacement: path.join(laserSrc, 'ecs.ts'),
			},
			{
				find: '@kbve/laser/phaser',
				replacement: path.join(laserSrc, 'phaser.ts'),
			},
			{
				find: '@kbve/laser/r3f',
				replacement: path.join(laserSrc, 'r3f.ts'),
			},
			// Must stay last: `find` is a prefix match and first match wins, so
			// the root barrel placed above would swallow the subpaths.
			{
				find: '@kbve/laser',
				replacement: path.join(laserSrc, 'index.ts'),
			},
			itemdbDataAlias,
			itemdbSchemaAlias,
		],
		server: { deps: { inline: [/@kbve\/laser/] } },
	},
});
