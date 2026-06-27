import Phaser from 'phaser';
import { arpgAsset } from '../config';

/**
 * Pilotable starfighter — a stateful, multi-sheet rig (NOT the generic single-sheet
 * env prop in env.ts). Each phase of the pilot flow renders a different baked sheet
 * (kbve-model-sprites); this controller owns the sheets, the state machine,
 * and the per-frame anim selection. The server drives it via coarse state + facing;
 * the fine anim (lift progress, hover bob, bank lean) is cosmetic and lives here.
 *
 * Flow:
 *   off → powerOn → lift(once) → fly ⇄ {idle | move | bank}  (drive)
 *   fly → land(lift reversed) → powerOff → off                (exit)
 *   fly → leaving(once) → [3D space mode] → entering(once) → fly
 */
const BASE = '/assets/arcade/arpg/environment/structures/ship';

type Play = 'static' | 'loop' | 'once' | 'index';

interface ShipSheet {
	ref: string;
	sheet: string;
	frameWidth: number;
	frameHeight: number;
	/** anim frames per facing (sheet columns). */
	frames: number;
	/** facing rows (1 for the directionless atmosphere cutscenes). */
	directions: number;
	fps: number;
	play: Play;
	/** vertical anchor; tuned per sheet so the ground-contact line lands on the tile. */
	originY: number;
	/**
	 * On-screen scale relative to DISPLAY. The animated sheets are baked with lift
	 * headroom (ortho `(size + 0.6·size)·1.6`), so the hull fills only 1/1.6 of the
	 * frame; scaling them up by ~1.6 makes the hull match the headroom-free static
	 * off/on sheets, so off→lift doesn't visibly shrink.
	 */
	scale: number;
}

// off/on are 512px 4x4 (frames:1, 16 dir); the loop/lift/bank rigs are 512px 8x16;
// the atmosphere cutscenes are 512px 16x1 (single facing). originY differs because the
// animated sheets carry lift headroom (ship sits higher in the frame).
// Static sheets (off/on) fill the frame → scale 1. Animated sheets carry 0.6 lift
// headroom → scale 1.6 so the hull matches. ANIM_SCALE = 1 + lift.
const ANIM_SCALE = 1.6;

export const SHIP_SHEETS = {
	off: f('ship', 'ship.png', 512, 1, 16, 1, 'static', 0.52, 1),
	on: f('ship_on', 'ship_on.png', 512, 1, 16, 1, 'static', 0.52, 1),
	lift: f(
		'ship_lift',
		'ship_lift.png',
		512,
		8,
		16,
		14,
		'once',
		0.62,
		ANIM_SCALE,
	),
	idle: f(
		'ship_idle',
		'ship_idle.png',
		512,
		8,
		16,
		10,
		'loop',
		0.62,
		ANIM_SCALE,
	),
	move: f(
		'ship_move',
		'ship_move.png',
		512,
		8,
		16,
		12,
		'loop',
		0.62,
		ANIM_SCALE,
	),
	bank: f(
		'ship_bank',
		'ship_bank.png',
		512,
		8,
		16,
		1,
		'index',
		0.62,
		ANIM_SCALE,
	),
	leaving: f(
		'ship_leaving',
		'ship_leaving_atmosphere.png',
		512,
		16,
		1,
		18,
		'once',
		0.62,
		ANIM_SCALE,
	),
	entering: f(
		'ship_entering',
		'ship_entering_atmosphere.png',
		512,
		16,
		1,
		18,
		'once',
		0.62,
		ANIM_SCALE,
	),
} satisfies Record<string, ShipSheet>;

function f(
	ref: string,
	file: string,
	size: number,
	frames: number,
	directions: number,
	fps: number,
	play: Play,
	originY: number,
	scale: number,
): ShipSheet {
	return {
		ref,
		sheet: `${BASE}/${file}`,
		frameWidth: size,
		frameHeight: size,
		frames,
		directions,
		fps,
		play,
		originY,
		scale,
	};
}

/** On-screen hull size (px). Every sheet scales to this so swaps don't pop. */
const DISPLAY = 384;
const DIRS = 16;

