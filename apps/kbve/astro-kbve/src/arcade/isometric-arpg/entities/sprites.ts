import Phaser from 'phaser';
import {
	BLEND_MS,
	BLEND_SQUASH,
	BLEND_TIMESCALE_FROM,
	COLORS,
	DEPTH_UI,
} from '../config';
import {
	KIND_CAT_ITEM,
	KIND_CAT_PLAYER,
	type KindResolvers,
} from '../systems/kindResolvers';
import {
	CLASS_ANGLES,
	classAnimKey,
	classSheetKey,
	nearestClassAngle,
	resolvePlayerClass,
	type ClassDef,
	type ClassState,
} from './classes';

/** Per-player directional pose state, tracked on the entity refs. */
export interface ClassView {
	def: ClassDef;
	angle: string;
	state: ClassState;
}

export interface EntityRefs {
	sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
	nameplate?: Phaser.GameObjects.Text;
	hpBar?: Phaser.GameObjects.Graphics;
	cls?: ClassView;
}

function bodyColor(cat: number, hostile: boolean): number {
	if (cat === KIND_CAT_ITEM) return COLORS.npc;
	return hostile ? COLORS.enemy : COLORS.npc;
}

export function isPlayerKind(kinds: KindResolvers, kind: number): boolean {
	return kinds.cat(kind) === KIND_CAT_PLAYER;
}

/** Spawn a player's class character sprite (idle anim, facing south). */
export function makeClassSprite(
	scene: Phaser.Scene,
	classRef: string | null,
): { sprite: Phaser.GameObjects.Sprite; cls: ClassView } {
	const def = resolvePlayerClass(classRef);
	const angle = CLASS_ANGLES[8]; // south
	const sprite = scene.add.sprite(0, 0, classSheetKey(def, 'Idle', angle), 0);
	sprite.setOrigin(0.5, def.originY);
	sprite.setDisplaySize(def.displaySize, def.displaySize);
	const view: ClassView = { def, angle, state: 'Idle' };
	sprite.play(classAnimKey(def, 'Idle', angle));
	return { sprite, cls: view };
}

/**
 * Crossfade two looping states. Sprite sheets can't frame-interpolate, so the
 * swap is sold three ways at once:
 *  - phase-match: the incoming anim resumes at the SAME normalized progress the
 *    outgoing anim held, so the dissolve bridges near-aligned poses, not a
 *    full-cycle pop.
 *  - timeScale ramp: the new flipbook spins up from slow instead of snapping.
 *  - squash anticipation: a brief scaleY dip/recover reads as a weight shift
 *    into the step and hides whatever pose mismatch remains.
 * A ghost holds the outgoing frame and alpha-fades out under the live sprite.
 */
function crossfadeBlend(
	scene: Phaser.Scene,
	sprite: Phaser.GameObjects.Sprite,
	fromKey: string,
	fromFrame: number,
	entryProgress: number,
): void {
	const ghost = scene.add.sprite(sprite.x, sprite.y, fromKey, fromFrame);
	ghost.setOrigin(sprite.originX, sprite.originY);
	ghost.setDisplaySize(sprite.displayWidth, sprite.displayHeight);
	ghost.setDepth(sprite.depth - 1);
	ghost.setFlipX(sprite.flipX);

	scene.tweens.add({
		targets: ghost,
		alpha: 0,
		duration: BLEND_MS,
		ease: 'Cubic.easeOut',
		onComplete: () => ghost.destroy(),
	});

	sprite.setAlpha(0.3);
	scene.tweens.add({
		targets: sprite,
		alpha: 1,
		duration: BLEND_MS,
		ease: 'Cubic.easeIn',
	});

	if (sprite.anims) {
		sprite.anims.setProgress(Phaser.Math.Clamp(entryProgress, 0, 1));
		scene.tweens.killTweensOf(sprite.anims);
		sprite.anims.timeScale = BLEND_TIMESCALE_FROM;
		scene.tweens.add({
			targets: sprite.anims,
			timeScale: 1,
			duration: BLEND_MS,
			ease: 'Cubic.easeOut',
			onComplete: () => {
				sprite.anims.timeScale = 1;
			},
		});
	}

	const baseScaleY = sprite.scaleY;
	scene.tweens.add({
		targets: sprite,
		scaleY: baseScaleY * BLEND_SQUASH,
		duration: BLEND_MS * 0.4,
		ease: 'Quad.easeOut',
		yoyo: true,
		onComplete: () => {
			sprite.scaleY = baseScaleY;
		},
	});
}

/**
 * Swap a class sprite's animation to the given state, optionally re-facing.
 * Looping states (Idle/Run) only restart on an actual state/angle change so the
 * flipbook doesn't stutter; one-shot states (Attack/Death) always replay. An
 * Idle<->Run change crossfades via a ghost sprite (pass `scene` to enable it);
 * angle-only turns and one-shots snap.
 */
export function setClassPose(
	sprite: Phaser.GameObjects.Sprite,
	view: ClassView,
	state: ClassState,
	facing?: { dx: number; dy: number },
	scene?: Phaser.Scene,
): void {
	const prevAngle = view.angle;
	const prevState = view.state;
	if (facing && (facing.dx !== 0 || facing.dy !== 0)) {
		view.angle = nearestClassAngle(facing.dx, facing.dy);
	}
	const oneShot = state === 'Attack' || state === 'Death';
	const changed = state !== view.state || view.angle !== prevAngle || oneShot;
	view.state = state;
	if (!changed) return;

	const blend =
		!!scene &&
		!oneShot &&
		state !== prevState &&
		(prevState === 'Idle' || prevState === 'Run') &&
		(state === 'Idle' || state === 'Run');
	const fromKey = sprite.texture.key;
	const fromFrame = sprite.anims?.currentFrame?.index ?? 0;
	// Normalized phase of the outgoing loop, carried into the incoming loop so
	// the two flipbooks meet at a near-matching pose instead of frame 0.
	const entryProgress = blend ? (sprite.anims?.getProgress() ?? 0) : 0;

	sprite.setDisplaySize(view.def.displaySize, view.def.displaySize);
	sprite.play(classAnimKey(view.def, state, view.angle), !oneShot);

	if (blend && scene)
		crossfadeBlend(scene, sprite, fromKey, fromFrame, entryProgress);
}

export function makeSprite(
	scene: Phaser.Scene,
	kinds: KindResolvers,
	kind: number,
	hostile: boolean,
): Phaser.GameObjects.Rectangle {
	const cat = kinds.cat(kind);
	const isItem = cat === KIND_CAT_ITEM;
	const w = isItem ? 16 : 22;
	const h = isItem ? 16 : 34;
	const rect = scene.add.rectangle(0, 0, w, h, bodyColor(cat, hostile));
	rect.setStrokeStyle(2, 0x000000, 0.5);
	rect.setOrigin(0.5, 1);
	return rect;
}

export function makeNameplate(
	scene: Phaser.Scene,
	label: string,
): Phaser.GameObjects.Text {
	return scene.add
		.text(0, 0, label, {
			fontFamily: 'monospace',
			fontSize: '11px',
			color: '#fcd34d',
			stroke: '#000000',
			strokeThickness: 3,
		})
		.setOrigin(0.5, 1)
		.setDepth(DEPTH_UI + 1);
}
