/**
 * Tile slicer + tiledb MDX scaffolder.
 *
 * Reads tiles.manifest.json (bootstrap: each tile's source gid(s) in the
 * monolithic tileset) and:
 *   1. slices each tile into its own sprite PNG (a horizontal frame strip when
 *      it has >1 gid) under public/assets/map/tiles/<ref>.png
 *   2. scaffolds a tiledb MDX entry per tile (only if absent — MDX is the
 *      editable source of truth once it exists)
 *
 * The monolithic-tileset source is the bootstrap; the contract (per-tile PNG +
 * tiledb MDX) is unchanged when tiles become hand-drawn individual sprites.
 *
 *   node packages/data/codegen/gen-tile-slices.mjs
 */

import sharp from 'sharp';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const manifest = JSON.parse(
	readFileSync(resolve(__dirname, 'tiles/tiles.manifest.json'), 'utf8'),
);

// Catalog lives in astro-kbve (kbve.com data site), alongside mapdb/itemdb.
const app = 'apps/kbve/astro-kbve';
const tileImgDir = resolve(repoRoot, app, 'public/assets/tiledb');
const mdxDir = resolve(repoRoot, app, 'src/content/docs/tiledb');

const tile = manifest.source.tileSize;
const srcCols = manifest.source.columns;
const srcPath = resolve(repoRoot, manifest.source.image);

function quoteArr(a) {
	return `[${a.map((s) => `"${s}"`).join(', ')}]`;
}

function frontmatter(t, frames) {
	const lines = [
		'---',
		`id: "${t.ref}"`,
		`ref: "${t.ref}"`,
		`name: "${t.name}"`,
		`title: "${t.name}"`,
		`description: "${t.role} tile (${t.biomes.join('/')})"`,
		`role: "${t.role}"`,
		`image: "/assets/tiledb/${t.ref}.png"`,
		`tile_size: ${tile}`,
		`frame_count: ${frames}`,
		`collides: ${t.collides}`,
		`biomes: ${quoteArr(t.biomes)}`,
	];
	if (t.tags?.length) lines.push(`tags: ${quoteArr(t.tags)}`);
	if (frames > 1) {
		const durs = t.frameDurations ?? Array(frames).fill(0.5);
		lines.push('animation:');
		lines.push('  hasAnimation: true');
		lines.push(`  spriteSheetPath: "/assets/tiledb/${t.ref}.png"`);
		lines.push(`  frameDurations: [${durs.join(', ')}]`);
		lines.push('  loop: true');
	}
	lines.push('---');
	lines.push('');
	lines.push(`import { Adsense } from '@/components/astropad';`);
	lines.push('');
	lines.push(`# ${t.name}`);
	lines.push('');
	lines.push(
		`Catalogued \`${t.role}\` tile, sliced from the cloud tileset. Valid in: ${t.biomes.join(', ')}.`,
	);
	lines.push('');
	lines.push('<Adsense />');
	lines.push('');
	return `${lines.join('\n')}\n`;
}

async function sliceTile(src, sW, t) {
	const gids = t.gids;
	const W = gids.length * tile;
	const ch = 4;
	const out = Buffer.alloc(W * tile * ch, 0);
	gids.forEach((gid, f) => {
		const sid = gid - 1;
		const sx = (sid % srcCols) * tile;
		const sy = Math.floor(sid / srcCols) * tile;
		for (let y = 0; y < tile; y++) {
			for (let x = 0; x < tile; x++) {
				const si = ((sy + y) * sW + (sx + x)) * ch;
				const di = (y * W + (f * tile + x)) * ch;
				out[di] = src[si];
				out[di + 1] = src[si + 1];
				out[di + 2] = src[si + 2];
				out[di + 3] = src[si + 3];
			}
		}
	});
	await sharp(out, { raw: { width: W, height: tile, channels: ch } })
		.png()
		.toFile(resolve(tileImgDir, `${t.ref}.png`));
	return gids.length;
}

mkdirSync(tileImgDir, { recursive: true });
mkdirSync(mdxDir, { recursive: true });

const { data: src, info } = await sharp(srcPath)
	.ensureAlpha()
	.raw()
	.toBuffer({ resolveWithObject: true });

let sliced = 0;
let scaffolded = 0;
for (const t of manifest.tiles) {
	const frames = await sliceTile(src, info.width, t);
	sliced++;
	const mdxPath = resolve(mdxDir, `${t.ref}.mdx`);
	if (!existsSync(mdxPath)) {
		writeFileSync(mdxPath, frontmatter(t, frames));
		scaffolded++;
	}
}
console.log(
	`Sliced ${sliced} tile sprite(s) -> tiles/, scaffolded ${scaffolded} new MDX entr(ies).`,
);
