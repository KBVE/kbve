/**
 * Tile-palette atlas packer.
 *
 * Sources tiles from the tiledb catalog (gen-tiledb-data.mjs -> tiledb-data.json)
 * by ref. Each palette manifest (codegen/palettes/<ref>.json) lists, per biome,
 * which catalogued tiles fill each TileRole. The packer blits every tile's
 * sprite (a multi-frame strip when animated) into a compact per-biome atlas and
 * emits a TilePalette JSON: role -> dense gid, plus per-gid animation + collision
 * carried through from the catalog. Presentation only — collision authority
 * still lives in the role grid; the per-gid collision map is a render-side hint.
 *
 *   node packages/data/codegen/gen-palette-atlas.mjs
 */

import sharp from 'sharp';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const app = 'apps/cryptothrone/astro-cryptothrone';
const manifestDir = resolve(__dirname, 'palettes');
const atlasDir = resolve(repoRoot, app, 'public/assets/map/palettes');
const paletteDir = resolve(repoRoot, app, 'src/components/game/data/palettes');
// Per-tile sprites are catalog assets served by astro-kbve; image paths in
// tiledb are site-absolute ("/assets/tiledb/<ref>.png").
const tileAssetRoot = resolve(repoRoot, 'apps/kbve/astro-kbve/public');

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

const catalog = new Map(
	JSON.parse(
		readFileSync(resolve(__dirname, 'generated/tiledb-data.json'), 'utf8'),
	).map((t) => [t.ref, t]),
);

async function rawTile(image) {
	return sharp(resolve(tileAssetRoot, image.replace(/^\//, '')))
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
}

async function pack(manifest) {
	const tile = manifest.tileSize;
	const cols = manifest.columns;
	const ch = 4;

	// Unique tile refs across roles, sorted -> stable dense gid assignment.
	const refs = [...new Set(Object.values(manifest.roles).flat())].sort();
	const tiles = refs.map((ref) => {
		const t = catalog.get(ref);
		if (!t) throw new Error(`palette "${manifest.ref}" references unknown tile "${ref}"`);
		return t;
	});

	// Each tile occupies frameCount consecutive cells; gid = its first frame.
	const firstGid = new Map();
	let cells = 0;
	for (const t of tiles) {
		firstGid.set(t.ref, cells + 1); // 1-based
		cells += Math.max(1, t.frameCount);
	}

	const rows = Math.max(1, Math.ceil(cells / cols));
	const W = cols * tile;
	const H = rows * tile;
	const out = Buffer.alloc(W * H * ch, 0);

	for (const t of tiles) {
		const { data: src, info } = await rawTile(t.image);
		const frames = Math.max(1, t.frameCount);
		const base = firstGid.get(t.ref) - 1;
		for (let f = 0; f < frames; f++) {
			const cell = base + f;
			const dx = (cell % cols) * tile;
			const dy = Math.floor(cell / cols) * tile;
			for (let y = 0; y < tile; y++) {
				for (let x = 0; x < tile; x++) {
					const si = (y * info.width + (f * tile + x)) * ch;
					const di = ((dy + y) * W + (dx + x)) * ch;
					out[di] = src[si];
					out[di + 1] = src[si + 1];
					out[di + 2] = src[si + 2];
					out[di + 3] = src[si + 3];
				}
			}
		}
	}

	const atlasName = `${manifest.ref}.atlas.png`;
	await sharp(out, { raw: { width: W, height: H, channels: ch } })
		.png()
		.toFile(resolve(atlasDir, atlasName));

	const entries = {};
	for (const [roleName, roleRefs] of Object.entries(manifest.roles)) {
		const num = ROLE[roleName];
		if (num === undefined) throw new Error(`unknown TileRole "${roleName}"`);
		entries[num] = roleRefs.map((r) => firstGid.get(r));
	}

	const animations = {};
	const collision = {};
	for (const t of tiles) {
		const g = firstGid.get(t.ref);
		collision[g] = t.collides;
		if (t.frameCount > 1) {
			animations[g] = {
				frames: Array.from({ length: t.frameCount }, (_, i) => g + i),
				frameDurations: t.animation?.frameDurations,
				loop: t.animation?.loop ?? true,
			};
		}
	}

	const palette = {
		ref: manifest.ref,
		name: manifest.name,
		biome: manifest.biome,
		tileSize: tile,
		tilesetImage: `palettes/${atlasName}`,
		tilesetColumns: cols,
		tileCount: cells,
		entries,
		animations,
		collision,
	};
	writeFileSync(
		resolve(paletteDir, `${manifest.ref}.palette.json`),
		`${JSON.stringify(palette, null, '\t')}\n`,
	);
	console.log(
		`  ✓ ${manifest.ref}: ${refs.length} tiles / ${cells} cells -> ${atlasName} (${W}x${H}); ${Object.keys(animations).length} animated`,
	);
}

mkdirSync(atlasDir, { recursive: true });
mkdirSync(paletteDir, { recursive: true });
const manifests = readdirSync(manifestDir).filter((f) => f.endsWith('.json'));
console.log(`Packing ${manifests.length} palette(s) from ${catalog.size} catalogued tiles...`);
for (const f of manifests) {
	await pack(JSON.parse(readFileSync(resolve(manifestDir, f), 'utf8')));
}
