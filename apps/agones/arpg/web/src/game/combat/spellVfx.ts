import Phaser from 'phaser';
import { DEPTH_PROJECTILE } from '../config';
import { worldToScreen, type TileXY } from '../iso';

// Spell VFX, authored in-engine (no third-party assets). The fire look follows
// the classic shape-x-gradient additive technique: a soft round spark sprite
// supplies the alpha, and a white->yellow->orange->red->smoke color ramp over
// each particle's life supplies the fire color. All Phaser particles, so it
// depth-sorts, follows the camera, and tears down with the scene.

const SPARK_TEX = 'spell-spark';
const FIREBALL_SPEED = 0.9; // screen px per ms
const FIRE_RAMP = [0xfff3b0, 0xffae3b, 0xff5a1f, 0x7a1f0a];

/** Generate the soft round spark texture once per scene (cheap radial falloff). */
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

/** One-shot additive fire burst at a screen point (impact / explosion). */
function fireBurst(scene: Phaser.Scene, x: number, y: number): void {
	const emitter = scene.add.particles(x, y, SPARK_TEX, {
		speed: { min: 40, max: 150 },
		angle: { min: 0, max: 360 },
		lifespan: { min: 220, max: 480 },
		scale: { start: 1.3, end: 0 },
		alpha: { start: 0.95, end: 0 },
		color: FIRE_RAMP,
		colorEase: 'quad.out',
		gravityY: -40,
		blendMode: 'ADD',
		emitting: false,
	});
	emitter.setDepth(DEPTH_PROJECTILE + 1);
	emitter.explode(28);
	// Let the burst finish, then drop the emitter.
	scene.time.delayedCall(560, () => emitter.destroy());
}

/**
 * Fly a fireball from the caster tile to the target tile, trailing fire, then
 * burst on arrival. Purely cosmetic — the server stays authoritative on damage;
 * this is optimistic feedback fired the instant the player casts.
 */
export function castFireballVfx(
	scene: Phaser.Scene,
	from: TileXY,
	to: TileXY,
): void {
	ensureSpellTextures(scene);

	const a = worldToScreen(from.x, from.y);
	a.y -= 24; // leave from roughly chest height, not the feet
	const b = worldToScreen(to.x, to.y);
	b.y -= 16;
	const dist = Math.hypot(b.x - a.x, b.y - a.y);
	const duration = Math.max(140, dist / FIREBALL_SPEED);

	const core = scene.add
		.image(a.x, a.y, SPARK_TEX)
		.setBlendMode(Phaser.BlendModes.ADD)
		.setTint(0xffd27a)
		.setScale(1.7)
		.setDepth(DEPTH_PROJECTILE + 1);

	const trail = scene.add.particles(a.x, a.y, SPARK_TEX, {
		speed: { min: 8, max: 36 },
		lifespan: 360,
		frequency: 16,
		quantity: 2,
		scale: { start: 1.1, end: 0 },
		alpha: { start: 0.85, end: 0 },
		color: FIRE_RAMP,
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
			fireBurst(scene, b.x, b.y);
			core.destroy();
			scene.time.delayedCall(400, () => trail.destroy());
		},
	});
}
