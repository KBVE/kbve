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
 *   1024 x 1024 atlas, 16 x 16 grid, 64 x 64 per tile.
 *   Slot 0 is reserved for the procedural fallback tile. Items with a
 *   missing or broken `img:` reference resolve to slot 0 in the UV map.
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
const TILES_PER_ROW = 16;
const ATLAS_SIZE    = TILE_SIZE * TILES_PER_ROW;
const MAX_SLOTS     = TILES_PER_ROW * TILES_PER_ROW;

const FALLBACK_BG    = [0x3a, 0x3a, 0x3a, 0xff];
const FALLBACK_MARK  = [0xff, 0x66, 0xaa, 0xff];

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

	const atlas      = Buffer.alloc(ATLAS_SIZE * ATLAS_SIZE * 4);
	const slotById   = new Map();
	const missingRefs = [];

	placeTile(atlas, buildFallbackTile(), 0);

	let nextSlot = 1;
	for (const r of records) {
		const tile = loadItemTile(r.img);
		if (!tile) {
			slotById.set(r.key, 0);
			missingRefs.push(r.ref);
			continue;
		}
		if (nextSlot >= MAX_SLOTS) {
			console.warn(`[atlas] grid full at slot ${nextSlot}; '${r.ref}' falls back`);
			slotById.set(r.key, 0);
			continue;
		}
		const slot = nextSlot++;
		placeTile(atlas, tile, slot);
		slotById.set(r.key, slot);
	}

	const png = new PNG({ width: ATLAS_SIZE, height: ATLAS_SIZE });
	atlas.copy(png.data);
	const encoded = PNG.sync.write(png, { deflateLevel: 9, deflateStrategy: 3 });
	ensureDir(dirname(ATLAS_OUT));
	writeFileSync(ATLAS_OUT, encoded);
	console.log(`Wrote ${ATLAS_OUT}`);

	let maxId = 0;
	for (const id of slotById.keys()) if (id > maxId) maxId = id;

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
		'        static readonly float4[] _table = BuildTable();',
		'',
		'        public static float4 GetUV(ushort itemId) => itemId < _table.Length ? _table[itemId] : FallbackUV;',
		'',
		'        static float4[] BuildTable()',
		'        {',
		`            var t = new float4[${maxId + 1}];`,
		'            for (int i = 0; i < t.Length; i++) t[i] = FallbackUV;',
	];

	const entries = [...slotById.entries()].sort((a, b) => a[0] - b[0]);
	for (const [id, slot] of entries) {
		if (slot === 0) continue;
		const u = ((slot % TILES_PER_ROW) * norm).toFixed(8);
		const v = (Math.floor(slot / TILES_PER_ROW) * norm).toFixed(8);
		lines.push(`            t[${id}] = new float4(${u}f, ${v}f, ${tileN}f, ${tileN}f);`);
	}

	lines.push('            return t;');
	lines.push('        }');
	lines.push('    }');
	lines.push('}');

	ensureDir(dirname(SOURCE_OUT));
	writeFileSync(SOURCE_OUT, lines.join('\n') + '\n');
	console.log(`Wrote ${SOURCE_OUT}`);

	const validCount = entries.filter(([, slot]) => slot !== 0).length;
	const fallbackCount = entries.length - validCount;
	console.log(`Built atlas: ${validCount} mapped, ${fallbackCount} fallback`);
	if (missingRefs.length > 0 && missingRefs.length <= 20) {
		console.log(`Fallback refs: ${missingRefs.join(', ')}`);
	} else if (missingRefs.length > 20) {
		console.log(`Fallback refs (first 20): ${missingRefs.slice(0, 20).join(', ')} ...`);
	}
}

main();
