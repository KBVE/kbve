/**
 * Zone registry — the data-driven map manifest behind WorldScene (#12360 C8).
 *
 * Each zone names its tilemap + tileset assets (so the Preloader and scene load
 * by key, not hardcoded strings) plus its realm chat channel/game. Adding a
 * zone is a data edit here; the scene loads any of them by `zoneKey`. The
 * authoritative collision still comes from the GridTilemap JSON each zone
 * points at (shared with simgrid).
 */

export interface ZoneDef {
	/** Stable zone identifier (scene init key). */
	key: string;
	name: string;
	/** Phaser cache key for the GridTilemap JSON. */
	tilemapKey: string;
	/** Served asset path for the GridTilemap JSON. */
	tilemapUrl: string;
	/** Phaser texture key for the tileset image. */
	tilesetKey: string;
	/** Served asset path for the tileset image. */
	tilesetUrl: string;
	/** Name passed to Phaser `addTilesetImage`. */
	tilesetName: string;
	/** Realm chat channel for this zone. */
	channel: string;
	/** Realm chat game key. */
	game: string;
}

export const ZONES = {
	'cloud-city': {
		key: 'cloud-city',
		name: 'Cloud City',
		tilemapKey: 'cloud-city-tilemap',
		tilemapUrl: '/assets/map/cloud_city.tilemap.json',
		tilesetKey: 'cloud-city-tiles',
		tilesetUrl: '/assets/map/cloud_tileset.png',
		tilesetName: 'cloud_tileset',
		channel: '#cryptothrone',
		game: 'cryptothrone',
	},
} satisfies Record<string, ZoneDef>;

export type ZoneKey = keyof typeof ZONES;

export const DEFAULT_ZONE: ZoneKey = 'cloud-city';

export function getZone(key?: string): ZoneDef {
	return ZONES[(key as ZoneKey) ?? DEFAULT_ZONE] ?? ZONES[DEFAULT_ZONE];
}
