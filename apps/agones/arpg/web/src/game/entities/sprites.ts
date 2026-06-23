import Phaser from 'phaser';
import {
	BLEND_MS,
	BLEND_SQUASH,
	BLEND_TIMESCALE_FROM,
	COLORS,
	DEPTH_UI,
	TURN_LERP,
} from '../config';
import {
	KIND_CAT_ITEM,
	KIND_CAT_PLAYER,
	type KindResolvers,
} from '../systems/kindResolvers';
import {
	CLASS_ANGLES,
	LOCOMOTION_STATES,
	ONE_SHOT_STATES,
	SOUTH_DEG,
	angleFromDeg,
	classAnimKey,
	classSheetKey,
	facingDegFromDelta,
	lerpAngleDeg,
	resolvePlayerClass,
	type ClassDef,
	type ClassState,
} from './classes';

const isOneShot = (s: ClassState): boolean => ONE_SHOT_STATES.includes(s);
const isLocomotion = (s: ClassState): boolean => LOCOMOTION_STATES.includes(s);

const warnedAnims = new Set<string>();

/**
 * Play an animation only when it exists and has frames. A texture that failed to
 * load — e.g. a Git LFS pointer stub shipped instead of the real PNG — produces
 * a zero-frame animation, and Phaser then throws in getFirstTick reading
 * `currentFrame.duration`, taking down the whole scene at spawn. Guarding here
 * keeps the game alive (the sprite holds its static first frame) and logs the
 * offending key once so the missing asset is diagnosable.
 */
function safePlay(
	sprite: Phaser.GameObjects.Sprite,
	key: string,
	ignoreIfPlaying = false,
): void {
	const mgr = sprite.scene.anims;
	const anim = mgr.exists(key) ? mgr.get(key) : undefined;
	if (!anim || anim.frames.length === 0) {
		if (!warnedAnims.has(key)) {
			warnedAnims.add(key);
			console.warn(
				`[arpg] animation "${key}" missing or has no frames — texture failed to load (LFS pointer stub?); skipping play()`,
			);
		}
		return;
	}
	sprite.play(key, ignoreIfPlaying);
}

/** Per-player directional pose state, tracked on the entity refs. */
export interface ClassView {
	def: ClassDef;
	/** Currently-displayed sheet angle bucket (one of CLASS_ANGLES). */
	angle: string;
	state: ClassState;
	/** Smoothly-lerped visual facing in degrees [0,360). */
	facingDeg: number;
	/** Facing the character is turning toward. */
	targetDeg: number;
	/** Baked shadow layer, kept frame-locked under the body. */
	shadow?: Phaser.GameObjects.Sprite;
}

export interface EntityRefs {
	sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
	shadow?: Phaser.GameObjects.Sprite;
	nameplate?: Phaser.GameObjects.Text;
	hpBar?: Phaser.GameObjects.Graphics;
	statusFx?: Phaser.GameObjects.Graphics;
	cls?: ClassView;
}

function bodyColor(cat: number, hostile: boolean): number {
	// Ground loot reads as a bright amber gem so it stands out against the floor.
	if (cat === KIND_CAT_ITEM) return 0xfacc15;
	return hostile ? COLORS.enemy : COLORS.npc;
}

export function isPlayerKind(kinds: KindResolvers, kind: number): boolean {
	return kinds.cat(kind) === KIND_CAT_PLAYER;
}

/**
 * Spawn a player's class character (idle, facing south) as two frame-locked
 * layers: the baked Shadow underneath and the Body on top, sharing origin and
 * display size so the artist's shadow lands exactly under the feet at every
 * angle/frame. Both are returned; the scene positions them together.
 */
