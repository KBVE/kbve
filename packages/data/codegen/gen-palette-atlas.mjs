/**
 * Tile-palette atlas packer.
 *
 * Reads tagged tile manifests (codegen/palettes/<ref>.json) — each declares,
 * per biome, which source tiles fill each semantic TileRole. Slices those
 * tiles out of the source tileset, packs them into a compact per-biome atlas
 * (only the tiles that biome uses), and emits a TilePalette JSON mapping each
 * TileRole -> dense gid in the packed atlas.
 *
 * Bootstrap source is a slice of the monolithic cloud_tileset; later the
 * manifest can point each role at individual tile PNGs without changing the
 * output contract (packed atlas + palette JSON keyed by TileRole number).
 *
 *   node packages/data/codegen/gen-palette-atlas.mjs
 */

import sharp from 'sharp';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const manifestDir = resolve(__dirname, 'palettes');
// Packed atlas PNG -> public (Phaser loads it by URL at runtime).
const atlasDir = resolve(
	repoRoot,
	'apps/cryptothrone/astro-cryptothrone/public/assets/map/palettes',
);
// Palette JSON -> src (imported by the generators + tests at build time).
const paletteDir = resolve(
	repoRoot,
	'apps/cryptothrone/astro-cryptothrone/src/components/game/data/palettes',
);

// TileRole enum — must match packages/data/proto/map/mapdb.proto.
const ROLE = {
	UNSPECIFIED: 0,
	GROUND: 1,
	PLAZA: 2,
	ROAD: 3,
	GRASS: 4,
	WALL: 5,
	ROOF: 6,
	DOOR: 7,
	WATER: 8,
	PROP: 9,
	PROP_SOLID: 10,
	VOID: 11,
};

async function pack(manifest) {
	const tile = manifest.tileSize;
	const srcCols = manifest.source.columns;
	const srcPath = resolve(repoRoot, manifest.source.image);

	// Unique source gids across all roles, sorted -> stable dense assignment.
	const sourceGids = [
		...new Set(Object.values(manifest.roles).flat()),
	].sort((a, b) => a - b);
	const denseOf = new Map(sourceGids.map((g, i) => [g, i + 1])); // 1-based

	const cols = manifest.columns;
	const n = sourceGids.length;
	const rows = Math.max(1, Math.ceil(n / cols));
	const W = cols * tile;
	const H = rows * tile;

	const { data: src, info } = await sharp(srcPath)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const sW = info.width;
	const ch = 4;
	const out = Buffer.alloc(W * H * ch, 0);

	sourceGids.forEach((gid, idx) => {
		const sid = gid - 1;
		const sx = (sid % srcCols) * tile;
		const sy = Math.floor(sid / srcCols) * tile;
		const dx = (idx % cols) * tile;
		const dy = Math.floor(idx / cols) * tile;
		for (let y = 0; y < tile; y++) {
			for (let x = 0; x < tile; x++) {
				const si = ((sy + y) * sW + (sx + x)) * ch;
				const di = ((dy + y) * W + (dx + x)) * ch;
				out[di] = src[si];
				out[di + 1] = src[si + 1];
				out[di + 2] = src[si + 2];
				out[di + 3] = src[si + 3];
			}
		}
	});

	const atlasName = `${manifest.ref}.atlas.png`;
	await sharp(out, { raw: { width: W, height: H, channels: ch } })
		.png()
		.toFile(resolve(atlasDir, atlasName));

	const entries = {};
	for (const [roleName, gids] of Object.entries(manifest.roles)) {
		const num = ROLE[roleName];
		if (num === undefined) throw new Error(`unknown TileRole "${roleName}"`);
		entries[num] = gids.map((g) => denseOf.get(g));
	}

	const palette = {
		ref: manifest.ref,
		name: manifest.name,
		biome: manifest.biome,
		tileSize: tile,
		tilesetImage: `palettes/${atlasName}`,
		tilesetColumns: cols,
		tileCount: n,
		entries,
	};
	writeFileSync(
		resolve(paletteDir, `${manifest.ref}.palette.json`),
		`${JSON.stringify(palette, null, '\t')}\n`,
	);
	console.log(
		`  ✓ ${manifest.ref}: ${n} tiles -> ${atlasName} (${W}x${H}) + ${manifest.ref}.palette.json`,
	);
}

mkdirSync(atlasDir, { recursive: true });
mkdirSync(paletteDir, { recursive: true });
const manifests = readdirSync(manifestDir).filter((f) => f.endsWith('.json'));
console.log(`Packing ${manifests.length} palette(s)...`);
for (const f of manifests) {
	const manifest = JSON.parse(readFileSync(resolve(manifestDir, f), 'utf8'));
	await pack(manifest);
}