export type ShipState =
	| 'off'
	| 'powerOn'
	| 'lift'
	| 'fly'
	| 'land'
	| 'powerOff'
	| 'leaving'
	| 'entering';

const texKey = (s: ShipSheet) => `ship:${s.ref}`;
const animKey = (s: ShipSheet, dir: number) => `anim:ship:${s.ref}:${dir}`;

// Server packs the ship's drive state into its `sub` byte: low nibble = facing
// (0..15), high nibble = phase. MUST match pilot.rs PHASE_* on the server.
export const SHIP_PHASE_TO_STATE: ShipState[] = [
	'off',
	'lift',
	'fly',
	'land',
	'leaving',
	'entering',
];
export const shipFacingFromSub = (sub: number): number => sub & 0x0f;
export const shipPhaseFromSub = (sub: number): number => (sub >> 4) & 0x0f;

export function preloadShip(scene: Phaser.Scene): void {
	for (const s of Object.values(SHIP_SHEETS)) {
		scene.load.spritesheet(texKey(s), arpgAsset(s.sheet), {
			frameWidth: s.frameWidth,
			frameHeight: s.frameHeight,
		});
	}
}

export function registerShipAnims(scene: Phaser.Scene): void {
	// One anim per (sheet, facing) for the loop/once rigs; row-major dir*frames + f.
	// 'static'/'index' sheets need no anim — the controller sets the frame directly.
	for (const s of Object.values(SHIP_SHEETS)) {
		if (s.play === 'static' || s.play === 'index') continue;
		for (let dir = 0; dir < s.directions; dir++) {
			const key = animKey(s, dir);
			if (scene.anims.exists(key)) continue;
			const start = dir * s.frames;
			scene.anims.create({
				key,
				frames: scene.anims.generateFrameNumbers(texKey(s), {
					start,
					end: start + s.frames - 1,
				}),
				frameRate: s.fps,
				repeat: s.play === 'loop' ? -1 : 0,
			});
		}
	}
}

/** How the ship is moving this frame — drives the fly sub-state (idle/move/bank). */
export interface ShipMotion {
	/** tiles/sec along the heading; 0 = stationary hover. */
	speed: number;
	/** facing change rate, signed; magnitude picks the bank lean. */
	turnRate: number;
}

const STOP_EPS = 0.05; // below this speed the ship idles instead of cruising
const TURN_EPS = 0.6; // above this |turnRate| the ship banks into the turn
const POWER_MS = 450; // powerOn/powerOff static hold before lift/off

export class ShipController {
	readonly sprite: Phaser.GameObjects.Sprite;
	private state: ShipState = 'off';
	private facing = 0;
	private onArrive: (() => void) | null = null;
	/** fired when a transition state (lift/land/leaving/entering/powerOff) finishes. */
	onTransition: ((from: ShipState) => void) | null = null;

	private timer?: Phaser.Time.TimerEvent;

	constructor(
		private scene: Phaser.Scene,
		x: number,
		y: number,
	) {
		const off = SHIP_SHEETS.off;
		this.sprite = scene.add.sprite(x, y, texKey(off), 0);
		this.sprite.setDisplaySize(DISPLAY, DISPLAY);
		this.applySheet(off);
		this.sprite.on(
			Phaser.Animations.Events.ANIMATION_COMPLETE,
			this.handleAnimComplete,
			this,
		);
		// the sprite may be reaped by the entity manager — drop our timer with it so
		// a delayed setState never touches a destroyed sprite.
		this.sprite.once(Phaser.GameObjects.Events.DESTROY, () =>
			this.timer?.remove(),
		);
	}

	get currentState(): ShipState {
		return this.state;
	}

	/** Coarse state from the server. Transition states auto-advance on anim-complete. */
	setState(next: ShipState): void {
		if (next === this.state) return;
		this.timer?.remove();
		this.timer = undefined;
		this.state = next;
		this.render();
		// powerOn/powerOff are brief static holds (engines lit, grounded) before the
		// lift/off they bracket. The server may drive these explicitly; absent that,
		// auto-advance so the client demo flows on its own.
		if (next === 'powerOn') {
			this.timer = this.scene.time.delayedCall(POWER_MS, () =>
				this.setState('lift'),
			);
		} else if (next === 'powerOff') {
			this.timer = this.scene.time.delayedCall(POWER_MS, () =>
				this.setState('off'),
			);
		}
	}

