import Phaser from 'phaser';
import { DEPTH_PROJECTILE } from '../../../config';
import { worldToScreen, type TileXY } from '../../../iso';

const SPARK_TEX = 'spell-spark';
const BOLT_SPEED = 0.9;

interface BoltStyle {
	ramp: number[];
	core: number;
}

const FIRE: BoltStyle = {
	ramp: [0xfff3b0, 0xffae3b, 0xff5a1f, 0x7a1f0a],
	core: 0xffd27a,
};
const FROST: BoltStyle = {
	ramp: [0xeaffff, 0x8fd8ff, 0x3b82f6, 0x1e3a8a],
	core: 0xbfe6ff,
};
const HOLY: BoltStyle = {
	ramp: [0xfffbe0, 0xffe9a8, 0xfcd34d],
	core: 0xfff0c0,
};
const ARCANE: BoltStyle = {
	ramp: [0xf3e0ff, 0xc084fc, 0x7c3aed],
	core: 0xe9d5ff,
};
const SHADOW: BoltStyle = {
	ramp: [0xd8c8ff, 0x7c3aed, 0x2a0a4a],
	core: 0x9a6ad0,
};
const NATURE: BoltStyle = {
	ramp: [0xeaffd0, 0x86efac, 0x166534],
	core: 0xcaffb0,
};
const LIGHTNING: BoltStyle = {
	ramp: [0xfffec8, 0xfde047, 0xfacc15, 0xa16207],
	core: 0xfdf6b2,
};
const DEFAULT: BoltStyle = {
	ramp: [0xffffff, 0x9fb3d8, 0x4c5a78],
	core: 0xcfe0ff,
};

const SCHOOL_STYLE: Record<string, BoltStyle> = {
	fire: FIRE,
	frost: FROST,
	ice: FROST,
	water: FROST,
	holy: HOLY,
	light: HOLY,
	arcane: ARCANE,
	shadow: SHADOW,
	dark: SHADOW,
	void: SHADOW,
	nature: NATURE,
	earth: NATURE,
	lightning: LIGHTNING,
};

const HEAL_RAMP = [0xeaffd0, 0x86efac, 0x34d399];

function ensureSpellTextures(scene: Phaser.Scene): void {
	if (scene.textures.exists(SPARK_TEX)) return;
	const r = 16;
	const g = scene.make.graphics({ x: 0, y: 0 }, false);
	for (let i = r; i > 0; i--) {
		g.fillStyle(0xffffff, (1 - i / r) * 0.14);
		g.fillCircle(r, r, i);
	}
	g.generateTexture(SPARK_TEX, r * 2, r * 2);
	g.destroy();
}

function burst(
	scene: Phaser.Scene,
	x: number,
	y: number,
	ramp: number[],
): void {
	const emitter = scene.add.particles(x, y, SPARK_TEX, {
		speed: { min: 40, max: 150 },
		angle: { min: 0, max: 360 },
		lifespan: { min: 220, max: 480 },
		scale: { start: 1.3, end: 0 },
		alpha: { start: 0.95, end: 0 },
		color: ramp,
		colorEase: 'quad.out',
		gravityY: -40,
		blendMode: 'ADD',
		emitting: false,
	});
	emitter.setDepth(DEPTH_PROJECTILE + 1);
	emitter.explode(28);
	scene.time.delayedCall(560, () => emitter.destroy());

	const flash = scene.add
		.image(x, y, SPARK_TEX)
		.setBlendMode(Phaser.BlendModes.ADD)
		.setTint(ramp[0])
		.setScale(2)
		.setDepth(DEPTH_PROJECTILE + 1);
	scene.tweens.add({
		targets: flash,
		scale: 6,
		alpha: 0,
		duration: 180,
		ease: 'Quad.easeOut',
		onComplete: () => flash.destroy(),
	});
}

