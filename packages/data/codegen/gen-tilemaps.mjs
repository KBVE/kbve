/**
 * gen-tilemaps — convert authored Tiled maps into mapdb GridTilemap JSON
 * (proto-canonical shape, see packages/data/proto/map/mapdb.proto). The
 * GridTilemap is the lean source of truth: a collision bitset + render
 * layers + spawn/regions, consumed by simgrid (server walkability) and the
 * game client (render + client-side prediction). No Tiled parsing downstream.
 *
 * Run: node packages/data/codegen/gen-tilemaps.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');

const GID_FLAGS_MASK = 0x1fffffff;

// Maps to convert + their authored metadata (spawn/regions live here until
// the maps are authored natively as GridTilemaps).
const MAPS = [
	{
		ref: 'cloud-city',
		name: 'Cloud City',
		src: 'packages/data/codegen/maps/cloud_city_large.json',
		spawn: { x: 5, y: 12 },
		// Prop collision — tiles occupied by overlay sprites (casino table) that
		// have no ge_collide tile beneath them. Kept in sync with the sprite
		// footprint placed in CloudCityScene.
		blockedTiles: [
			{ x: 6, y: 8 },
			{ x: 7, y: 8 },
			{ x: 6, y: 9 },
			{ x: 7, y: 9 },
		],
		regions: [
			{ name: 'Cloud City Plaza', x: 0, y: 4, w: 17, h: 17 },
			{ name: 'Goblin Camp', x: 17, y: 17, w: 15, h: 15 },
			{ name: 'Crystal Cavern', x: 26, y: 22, w: 17, h: 17 },
		],
		outputs: [
			'apps/cryptothrone/astro-cryptothrone/public/assets/map/cloud_city.tilemap.json',
			'apps/agones/cryptothrone/server/assets/cloud_city.tilemap.json',
		],
	},
];

function convert(map) {
	const tiled = JSON.parse(readFileSync(resolve(repo, map.src), 'utf8'));
	const { width, height } = tiled;
	const tileset = tiled.tilesets[0];

	// Collision gids — tiles flagged ge_collide.
	const collide = new Set();
	for (const t of tileset.tiles ?? []) {
		if ((t.properties ?? []).some((p) => p.name === 'ge_collide' && p.value))
			collide.add(tileset.firstgid + t.id);
	}

	const blocked = new Array(width * height).fill(false);
	const layers = [];
	for (const layer of tiled.layers) {
		if (layer.type !== 'tilelayer') continue;
		const data = [];
		for (let i = 0; i < layer.data.length; i++) {
			const gid = layer.data[i] & GID_FLAGS_MASK;
			data.push(gid);
			if (gid !== 0 && collide.has(gid)) blocked[i] = true;
		}
		layers.push({ name: layer.name, data });
	}

	for (const { x, y } of map.blockedTiles ?? []) {
		if (x >= 0 && x < width && y >= 0 && y < height) blocked[y * width + x] = true;
	}

	return {
		ref: map.ref,
		name: map.name,
		width,
		height,
		tileSize: tiled.tilewidth,
		spawn: map.spawn,
		blocked,
		layers,
		regions: map.regions,
		tilesetImage: tileset.image,
		tilesetColumns: tileset.columns,
		generation: 'GENERATION_STATIC_AUTHORED',
		drafted: false,
	};
}

for (const map of MAPS) {
	const out = convert(map);
	const json = JSON.stringify(out);
	const blockedCount = out.blocked.filter(Boolean).length;
	for (const dst of map.outputs) {
		const path = resolve(repo, dst);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, json + '\n');
		console.log(`Wrote ${dst} (${out.width}x${out.height}, ${blockedCount} blocked, ${out.layers.length} layers)`);
	}
}
