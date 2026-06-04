#!/usr/bin/env node
/**
 * Generate item sprite atlas + UV map from the MDX source of truth.
 *
 * Inputs:
 *   apps/kbve/astro-kbve/src/content/docs/itemdb/*.mdx       (img per item)
 *   apps/kbve/astro-kbve/public/<img path>                   (referenced PNGs)
 *
 * Outputs:
 *   apps/rareicon/unity-rareicon/Assets/StreamingAssets/itemdb-atlas.png
 *   apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/ECS/DB/Items/Data/ItemSpriteAtlas.Generated.cs
 *
 * Layout:
 *   2048 x 2048 atlas, 32 x 32 grid, 64 x 64 per tile. Max 1024 slots.
 *   Atlas slot index == item key. Items without (or with broken) `img:`
 *   render a placeholder "?" tile at their own key slot so the
 *   key->UV mapping is identity for every consumer. Drop in real art
 *   later by adding `img:` to the MDX -- slot position is stable.
 *
 * Determinism:
 *   Pure JS pngjs encode (no native libvips / sharp). Same byte output
 *   on darwin-arm64 + linux-x64 + windows-x64 so CI regen matches the
 *   committed atlas verbatim and game-ci/unity-builder's dirty check
 *   stays green. See PR replacing the KBVE_ATLAS_REGEN env gate.
 *
 * Usage:
 *   node packages/data/codegen/gen-itemdb-atlas.mjs
 *   npx nx run astro-kbve:sync:itemdb-atlas
 */

