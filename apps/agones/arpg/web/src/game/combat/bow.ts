import Phaser from 'phaser';
import { floatingText } from '@kbve/laser';
import {
	ARROW_SPEED,
	ARROW_MAX_RANGE,
	ARROW_DMG,
	BOW_RELEASE_FRAME,
	BOW_RECOVER_MS,
	BOW_MUZZLE_OFFSET,
	BOW_MUZZLE_OFFSET_WEST,
	BOW_MUZZLE_HEIGHT,
	DEPTH_PROJECTILE,
	DEPTH_UI,
} from '../config';
import { worldToScreen, type TileXY } from '../iso';
import { setClassPose, type ClassView } from '../entities/sprites';
import { facingDegFromDelta } from '../entities/classes';

/** Hit-test a flying arrow against a target each frame. */
export type ArrowHitTest = (
	tileX: number,
	tileY: number,
) => {
	serverEid: number;
	x: number;
	y: number;
} | null;

export interface BowShot {
	/** True while a shot (attack -> loose -> arrow) is mid-flight; blocks re-fire. */
	busy: boolean;
	/** True once the arrow has actually loosed (past the release frame). */
	loosed: boolean;
	/**
	 * Abort the shot (the player moved). Stops the pending timers and clears
	 * busy. If the arrow hasn't loosed yet it is suppressed entirely — a shot
	 * interrupted before the release frame fires no arrow.
	 */
	cancel(): void;
}

/**
 * Fire the ranger's bow at a world-tile target: face it, play Attack_Bow (the
 * full nock-pull-loose), loose the arrow on the release frame, fly it, and
 * resolve a local hit. Server-authoritative damage slots in later — for now
 * `onHit` fakes the number client-side. Returns a BowShot the caller polls
 * (`busy`) and can abort (`cancel`) when the player starts moving.
 */
export function fireBow(
	scene: Phaser.Scene,
	sprite: Phaser.GameObjects.Sprite,
	view: ClassView,
	from: TileXY,
	target: TileXY,
	hitTest: ArrowHitTest,
	onHit: (serverEid: number, dmg: number) => void,
	onLoose?: () => void,
	spawnLocalArrow = true,
): BowShot {
	const facing = { dx: target.x - from.x, dy: target.y - from.y };

	// Attack_Bow timing derives from the anim itself so it tracks frameRate.
	const atk = view.def.anims.Attack;
	const releaseMs = ((BOW_RELEASE_FRAME - 1) / atk.frameRate) * 1000;
	const totalMs = (atk.frames / atk.frameRate) * 1000;

	setClassPose(sprite, view, 'Attack', facing);

	const releaseTimer = scene.time.delayedCall(releaseMs, () => {
		shot.loosed = true;
		if (!sprite.active) return;
		// Tell the server to loose only now, on the release frame — sending it at
		// fire time made the authoritative arrow appear mid-draw. A shot cancelled
		// before release removes this timer, so no server shot fires either.
		onLoose?.();
		// Online the server's authoritative projectile event draws the arrow, so
		// only spawn a local one offline — otherwise the shot shows two arrows.
		if (spawnLocalArrow) spawnArrow(scene, from, target, hitTest, onHit);
	});

	const recoverTimer = scene.time.delayedCall(
		totalMs + BOW_RECOVER_MS,
		() => {
			if (sprite.active && view.state === 'Attack') {
				setClassPose(sprite, view, 'Idle');
			}
			shot.busy = false;
		},
	);

	const shot: BowShot = {
		busy: true,
		loosed: false,
		cancel() {
			if (!this.busy) return;
			// Not yet loosed -> kill the release so no arrow flies.
			if (!this.loosed) releaseTimer.remove(false);
			recoverTimer.remove(false);
			this.busy = false;
		},
	};

	return shot;
}

/**
 * Spawn an arrow and tween it from the shooter to the target along the aim line,
 * capped at ARROW_MAX_RANGE. The arrow is hit-tested against the target tile en
 * route; on contact it resolves damage + an impact spark and stops early.
 */