function castBolt(
	scene: Phaser.Scene,
	from: TileXY,
	to: TileXY,
	style: BoltStyle,
): void {
	ensureSpellTextures(scene);
	const a = worldToScreen(from.x, from.y);
	a.y -= 32; // launch near the caster's body/hands, not the ground tile
	const b = worldToScreen(to.x, to.y);
	b.y -= 16;
	const dist = Math.hypot(b.x - a.x, b.y - a.y);
	const duration = Math.max(140, dist / BOLT_SPEED);

	const core = scene.add
		.image(a.x, a.y, SPARK_TEX)
		.setBlendMode(Phaser.BlendModes.ADD)
		.setTint(style.core)
		.setScale(1.7)
		.setDepth(DEPTH_PROJECTILE + 1);

	// Create the trail emitter at the ORIGIN (0,0) and follow the core — NOT at (a.x,a.y)
	// then follow, which double-counts the launch point and renders the trail offset.
	const trail = scene.add.particles(0, 0, SPARK_TEX, {
		speed: { min: 8, max: 36 },
		lifespan: 360,
		frequency: 16,
		quantity: 2,
		scale: { start: 1.1, end: 0 },
		alpha: { start: 0.85, end: 0 },
		color: style.ramp,
		colorEase: 'quad.out',
		gravityY: -24,
		blendMode: 'ADD',
	});
	trail.setDepth(DEPTH_PROJECTILE);
	trail.startFollow(core);

	scene.tweens.add({
		targets: core,
		x: b.x,
		y: b.y,
		duration,
		ease: 'Quad.easeIn',
		onComplete: () => {
			trail.stop();
			burst(scene, b.x, b.y, style.ramp);
			core.destroy();
			scene.time.delayedCall(400, () => trail.destroy());
		},
	});
}

export function castFireballVfx(
	scene: Phaser.Scene,
	from: TileXY,
	to: TileXY,
): void {
	castBolt(scene, from, to, FIRE);
}

export function castHealVfx(scene: Phaser.Scene, at: TileXY): void {
	ensureSpellTextures(scene);
	const p = worldToScreen(at.x, at.y);
	const emitter = scene.add.particles(p.x, p.y - 8, SPARK_TEX, {
		x: { min: -18, max: 18 },
		y: { min: -4, max: 6 },
		speed: { min: 6, max: 22 },
		angle: { min: 250, max: 290 },
		lifespan: { min: 520, max: 900 },
		scale: { start: 0.85, end: 0 },
		alpha: { start: 0.9, end: 0 },
		color: HEAL_RAMP,
		colorEase: 'quad.out',
		gravityY: -70,
		frequency: 36,
		quantity: 1,
		blendMode: 'ADD',
	});
	emitter.setDepth(DEPTH_PROJECTILE + 1);
	scene.time.delayedCall(520, () => emitter.stop());
	scene.time.delayedCall(1500, () => emitter.destroy());
}

export function playSpellVfx(
	scene: Phaser.Scene,
	school: string,
	effect: string,
	from: TileXY,
	to: TileXY,
): void {
	if (effect === 'heal' || effect === 'buff') {
		castHealVfx(scene, from);
		return;
	}
	if (to.x === from.x && to.y === from.y) return;
	castBolt(scene, from, to, SCHOOL_STYLE[school] ?? DEFAULT);
}

const STORM_STRIKE_MS = 240; // gap between strikes
const STRIKE_HEIGHT = 150; // px the bolt drops from above the impact

/** A single forked bolt dropping onto the ground point (sx,sy) + an impact burst. */
function strikeBolt(
	scene: Phaser.Scene,
	sx: number,
	sy: number,
	style: BoltStyle,
): void {
	const g = scene.add
		.graphics()
		.setDepth(DEPTH_PROJECTILE + 2)
		.setBlendMode(Phaser.BlendModes.ADD);
	g.lineStyle(2, style.core, 0.95);
	g.beginPath();
	g.moveTo(sx, sy - STRIKE_HEIGHT);
	const segs = 6;
	for (let i = 1; i <= segs; i++) {
		const y = sy - STRIKE_HEIGHT + (STRIKE_HEIGHT * i) / segs;
		const x = sx + (i < segs ? (Math.random() - 0.5) * 18 : 0);
		g.lineTo(x, y);
	}
	g.strokePath();
	scene.tweens.add({
		targets: g,
		alpha: 0,
		duration: 180,
		ease: 'Quad.easeOut',
		onComplete: () => g.destroy(),
	});
	burst(scene, sx, sy, style.ramp);
}

/** Lightning storm: a flurry of forked strikes landing on random ground within `radius`
 * tiles of `at`, staggered across `durationMs`. Cosmetic — the server damages every foe in
 * the area; these strikes just sell the storm. */
export function castStormVfx(
	scene: Phaser.Scene,
	at: TileXY,
	radius: number,
	durationMs: number,
	school: string,
): void {
	ensureSpellTextures(scene);
	const style = SCHOOL_STYLE[school] ?? LIGHTNING;
	const count = Math.max(4, Math.round(durationMs / STORM_STRIKE_MS));
	for (let i = 0; i < count; i++) {
		scene.time.delayedCall(i * STORM_STRIKE_MS, () => {
			const ang = Math.random() * Math.PI * 2;
			const r = Math.sqrt(Math.random()) * radius * 0.85;
			const p = worldToScreen(
				at.x + Math.cos(ang) * r,
				at.y + Math.sin(ang) * r,
			);
			strikeBolt(scene, p.x, p.y, style);
		});
	}
}
