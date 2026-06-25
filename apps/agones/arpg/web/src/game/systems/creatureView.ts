import Phaser from 'phaser';
import { EntityStore } from '@kbve/laser';
import { DEPTH_ENTITY_BASE } from '../config';
import { worldToScreen, tileDepth } from '../iso';
import { sampleAt, INTERP_DELAY_MS } from './interp';
import {
	setCreaturePose,
	tickClassFacing,
	tickCreatureFacing,
	type EntityRefs,
} from '../entities/sprites';
import { syncShadow, placeNameplate, drawCreatureDebug } from './entityView';
import { DEBUG_CREATURE_DIRS } from '../entities/creatures';

/**
 * Render-interpolate every creature entity: sample its interp buffer at the
 * delayed render time, place the sprite/shadow/nameplate, and drive its
 * locomotion pose (Walking/Idle) off the sampled velocity. Remote-mover smoothing
 * — the local player is float-driven elsewhere.
 */
export function tickCreatureInterp<R extends EntityRefs>(
	scene: Phaser.Scene,
	store: EntityStore<R>,
): void {
	const renderTime = scene.time.now - INTERP_DELAY_MS;
	for (const [, , refs] of store.entries()) {
		if (!refs.interp || !refs.creature) continue;
		if (!(refs.sprite instanceof Phaser.GameObjects.Sprite)) continue;
		const s = sampleAt(refs.interp, renderTime);
		if (!s) continue;
		const p = worldToScreen(s.x, s.y);
		refs.sprite.setPosition(p.x, p.y + 8);
		refs.sprite.setDepth(
			DEPTH_ENTITY_BASE + tileDepth(Math.round(s.x), Math.round(s.y)),
		);
		syncShadow(refs);
		placeNameplate(refs);
		const st = refs.creature.state;
		if (st !== 'Idle' && st !== 'Walking' && st !== 'Running') continue;
		if (s.moving && (Math.abs(s.vx) > 1e-4 || Math.abs(s.vy) > 1e-4)) {
			setCreaturePose(refs.sprite, refs.creature, 'Walking', {
				dx: s.vx,
				dy: s.vy,
			});
		} else {
			setCreaturePose(refs.sprite, refs.creature, 'Idle');
		}
	}
}

/** Lerp every class + creature entity's facing toward its movement target. */
export function tickFacing<R extends EntityRefs>(store: EntityStore<R>): void {
	for (const [, , refs] of store.entries()) {
		if (refs.cls && refs.sprite instanceof Phaser.GameObjects.Sprite) {
			tickClassFacing(refs.sprite, refs.cls);
		} else if (
			refs.creature &&
			refs.sprite instanceof Phaser.GameObjects.Sprite
		) {
			tickCreatureFacing(refs.sprite, refs.creature);
			if (DEBUG_CREATURE_DIRS) drawCreatureDebug(refs);
		}
	}
}
