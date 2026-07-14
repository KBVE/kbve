/// <reference types='vitest' />
import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

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

// Post-build gltfpack pass (meshopt EXT_meshopt_compression) over the copied
// public/ models. Sources in public/models stay uncompressed LFS truth; only
// dist output is packed. -kn keeps node/mesh names (armor slots + bone lookups
// key on them), -ke keeps extras. LFS pointer stubs (offline build) are skipped.
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
				const tmp = `${f}.pack.glb`;
				const run = spawnSync(
					process.execPath,
					[cli, '-i', f, '-o', tmp, '-cc', '-kn', '-ke'],
					{ stdio: 'inherit' },
				);
				if (run.status !== 0 || !fs.existsSync(tmp))
					throw new Error(`gltfpack failed on ${f}`);
				fs.renameSync(tmp, f);
				const after = fs.statSync(f).size;
				console.log(
					`gltfpack: ${path.relative(outDir, f)} ${(before / 1024).toFixed(0)}K -> ${(after / 1024).toFixed(0)}K`,
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
	plugins: [react(), nxViteTsPaths(), iconStudioWriter(), gltfpackModels()],
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
	},
	build: {
		outDir: '../../../dist/apps/herbmail/herbmail-game',
		emptyOutDir: true,
	},
	test: {
		globals: true,
		watch: false,
		environment: 'node',
		include: ['src/**/*.{test,spec}.{ts,tsx}'],
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
			itemdbDataAlias,
			itemdbSchemaAlias,
		],
		server: { deps: { inline: [/@kbve\/laser/] } },
	},
});
