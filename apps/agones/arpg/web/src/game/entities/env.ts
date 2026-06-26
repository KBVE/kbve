import Phaser from 'phaser';
import { arpgAsset } from '../config';
import { SHIP_FOOTPRINTS, SHIP_HULLS } from './shipFootprint.generated';

/**
 * A static environment prop (campfire, …). Unlike player classes these have no
 * 16-angle rig — a single spritesheet looped as an idle animation, anchored on
 * its tile. Keyed by the kind registry `ref` the server sends in the Welcome
 * registry (category KIND_CAT_ENV).
 */
/** Optional warm point-light a prop casts (campfire glow). Pure cosmetic. */
export interface EnvLight {
	color: number;
	/** Glow radius in px (~32 = one tile). */
	radius: number;
	/** Base alpha of the glow at full flicker. */
	intensity: number;
}

export interface EnvDef {
	ref: string;
	sheet: string;
	frameWidth: number;
	frameHeight: number;
	/** Animation frames PER direction (one row of the sheet). */
	frames: number;
	frameRate: number;
	displayWidth: number;
	displayHeight: number;
	originY: number;
	/**
	 * Number of facing rows packed in the sheet (row-major: row = facing, col =
	 * anim frame). Defaults to 1 (campfire — no rotation). A rotatable prop
	 * (candelabrum, 4) is placed with `R` and renders the row its `sub` byte names.
	 */
	directions?: number;
	light?: EnvLight;
}

export const CAMPFIRE_ENV: EnvDef = {
	ref: 'campfire',
	sheet: '/assets/arcade/arpg/environment/hazards/campfire/campfire-Sheet.png',
	frameWidth: 36,
	frameHeight: 48,
	frames: 6,
	frameRate: 8,
	displayWidth: 40,
	displayHeight: 54,
	originY: 0.9,
	light: { color: 0xff9a3c, radius: 96, intensity: 0.5 },
};

// Candelabrum Stand — a ROTATABLE mana-font prop. Sheet is 4 facing rows x 3
// flame-flicker frames of 64x96; `sub` (0..3) picks the row. Warm candle glow.
export const CANDELABRUM_ENV: EnvDef = {
	ref: 'candelabrum',
	sheet: '/assets/arcade/arpg/environment/lightsources/candelabrum-stand/Anim_Infernus_Lightsources_1.png',
	frameWidth: 64,
	frameHeight: 96,
	frames: 3,
	frameRate: 6,
	displayWidth: 56,
	displayHeight: 84,
	originY: 0.86,
	directions: 4,
	light: { color: 0xffc46b, radius: 80, intensity: 0.42 },
};

// Stone shrine — a static landmark structure near spawn. One 128x128 frame, no
// rotation, no animation (frames:1). Display larger than a tile so it reads as a
// proper structure; it still blocks only its single base tile server-side.
export const SHRINE_ENV: EnvDef = {
	ref: 'shrine',
	sheet: '/assets/arcade/arpg/environment/structures/shrine/shrine.png',
	frameWidth: 128,
	frameHeight: 128,
	frames: 1,
	frameRate: 1,
	displayWidth: 104,
	displayHeight: 104,
	originY: 0.84,
};

// Parked starfighter — a rotatable landmark vehicle resting flat on the surface.
// 4x4 sheet of 512x512 frames baked by `kbve-model-sprites` (idolknight
// skin, hull laid flat, iso 30deg, 45deg yaw offset) so it reads as grounded, not
// a standing billboard. 16 facings, one static frame each (frames:1, directions:16,
// row-major: frame index = facing). The placed instance defaults to facing 0 —
// frame_00, the 45deg parked pose. Anchored near center since it lies flat. Blocks
// only its base tile server-side.
//
// Powered-DOWN variant: `ship.png` is baked from the `idolknight_off` skin (green
// engine glow killed by `kbve-skin-variant`) so the parked ship reads as
// OFF. The glowing twin sits beside it as `ship_on.png` — swap `sheet` to it for a
// future hover/flight (engines-on) mode (same frame layout, drop-in).
//
// Pilot flow assets (all 16-facing, baked by gen-model-sprites.py; staged, NOT
// registered yet — would preload several MB unused until the pilot state machine):
//   ship.png       off / parked     (static, engines dark)
//   ship_on.png    powered on        (static, engines lit, grounded)
//   ship_lift.png  takeoff           (8 frames x 16 dir; --anim-mode lift, plays ONCE)
//   ship_idle.png  hover idle        (8 frames x 16 dir; --anim-mode idle, seamless LOOP)
//   ship_move.png  flying            (8 frames x 16 dir; --anim-mode move, bob + bank sway, LOOP)
//   ship_bank.png  turn lean         (8 frames x 16 dir; --anim-mode bank, MONOTONIC roll
//                                      L->R: index turn-rate -> frame to HOLD a lean, no loop)
//   ship_leaving_atmosphere.png   ascent to space  (16 frames x 1 dir; --anim-mode launch, ONCE)
//   ship_entering_atmosphere.png  descent from space (same 16 frames REVERSED)
// Cycles shadow-catcher stays on the floor as the hull rises, so lift/idle/move/bank
// bake the real hover gap per frame. Looping sheets are frames:8, directions:16
// (row-major dir*8+f); atmosphere sheets are frames:16, directions:1, play once.
// Reverse-playback reuse: LANDING = ship_lift backward, POWER-DOWN = ship_on -> ship,
// ENTERING = leaving reversed — so no descent/shutdown/re-entry art is needed.
//
// Flow. Iso (this 2D renderer):
//   Enter: ship -> ship_on -> ship_lift(fwd) -> ship_idle(loop).
//   Drive: ship_idle (stationary) <-> ship_move (translating) ; turn -> ship_bank frame by turn-rate.
//   Exit:  ship_idle -> ship_lift(rev) -> ship_on -> ship -> return player.
// Leaving atmosphere hands off to a SEPARATE 3D Star Fox-style space mode (loads the
// real fighter1.fbx/obj): ship_idle -> ship_leaving_atmosphere -> [3D space game] ->
// ship_entering_atmosphere -> ship_idle. The 2D sprites here cover only the iso view.
export const SHIP_ENV: EnvDef = {
	ref: 'ship',
	sheet: '/assets/arcade/arpg/environment/structures/ship/ship.png',
	frameWidth: 512,
	frameHeight: 512,
	frames: 1,
	frameRate: 1,
	displayWidth: 384,
	displayHeight: 384,
	originY: 0.52,
	directions: 16,
};

