import { Scene } from 'phaser';
import {
	townTilemap,
	dungeonTilemap,
	CITY_PALETTE,
	DUNGEON_PALETTE,
	type TilePalette,
} from '../data/dungeon';

type ZoneKind = 'town' | 'dungeon';

/**
 * Standalone live render of a seed-deterministic procedural zone, driven end to
 * end by the tile pipeline: generator role grid -> packed per-biome atlas +
 * TilePalette (gen-palette-atlas) -> Phaser tilemap. Animated tiles cycle from
 * the palette's `animations`; layer collision comes from the palette's per-gid
 * `collision`. Reachable via `?zone=town|dungeon&seed=N`; no server, no netcode
 * — proves the catalog/palette renders in the real client.
 */
export class ProceduralZoneScene extends Scene {
	private zone: ZoneKind = 'town';
	private seed = 2024;
	private layer?: Phaser.Tilemaps.TilemapLayer;

	constructor() {
		super('ProceduralZone');
	}

	init(data: { zone?: ZoneKind; seed?: number }) {
		if (data.zone === 'town' || data.zone === 'dungeon')
			this.zone = data.zone;
		if (Number.isFinite(data.seed)) this.seed = Number(data.seed);
	}

	preload() {
		this.load.spritesheet(
			'city-atlas',
			'/assets/map/palettes/cloud-city.atlas.png',
			{ frameWidth: 16, frameHeight: 16 },
		);
		this.load.spritesheet(
			'dungeon-atlas',
			'/assets/map/palettes/dungeon.atlas.png',
			{ frameWidth: 16, frameHeight: 16 },
		);
	}

	create() {
		const isDungeon = this.zone === 'dungeon';
		const tm = isDungeon
			? dungeonTilemap(this.seed)
			: townTilemap(this.seed);
		const palette: TilePalette = isDungeon ? DUNGEON_PALETTE : CITY_PALETTE;
		const atlasKey = isDungeon ? 'dungeon-atlas' : 'city-atlas';

		// Flat gid layer -> 2D index grid (Phaser tile index = gid - 1).
		const flat = tm.layers[0].data;
		const grid: number[][] = [];
		for (let y = 0; y < tm.height; y++) {
			const row: number[] = [];
			for (let x = 0; x < tm.width; x++)
				row.push(flat[y * tm.width + x] - 1);
			grid.push(row);
		}

		const map = this.make.tilemap({
			data: grid,
			tileWidth: tm.tileSize,
			tileHeight: tm.tileSize,
		});
		const tileset = map.addTilesetImage(atlasKey);
		this.layer =
			(tileset
				? (map.createLayer(
						0,
						tileset,
						0,
						0,
					) as Phaser.Tilemaps.TilemapLayer | null)
				: null) ?? undefined;

		if (this.layer && palette.collision) {
			const blocking = Object.entries(palette.collision)
				.filter(([, blocks]) => blocks)
				.map(([gid]) => Number(gid) - 1);
			this.layer.setCollision(blocking);
		}

		this.startTileAnimations(palette);

		this.cameras.main.setBounds(
			0,
			0,
			tm.width * tm.tileSize,
			tm.height * tm.tileSize,
		);
		this.cameras.main.centerOn(
			tm.spawn.x * tm.tileSize,
			tm.spawn.y * tm.tileSize,
		);
		this.enablePanZoom();

		this.add
			.text(8, 8, `${tm.name} — seed ${this.seed}`, {
				font: '12px monospace',
				color: '#ffffff',
				backgroundColor: '#000000a0',
				padding: { x: 6, y: 4 },
			})
			.setScrollFactor(0)
			.setDepth(1000);
	}

	/** Cycle each animated palette tile's index over its frame list. */
	private startTileAnimations(palette: TilePalette) {
		if (!palette.animations) return;
		for (const anim of Object.values(palette.animations)) {
			const indices = anim.frames.map((g) => g - 1);
			if (indices.length < 2) continue;
			const period = (anim.frameDurations?.[0] ?? 0.5) * 1000;
			let frame = 0;
			this.time.addEvent({
				delay: period,
				loop: anim.loop ?? true,
				callback: () => {
					const from = indices[frame];
					frame = (frame + 1) % indices.length;
					this.layer?.replaceByIndex(from, indices[frame]);
					void from;
				},
			});
		}
	}

	private enablePanZoom() {
		const cam = this.cameras.main;
		this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
			if (!p.isDown) return;
			cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
			cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
		});
		this.input.on(
			'wheel',
			(_p: unknown, _o: unknown, _dx: number, dy: number) => {
				cam.zoom = Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.5, 4);
			},
		);
	}
}