import {
	readdirSync,
	readFileSync,
	writeFileSync,
	mkdirSync,
	existsSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

const MDX_DIR     = resolve(repoRoot, 'apps/kbve/astro-kbve/src/content/docs/itemdb');
const ASSET_ROOT  = resolve(repoRoot, 'apps/kbve/astro-kbve/public');
const ATLAS_OUT   = resolve(repoRoot, 'apps/rareicon/unity-rareicon/Assets/StreamingAssets/itemdb-atlas.png');
const SOURCE_OUT  = resolve(repoRoot, 'apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/ECS/DB/Items/Data/ItemSpriteAtlas.Generated.cs');

const TILE_SIZE     = 64;
const TILES_PER_ROW = 32;
const ATLAS_SIZE    = TILE_SIZE * TILES_PER_ROW;
const MAX_SLOTS     = TILES_PER_ROW * TILES_PER_ROW;

const FALLBACK_BG    = [0x3a, 0x3a, 0x3a, 0xff];
const FALLBACK_MARK  = [0xff, 0x66, 0xaa, 0xff];
const PLACEHOLDER_BG = [0x22, 0x24, 0x2a, 0xff];
const PLACEHOLDER_FG = [0xc8, 0xcc, 0xd6, 0xff];

function ensureDir(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }

function loadAllMdx() {
	const files = readdirSync(MDX_DIR)
		.filter((f) => f.endsWith('.mdx') && f !== 'index.mdx')
		.sort();
	const records = [];
	for (const file of files) {
		const { data } = matter(readFileSync(resolve(MDX_DIR, file), 'utf8'));
		if (!data || !data.ref || data.key === undefined) continue;
		if (data.drafted === true) continue;
		records.push(data);
	}
	return records;
}

function buildFallbackTile() {
	const out = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
	for (let y = 0; y < TILE_SIZE; y++) {
		for (let x = 0; x < TILE_SIZE; x++) {
			const i = (y * TILE_SIZE + x) * 4;
			const onDiagDown = x === y;
			const onDiagUp   = x === TILE_SIZE - 1 - y;
			const onBorder   = x === 0 || y === 0 || x === TILE_SIZE - 1 || y === TILE_SIZE - 1;
			const px = (onDiagDown || onDiagUp || onBorder) ? FALLBACK_MARK : FALLBACK_BG;
			out[i]     = px[0];
			out[i + 1] = px[1];
			out[i + 2] = px[2];
			out[i + 3] = px[3];
		}
	}
	return out;
}

// "?" glyph rasterized procedurally over a dark background.
// 64x64 grid; bitmap is a hand-drawn 5x7-ish glyph upscaled by 8x with
// border so the placeholder reads at full inventory-slot zoom.
function buildPlaceholderTile() {
	const out = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
	for (let i = 0; i < TILE_SIZE * TILE_SIZE; i++) {
		const o = i * 4;
		out[o]     = PLACEHOLDER_BG[0];
		out[o + 1] = PLACEHOLDER_BG[1];
		out[o + 2] = PLACEHOLDER_BG[2];
		out[o + 3] = PLACEHOLDER_BG[3];
	}

	const setPx = (x, y) => {
		if (x < 0 || y < 0 || x >= TILE_SIZE || y >= TILE_SIZE) return;
		const o = (y * TILE_SIZE + x) * 4;
		out[o]     = PLACEHOLDER_FG[0];
		out[o + 1] = PLACEHOLDER_FG[1];
		out[o + 2] = PLACEHOLDER_FG[2];
		out[o + 3] = PLACEHOLDER_FG[3];
	};

	// Border 1px
	for (let i = 0; i < TILE_SIZE; i++) {
		setPx(i, 0);
		setPx(i, TILE_SIZE - 1);
		setPx(0, i);
		setPx(TILE_SIZE - 1, i);
	}

	// "?" glyph at 5x7 cells, each cell 6x6 pixels, centered.
	// Row layout (1=fg, 0=bg):
	//   .###.
	//   #...#
	//   ....#
	//   ..##.
	//   ..#..
	//   .....
	//   ..#..
	const Glyph = [
		[0, 1, 1, 1, 0],
		[1, 0, 0, 0, 1],
		[0, 0, 0, 0, 1],
		[0, 0, 1, 1, 0],
		[0, 0, 1, 0, 0],
		[0, 0, 0, 0, 0],
		[0, 0, 1, 0, 0],
	];

	const cell = 7;
	const glyphW = 5 * cell;
	const glyphH = 7 * cell;
	const offX = Math.floor((TILE_SIZE - glyphW) / 2);
	const offY = Math.floor((TILE_SIZE - glyphH) / 2);
	for (let row = 0; row < 7; row++) {
		for (let col = 0; col < 5; col++) {
			if (!Glyph[row][col]) continue;
			for (let yy = 0; yy < cell; yy++) {
				for (let xx = 0; xx < cell; xx++) {
					setPx(offX + col * cell + xx, offY + row * cell + yy);
				}
			}
		}
	}

	return out;
}

function loadItemTile(imgRelPath) {
	if (!imgRelPath || typeof imgRelPath !== 'string') return null;
	const norm = imgRelPath.startsWith('/') ? imgRelPath.slice(1) : imgRelPath;
	const abs  = resolve(ASSET_ROOT, norm);
	if (!existsSync(abs)) return null;
	let png;
	try {
		png = PNG.sync.read(readFileSync(abs));
	} catch (e) {
		console.warn(`[atlas] failed to read ${abs}: ${e.message}`);
		return null;
	}
	const srcW = png.width;
	const srcH = png.height;
	const src  = png.data;
	const scale = Math.min(TILE_SIZE / srcW, TILE_SIZE / srcH);
	const drawW = Math.max(1, Math.round(srcW * scale));
	const drawH = Math.max(1, Math.round(srcH * scale));
	const offX  = Math.floor((TILE_SIZE - drawW) / 2);
	const offY  = Math.floor((TILE_SIZE - drawH) / 2);
	const out = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
	for (let y = 0; y < drawH; y++) {
		const sy = Math.min(srcH - 1, Math.floor((y * srcH) / drawH));
		for (let x = 0; x < drawW; x++) {
			const sx = Math.min(srcW - 1, Math.floor((x * srcW) / drawW));
			const si = (sy * srcW + sx) * 4;
			const di = ((offY + y) * TILE_SIZE + (offX + x)) * 4;
			out[di]     = src[si];
			out[di + 1] = src[si + 1];
			out[di + 2] = src[si + 2];
			out[di + 3] = src[si + 3];
		}
	}
	return out;
}

function placeTile(atlas, tile, slot) {
	const sx = (slot % TILES_PER_ROW) * TILE_SIZE;
	const sy = Math.floor(slot / TILES_PER_ROW) * TILE_SIZE;
	for (let y = 0; y < TILE_SIZE; y++) {
		const srcOff = y * TILE_SIZE * 4;
		const dstOff = ((sy + y) * ATLAS_SIZE + sx) * 4;
		tile.copy(atlas, dstOff, srcOff, srcOff + TILE_SIZE * 4);
	}
}

function main() {
	const records = loadAllMdx();
	console.log(`Loaded ${records.length} items from MDX`);

	const atlas        = Buffer.alloc(ATLAS_SIZE * ATLAS_SIZE * 4);
	const placeholder  = buildPlaceholderTile();
	const placeholders = [];
	const oversized    = [];
	let maxKey         = 0;
	let realCount      = 0;

	for (const r of records) {
		if (r.key === 0) continue;
		if (r.key >= MAX_SLOTS) {
			oversized.push(r.ref);
			continue;
		}
		if (r.key > maxKey) maxKey = r.key;
		const tile = loadItemTile(r.img);
		if (tile) {
			placeTile(atlas, tile, r.key);
			realCount++;
		} else {
			placeTile(atlas, placeholder, r.key);
			placeholders.push(r.ref);
		}
	}

	placeTile(atlas, buildFallbackTile(), 0);

	const png = new PNG({ width: ATLAS_SIZE, height: ATLAS_SIZE });
	atlas.copy(png.data);
	const encoded = PNG.sync.write(png, { deflateLevel: 9, deflateStrategy: 3 });
	ensureDir(dirname(ATLAS_OUT));
	writeFileSync(ATLAS_OUT, encoded);
	console.log(`Wrote ${ATLAS_OUT}`);

	const norm  = 1.0 / TILES_PER_ROW;
	const tileN = norm.toFixed(8);
	const lines = [
		'// <auto-generated/>',
		'// Source: packages/data/codegen/gen-itemdb-atlas.mjs',
		'// Regenerate: npx nx run astro-kbve:sync:itemdb-atlas',
		'',
		'using Unity.Mathematics;',
		'',
		'namespace RareIcon',
		'{',
		'    public static class ItemSpriteAtlas',
		'    {',
		`        public const int   AtlasSize    = ${ATLAS_SIZE};`,
		`        public const int   TileSize     = ${TILE_SIZE};`,
		`        public const int   TilesPerRow  = ${TILES_PER_ROW};`,
		`        public const float TileNormSize = ${tileN}f;`,
		'',
		`        public static readonly float4 FallbackUV = new float4(0f, 0f, ${tileN}f, ${tileN}f);`,
		'',
		`        // Identity mapping: slot index == item key. UV(key) = (key%${TILES_PER_ROW}, key/${TILES_PER_ROW}) * TileNormSize.`,
		'        public static float4 GetUV(ushort itemId)',
		'        {',
		`            if (itemId == 0 || itemId >= ${MAX_SLOTS}) return FallbackUV;`,
		`            int col = itemId % ${TILES_PER_ROW};`,
		`            int row = itemId / ${TILES_PER_ROW};`,
		`            return new float4(col * TileNormSize, row * TileNormSize, TileNormSize, TileNormSize);`,
		'        }',
		'    }',
		'}',
	];

	ensureDir(dirname(SOURCE_OUT));
	writeFileSync(SOURCE_OUT, lines.join('\n') + '\n');
	console.log(`Wrote ${SOURCE_OUT}`);

	console.log(`Built atlas: ${realCount} real tiles, ${placeholders.length} placeholders, max key ${maxKey}`);
	if (placeholders.length > 0 && placeholders.length <= 20) {
		console.log(`Placeholder refs: ${placeholders.join(', ')}`);
	} else if (placeholders.length > 20) {
		console.log(`Placeholder refs (first 20): ${placeholders.slice(0, 20).join(', ')} ... (+${placeholders.length - 20} more)`);
	}
	if (oversized.length > 0) {
		console.warn(`[atlas] ${oversized.length} item(s) skipped -- key >= ${MAX_SLOTS}: ${oversized.join(', ')}`);
	}
}

main();