export function makeClassSprite(
	scene: Phaser.Scene,
	classRef: string | null,
): {
	sprite: Phaser.GameObjects.Sprite;
	shadow: Phaser.GameObjects.Sprite;
	cls: ClassView;
} {
	const def = resolvePlayerClass(classRef);
	const angle = CLASS_ANGLES[8]; // south

	const shadow = scene.add.sprite(
		0,
		0,
		classSheetKey(def, 'Idle', angle, 'Shadow'),
		0,
	);
	shadow.setOrigin(0.5, def.originY);
	shadow.setDisplaySize(def.displaySize, def.displaySize);
	safePlay(shadow, classAnimKey(def, 'Idle', angle, 'Shadow'));

	const sprite = scene.add.sprite(0, 0, classSheetKey(def, 'Idle', angle), 0);
	sprite.setOrigin(0.5, def.originY);
	sprite.setDisplaySize(def.displaySize, def.displaySize);
	safePlay(sprite, classAnimKey(def, 'Idle', angle));

	const view: ClassView = {
		def,
		angle,
		state: 'Idle',
		facingDeg: SOUTH_DEG,
		targetDeg: SOUTH_DEG,
		shadow,
	};
	return { sprite, shadow, cls: view };
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
 * Set the class STATE (Idle/Run/Attack/…) and, when given a movement delta, the
 * facing TARGET. Facing itself isn't snapped here — tickClassFacing() lerps the
 * visual angle toward the target each frame for a smooth turn curve. The
 * flipbook only re-plays on a state change; angle re-plays happen in the tick.
 * One-shots always replay; an Idle<->move change crossfades when `scene` given.
 */
export function setClassPose(
	sprite: Phaser.GameObjects.Sprite,
	view: ClassView,
	state: ClassState,
	facing?: { dx: number; dy: number },
	scene?: Phaser.Scene,
): void {
	const prevState = view.state;
	if (facing && (facing.dx !== 0 || facing.dy !== 0)) {
		view.targetDeg = facingDegFromDelta(facing.dx, facing.dy);
	}
	const oneShot = isOneShot(state);
	const changed = state !== view.state || oneShot;
	view.state = state;
	if (!changed) return;

	// One-shots (Attack/Hit/Death/…) don't get the per-frame facing lerp from
	// tickClassFacing, so snap the displayed angle to the aim NOW — otherwise the
	// shot plays in whatever direction the body last lerped to (she'd fire the
	// wrong way). Locomotion keeps the smooth lerp via view.angle untouched here.
	if (oneShot && facing && (facing.dx !== 0 || facing.dy !== 0)) {
		view.facingDeg = view.targetDeg;
		view.angle = angleFromDeg(view.targetDeg);
	}

	const blend =
		!!scene &&
		!oneShot &&
		state !== prevState &&
		isLocomotion(prevState) &&
		isLocomotion(state);
	const fromKey = sprite.texture.key;
	const fromFrame = sprite.anims?.currentFrame?.index ?? 0;
	// Normalized phase of the outgoing loop, carried into the incoming loop so
	// the two flipbooks meet at a near-matching pose instead of frame 0.
	const entryProgress = blend ? (sprite.anims?.getProgress() ?? 0) : 0;

	sprite.setDisplaySize(view.def.displaySize, view.def.displaySize);
	safePlay(sprite, classAnimKey(view.def, state, view.angle), !oneShot);
	if (view.shadow) {
		view.shadow.setDisplaySize(view.def.displaySize, view.def.displaySize);
		safePlay(
			view.shadow,
			classAnimKey(view.def, state, view.angle, 'Shadow'),
			!oneShot,
		);
	}

	if (blend && scene)
		crossfadeBlend(scene, sprite, fromKey, fromFrame, entryProgress);
}

/**
 * Advance the smooth facing each frame: lerp the visual angle toward the target
 * and, when it crosses into a new 16-way bucket, swap the looping sheet WITHOUT
 * restarting the flipbook (progress is preserved) so a turn re-aims the body
 * mid-stride instead of snapping. One-shot states hold their angle. Returns true
 * if the displayed sheet angle changed this frame.
 */
export function tickClassFacing(
	sprite: Phaser.GameObjects.Sprite,
	view: ClassView,
): boolean {
	if (isOneShot(view.state)) return false;
	view.facingDeg = lerpAngleDeg(view.facingDeg, view.targetDeg, TURN_LERP);
	const angle = angleFromDeg(view.facingDeg);
	if (angle === view.angle) return false;
	view.angle = angle;
	const progress = sprite.anims?.getProgress() ?? 0;
	safePlay(sprite, classAnimKey(view.def, view.state, angle), true);
	sprite.anims?.setProgress(Phaser.Math.Clamp(progress, 0, 1));
	if (view.shadow) {
		safePlay(
			view.shadow,
			classAnimKey(view.def, view.state, angle, 'Shadow'),
			true,
		);
		view.shadow.anims?.setProgress(Phaser.Math.Clamp(progress, 0, 1));
	}
	return true;
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