export const SHIP_REF = SHIP_ENV.ref;

/**
 * Tiles the ship occupies, centered on (bx,by) for `facing` (its sub byte, 0..15).
 * Per-facing offsets are baked from the actual sprite-hull alpha — an elongated hull
 * that rotates through 16 facings can't be matched by one symmetric radius, so each
 * frame gets its own tile set (kbve-ship-footprint → SHIP_FOOTPRINTS).
 * MUST mirror the server's `ship_footprint()` (game.rs), which reads the identical
 * generated table, so client prediction blocks the exact tiles the server does.
 */
export function shipFootprint(
	bx: number,
	by: number,
	facing: number,
): Array<[number, number]> {
	const f = ((Math.trunc(facing) % 16) + 16) % 16;
	return SHIP_FOOTPRINTS[f].map(
		([dx, dy]) => [bx + dx, by + dy] as [number, number],
	);
}

/** The ship's convex hull polygon for `facing`, in world tiles (centered on base). */
export function shipHull(
	bx: number,
	by: number,
	facing: number,
): Array<[number, number]> {
	const f = ((Math.trunc(facing) % 16) + 16) % 16;
	return SHIP_HULLS[f].map(([x, y]) => [bx + x, by + y] as [number, number]);
}

/**
 * Push a circle (px,py,r) out of the ship's convex hull polygon at `facing`, centered
 * on base (bx,by). Returns the corrected position + world surface normal (to cancel
 * inward velocity), or null if already clear. The hull is baked CCW (interior-left,
 * outward = right-of-edge) by gen-ship-footprint.py. BYTE-FOR-BYTE mirror of the server
 * `resolve_circle_poly` (game.rs) so prediction and the sim push to the same spot —
 * this is the real ship collision (the tile footprint is only coarse NPC blocking).
 */
export function resolveShipHull(
	px: number,
	py: number,
	r: number,
	bx: number,
	by: number,
	facing: number,
): { x: number; y: number; nx: number; ny: number } | null {
	const verts = shipHull(bx, by, facing);
	const n = verts.length;
	if (n < 3) return null;
	let inside = true;
	let bestD2 = Infinity;
	let cx = 0;
	let cy = 0;
	let enx = 0; // nearest edge's outward normal
	let eny = 0;
	for (let i = 0; i < n; i++) {
		const ax = verts[i][0];
		const ay = verts[i][1];
		const ex = verts[(i + 1) % n][0] - ax;
		const ey = verts[(i + 1) % n][1] - ay;
		const len2 = ex * ex + ey * ey || 1e-9;
		let t = ((px - ax) * ex + (py - ay) * ey) / len2;
		t = t < 0 ? 0 : t > 1 ? 1 : t;
		const qx = ax + t * ex;
		const qy = ay + t * ey;
		const ddx = px - qx;
		const ddy = py - qy;
		const d2 = ddx * ddx + ddy * ddy;
		// Interior is left of each directed edge (CCW). Right of any → outside.
		if (ex * (py - ay) - ey * (px - ax) < 0) inside = false;
		if (d2 < bestD2) {
			bestD2 = d2;
			cx = qx;
			cy = qy;
			const el = Math.sqrt(len2);
			enx = ey / el; // right-of-edge = outward
			eny = -ex / el;
		}
	}
	const d = Math.sqrt(bestD2);
	if (inside) {
		// Exit through the nearest edge, clearing the radius.
		return { x: cx + r * enx, y: cy + r * eny, nx: enx, ny: eny };
	}
	if (d < r) {
		// Outside but overlapping: push straight out from the nearest boundary point.
		const nx = d > 1e-6 ? (px - cx) / d : enx;
		const ny = d > 1e-6 ? (py - cy) / d : eny;
		return { x: cx + r * nx, y: cy + r * ny, nx, ny };
	}
	return null;
}

