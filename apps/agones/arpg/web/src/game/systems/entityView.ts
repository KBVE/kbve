import Phaser from 'phaser';
import type { StatusView, StatusKind } from '@kbve/laser';
import { worldToScreen, tileDepth, type TileXY } from '../iso';
import { DEPTH_ENTITY_BASE } from '../config';
import type { EntityRefs } from '../entities/sprites';

// Status effect aura/pip colours and the aura precedence (harm before help).
const STATUS_COLOR: Record<StatusKind, number> = {
	Burn: 0xfb923c,
	Poison: 0x84cc16,
	Regen: 0x4ade80,
	Haste: 0x38bdf8,
};
const STATUS_PRIORITY: readonly StatusKind[] = [
	'Burn',
	'Poison',
	'Regen',
	'Haste',
];

/** Project a tile onto the iso plane and depth-sort the body sprite by tile. */
export function placeSprite(
	scene: Phaser.Scene,
	sprite: EntityRefs['sprite'],
	tx: number,
	ty: number,
): void {
	const p = worldToScreen(tx, ty);
	sprite.setPosition(p.x, p.y + 8);
	sprite.setDepth(DEPTH_ENTITY_BASE + tileDepth(tx, ty));
}

export function placeRefs(
	scene: Phaser.Scene,
	refs: EntityRefs,
	tile: TileXY,
): void {
	placeSprite(scene, refs.sprite, tile.x, tile.y);
	syncShadow(refs);
	placeNameplate(refs);
}

/**
 * The shadow is the asset's baked Shadow layer, frame-locked to the Body, so it
 * just mirrors the body sprite's exact transform and renders one depth below
 * it. No ground projection or foot fudge — the artist already aligned the
 * shadow to the feet for every angle and frame.
 */
export function syncShadow(refs: EntityRefs): void {
	if (!refs.shadow) return;
	refs.shadow.setPosition(refs.sprite.x, refs.sprite.y);
	refs.shadow.setDepth(refs.sprite.depth - 1);
}

export function placeNameplate(refs: EntityRefs): void {
	if (!refs.nameplate) return;
	refs.nameplate.setPosition(
		refs.sprite.x,
		refs.sprite.y - refs.sprite.displayHeight * 0.62 - 8,
	);
}

/** Tear down an entity's display objects. */
export function destroyRefs(refs: EntityRefs): void {
	refs.settleTimer?.remove(false);
	refs.shadow?.destroy();
	refs.nameplate?.destroy();
	refs.hpBar?.destroy();
	refs.statusFx?.destroy();
	refs.dbgText?.destroy();
	refs.dbgArrow?.destroy();
	refs.sprite.destroy();
}

/**
 * Status feedback: a pulsing ground aura tinted by the dominant effect (doubles
 * as the on-tile burn cue) plus a row of colour pips, one per active effect.
 * Kept off sprite.setTint so it never fights the combat hit-flash.
 */
export function drawStatusFx(
	refs: EntityRefs,
	effects: readonly StatusView[],
	now: number,
): void {
	const g = refs.statusFx;
	if (!g) return;
	// Skip redraw if effect count unchanged (rough cache — full comparison would check kinds).
	if (refs.lastStatusCount === effects.length && effects.length > 0) return;
	refs.lastStatusCount = effects.length;
	g.clear();
	if (effects.length === 0) return;

	const sprite = refs.sprite;
	const footY = sprite.y;
	const dominant = STATUS_PRIORITY.find((k) =>
		effects.some((e) => e.kind === k),
	);
	if (dominant) {
		const color = STATUS_COLOR[dominant];
		// Sine pulse; burn/poison flicker harder than buffs for urgency.
		const fast = dominant === 'Burn' || dominant === 'Poison';
		const pulse =
			0.5 + 0.5 * Math.sin((now / (fast ? 90 : 220)) % (Math.PI * 2));
		const rx = sprite.displayWidth * 0.42;
		g.fillStyle(color, 0.18 + 0.22 * pulse);
		g.fillEllipse(sprite.x, footY, rx * 2, 12);
		g.lineStyle(1.5, color, 0.4 + 0.4 * pulse);
		g.strokeEllipse(sprite.x, footY, rx * 2, 12);
	}

	const pipY = footY - sprite.displayHeight - 14;
	const pipW = 5;
	const gap = 2;
	const totalW = effects.length * pipW + (effects.length - 1) * gap;
	let px = sprite.x - totalW / 2;
	for (const e of effects) {
		g.fillStyle(STATUS_COLOR[e.kind], 0.95);
		g.fillRect(px, pipY, pipW, pipW);
		px += pipW + gap;
	}
}

/**
 * Debug overlay: a green arrow in the creature's TRUE screen heading (targetDeg,
 * straight from the movement delta) plus the sheet direction block the code
 * currently picked. If the body visually faces away from the arrow, the
 * art<->direction mapping in creatures.ts is off.
 */
export function drawCreatureDebug(refs: EntityRefs): void {
	if (!refs.creature || !(refs.sprite instanceof Phaser.GameObjects.Sprite))
		return;
	const sx = refs.sprite.x;
	const sy = refs.sprite.y - refs.sprite.displayHeight * 0.45;
	if (refs.dbgText) {
		refs.dbgText.setText(
			`${refs.creature.dir} ${Math.round(refs.creature.targetDeg)}°`,
		);
		refs.dbgText.setPosition(sx, sy - 14);
	}
	if (refs.dbgArrow) {
		const rad = (refs.creature.targetDeg * Math.PI) / 180;
		const vx = Math.sin(rad);
		const vy = -Math.cos(rad);
		const len = 34;
		const ex = sx + vx * len;
		const ey = sy + vy * len;
		const g = refs.dbgArrow;
		g.clear();
		g.lineStyle(3, 0x34d399, 1);
		g.beginPath();
		g.moveTo(sx, sy);
		g.lineTo(ex, ey);
		g.strokePath();
		const ah = 8;
		const a1 = rad + Math.PI * 0.85;
		const a2 = rad - Math.PI * 0.85;
		g.beginPath();
		g.moveTo(ex, ey);
		g.lineTo(ex + Math.sin(a1) * ah, ey - Math.cos(a1) * ah);
		g.moveTo(ex, ey);
		g.lineTo(ex + Math.sin(a2) * ah, ey - Math.cos(a2) * ah);
		g.strokePath();
	}
}