	setFacing(dir: number): void {
		const d = ((Math.trunc(dir) % DIRS) + DIRS) % DIRS;
		if (d === this.facing) return;
		this.facing = d;
		if (this.state === 'fly')
			this.render(); // re-pick row; transitions finish first
		else if (this.state === 'off' || this.state === 'powerOn')
			this.render();
	}

	/** Per-frame motion while flying — selects idle vs move vs bank + the bank lean. */
	setMotion(m: ShipMotion): void {
		if (this.state !== 'fly') return;
		this.applyFly(m);
	}

	private render(): void {
		switch (this.state) {
			case 'off':
				this.applySheet(SHIP_SHEETS.off);
				break;
			case 'powerOn':
			case 'powerOff':
				this.applySheet(SHIP_SHEETS.on);
				break;
			case 'lift':
				this.playOnce(SHIP_SHEETS.lift, false);
				break;
			case 'land':
				this.playOnce(SHIP_SHEETS.lift, true); // reversed = descent
				break;
			case 'leaving':
				this.playOnce(SHIP_SHEETS.leaving, false);
				break;
			case 'entering':
				this.playOnce(SHIP_SHEETS.entering, false);
				break;
			case 'fly':
				this.applyFly({ speed: 0, turnRate: 0 });
				break;
		}
	}

	private applyFly(m: ShipMotion): void {
		if (Math.abs(m.turnRate) > TURN_EPS) {
			// hold a bank frame by turn-rate: 0 = hard left .. frames-1 = hard right
			const bank = SHIP_SHEETS.bank;
			const span = bank.frames - 1;
			const t = Phaser.Math.Clamp((m.turnRate / TURN_EPS + 1) / 2, 0, 1);
			const frame = this.facing * bank.frames + Math.round(t * span);
			this.applySheet(bank);
			this.sprite.anims.stop();
			this.sprite.setFrame(frame);
		} else {
			const sheet =
				m.speed > STOP_EPS ? SHIP_SHEETS.move : SHIP_SHEETS.idle;
			this.applySheet(sheet);
			this.sprite.play(animKey(sheet, this.facing), true);
		}
	}

	private playOnce(sheet: ShipSheet, reverse: boolean): void {
		this.applySheet(sheet);
		const key = animKey(sheet, sheet.directions === 1 ? 0 : this.facing);
		if (reverse) this.sprite.playReverse(key);
		else this.sprite.play(key);
	}

	/** Swap texture + keep a consistent on-screen size and ground anchor. */
	private applySheet(sheet: ShipSheet): void {
		if (this.sprite.texture.key !== texKey(sheet)) {
			this.sprite.setTexture(texKey(sheet));
		}
		this.sprite.setOrigin(0.5, sheet.originY);
		this.sprite.setDisplaySize(
			DISPLAY * sheet.scale,
			DISPLAY * sheet.scale,
		);
		if (sheet.play === 'static') {
			this.sprite.anims.stop();
			this.sprite.setFrame(this.facing); // 4x4: frame == facing
		}
	}

	/**
	 * When true (local demo), transition states auto-advance on anim-complete. When
	 * the SERVER drives phase (real piloting), set false so the server's coarse phase
	 * is authoritative — `lift`/`land` hold their last frame until the server moves on.
	 */
	autoAdvance = true;

	private handleAnimComplete(_anim: Phaser.Animations.Animation): void {
		const from = this.state;
		if (this.autoAdvance) {
			if (from === 'lift' || from === 'entering') this.setState('fly');
			else if (from === 'land') this.setState('powerOff');
		}
		this.onTransition?.(from);
	}

	setPosition(x: number, y: number): void {
		this.sprite.setPosition(x, y);
	}

	setDepth(d: number): void {
		this.sprite.setDepth(d);
	}

	destroy(): void {
		this.sprite.destroy();
	}
}