export const ENV_REGISTRY: Map<string, EnvDef> = new Map([
	[CAMPFIRE_ENV.ref, CAMPFIRE_ENV],
	[CANDELABRUM_ENV.ref, CANDELABRUM_ENV],
	[SHRINE_ENV.ref, SHRINE_ENV],
	[SHIP_ENV.ref, SHIP_ENV],
]);

/** Facing count for a def (rotatable props pack >1 row). */
export const envDirections = (def: EnvDef): number =>
	Math.max(1, def.directions ?? 1);

const sheetKey = (def: EnvDef): string => `env:${def.ref}`;
const animKey = (def: EnvDef, dir: number): string =>
	`anim:env:${def.ref}:${dir}`;

export function preloadEnv(scene: Phaser.Scene, def: EnvDef): void {
	scene.load.spritesheet(sheetKey(def), arpgAsset(def.sheet), {
		frameWidth: def.frameWidth,
		frameHeight: def.frameHeight,
	});
}

export function registerEnvAnims(scene: Phaser.Scene, def: EnvDef): void {
	// One looping anim per facing row; row-major frame index = dir * frames + f.
	for (let dir = 0; dir < envDirections(def); dir++) {
		const key = animKey(def, dir);
		if (scene.anims.exists(key)) continue;
		const start = dir * def.frames;
		scene.anims.create({
			key,
			frames: scene.anims.generateFrameNumbers(sheetKey(def), {
				start,
				end: start + def.frames - 1,
			}),
			frameRate: def.frameRate,
			repeat: -1,
		});
	}
}

/**
 * Build a looping prop sprite for an env `ref`, facing `dir` (its `sub` byte;
 * clamped to the def's row count). Returns null when the ref has no registered
 * def so the caller can fall back to the placeholder rectangle.
 */
export function makeEnvSprite(
	scene: Phaser.Scene,
	ref: string | null,
	dir = 0,
): Phaser.GameObjects.Sprite | null {
	const def = ref ? ENV_REGISTRY.get(ref) : undefined;
	if (!def) return null;
	const d = Math.min(Math.max(dir, 0), envDirections(def) - 1);
	const sprite = scene.add.sprite(0, 0, sheetKey(def), d * def.frames);
	sprite.setOrigin(0.5, def.originY);
	sprite.setDisplaySize(def.displayWidth, def.displayHeight);
	sprite.play(animKey(def, d));
	return sprite;
}

const GLOW_TEX = 'env-glow';

/** Lazily build the soft radial glow texture shared by all env lights. */
function ensureGlowTexture(scene: Phaser.Scene): void {
	if (scene.textures.exists(GLOW_TEX)) return;
	const r = 64;
	const g = scene.make.graphics({ x: 0, y: 0 }, false);
	for (let i = r; i > 0; i--) {
		g.fillStyle(0xffffff, (1 - i / r) * 0.06);
		g.fillCircle(r, r, i);
	}
	g.generateTexture(GLOW_TEX, r * 2, r * 2);
	g.destroy();
}

/**
 * Attach a flickering warm glow under a placed prop that declares a `light`
 * (campfire). Additive, sits just below the prop so the fire draws over its own
 * core. Lifetime is bound to the prop's Sprite — when the prop is destroyed the
 * glow + its flicker tween go with it, so no extra teardown bookkeeping. Call
 * AFTER the prop has been positioned so the glow lands on its tile.
 */
export function attachEnvLight(
	scene: Phaser.Scene,
	sprite: Phaser.GameObjects.GameObject &
		Phaser.GameObjects.Components.Transform &
		Phaser.GameObjects.Components.Depth,
	ref: string | null,
): void {
	const def = ref ? ENV_REGISTRY.get(ref) : undefined;
	if (!def?.light) return;
	ensureGlowTexture(scene);
	const { color, radius, intensity } = def.light;
	const glow = scene.add.image(sprite.x, sprite.y, GLOW_TEX);
	glow.setBlendMode(Phaser.BlendModes.ADD);
	glow.setTint(color);
	glow.setAlpha(intensity);
	glow.setDisplaySize(radius * 2, radius * 2);
	glow.setDepth(sprite.depth - 1);
	const baseScale = glow.scaleX;
	const shimmer = scene.tweens.add({
		targets: glow,
		alpha: { from: intensity, to: intensity * 0.88 },
		duration: 720,
		yoyo: true,
		repeat: -1,
		ease: 'Sine.easeInOut',
	});
	const breathe = scene.tweens.add({
		targets: glow,
		scaleX: { from: baseScale, to: baseScale * 1.04 },
		scaleY: { from: baseScale, to: baseScale * 1.04 },
		duration: 1100,
		yoyo: true,
		repeat: -1,
		ease: 'Sine.easeInOut',
	});
	sprite.once('destroy', () => {
		shimmer.remove();
		breathe.remove();
		glow.destroy();
	});
}
