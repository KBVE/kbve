/**
 * tiledb data codegen.
 *
 * Reads the tiledb astro collection (one MDX per tile — the authoritative
 * catalog) and emits a flat tiledb-data.json consumed by the palette packer
 * (gen-palette-atlas.mjs) and any client/tooling. MDX is the source of truth;
 * gen-tile-slices.mjs scaffolds entries, humans edit them.
 *
 *   node packages/data/codegen/gen-tiledb-data.mjs
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const tiledbDir = resolve(
	repoRoot,
	'apps/kbve/astro-kbve/src/content/docs/tiledb',
);
const outFile = resolve(__dirname, 'generated/tiledb-data.json');

const files = readdirSync(tiledbDir).filter(
	(f) => f.endsWith('.mdx') && f !== 'index.mdx',
);

const tiles = files
	.map((f) => {
		const { data } = matter(readFileSync(resolve(tiledbDir, f), 'utf8'));
		return {
			id: data.id ?? data.ref,
			ref: data.ref,
			name: data.name,
			role: data.role,
			image: data.image,
			tileSize: data.tile_size,
			frameCount: data.frame_count ?? 1,
			collides: data.collides ?? false,
			biomes: data.biomes ?? [],
			tags: data.tags ?? [],
			animation: data.animation ?? null,
		};
	})
	.sort((a, b) => a.ref.localeCompare(b.ref));

writeFileSync(outFile, `${JSON.stringify(tiles, null, '\t')}\n`);
console.log(`Wrote ${tiles.length} tiles -> ${outFile}`);