function spawnArrow(
	scene: Phaser.Scene,
	from: TileXY,
	target: TileXY,
	hitTest: ArrowHitTest,
	onHit: (serverEid: number, dmg: number) => void,
): void {
	const dx = target.x - from.x;
	const dy = target.y - from.y;
	const dist = Math.hypot(dx, dy) || 1;
	const nx = dx / dist;
	const ny = dy / dist;

	// West-facing poses (aim deg ~247..315) hold the bow further from the body,
	// so add extra forward offset there or the arrow spawns inside her.
	const deg = facingDegFromDelta(dx, dy);
	const westBoost = deg >= 247 && deg <= 315 ? BOW_MUZZLE_OFFSET_WEST : 0;
	const muzzleOffset = BOW_MUZZLE_OFFSET + westBoost;

	// Launch from in FRONT of the bow, not the body center: nudge the origin a
	// little along the aim direction, and lift it to roughly bow height so the
	// arrow reads as leaving the bow rather than the feet.
	const muzzle = {
		x: from.x + nx * muzzleOffset,
		y: from.y + ny * muzzleOffset,
	};
	const range = Math.min(dist, ARROW_MAX_RANGE);
	const endTile = {
		x: muzzle.x + nx * range,
		y: muzzle.y + ny * range,
	};

	const a = worldToScreen(muzzle.x, muzzle.y);
	a.y -= BOW_MUZZLE_HEIGHT;
	const b = worldToScreen(endTile.x, endTile.y);
	b.y -= BOW_MUZZLE_HEIGHT;

	// Small bright shaft; rotate to face the screen-space travel direction.
	const arrow = scene.add.rectangle(a.x, a.y, 16, 3, 0xfde68a);
	arrow.setStrokeStyle(1, 0x78350f, 0.9);
	arrow.setOrigin(0.5, 0.5);
	arrow.setDepth(DEPTH_PROJECTILE);
	arrow.setRotation(Math.atan2(b.y - a.y, b.x - a.x));

	const travelMs = (range / ARROW_SPEED) * 1000;
	let resolved = false;

	const tw = scene.tweens.add({
		targets: arrow,
		x: b.x,
		y: b.y,
		duration: travelMs,
		ease: 'Linear',
		onUpdate: () => {
			if (resolved) return;
			// Travelled fraction (screen) -> tiles from the muzzle, then hit-test.
			const total = Math.hypot(b.x - a.x, b.y - a.y) || 1;
			const done = Math.hypot(arrow.x - a.x, arrow.y - a.y);
			const t = (done / total) * range;
			const tileX = muzzle.x + nx * t;
			const tileY = muzzle.y + ny * t;
			const hit = hitTest(Math.round(tileX), Math.round(tileY));
			if (hit) {
				resolved = true;
				tw.stop();
				impact(scene, hit.x, hit.y);
				onHit(hit.serverEid, ARROW_DMG);
				arrow.destroy();
			}
		},
		onComplete: () => {
			if (!resolved) {
				impact(scene, b.x, b.y);
				arrow.destroy();
			}
		},
	});
}

/** Brief impact spark where an arrow lands or hits. */
function impact(scene: Phaser.Scene, x: number, y: number): void {
	const spark = scene.add.circle(x, y, 5, 0xfff7d6, 0.9);
	spark.setDepth(DEPTH_PROJECTILE + 1);
	scene.tweens.add({
		targets: spark,
		scale: 2.4,
		alpha: 0,
		duration: 160,
		ease: 'Quad.easeOut',
		onComplete: () => spark.destroy(),
	});
}

/** Floating damage number over a hit target (local fake until server confirms). */
export function showDamage(
	scene: Phaser.Scene,
	x: number,
	y: number,
	dmg: number,
): void {
	floatingText(scene, x, y, `-${dmg}`, '#f87171', DEPTH_UI + 2);
}
