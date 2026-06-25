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
import { placeNameplate, drawCreatureDebug } from './entityView';
import { DEBUG_CREATURE_DIRS } from '../entities/creatures';

// Locomotion smoothing: ignore sub-pixel velocity noise, and hold Walking for a
// grace window after the last real movement so brief interp plateaus between
// tiles don't flap the pose back to Idle and restart the wing-flap.
const MOVE_EPS = 2e-3;
const MOVE_IDLE_GRACE_MS = 180;

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
		const def = refs.creature.def;
		const groundY = p.y + 8;
		const baseDepth =
			DEPTH_ENTITY_BASE + tileDepth(Math.round(s.x), Math.round(s.y));
		// Flyers hover above their ground tile (the shadow stays grounded) and sort
		// into a sky band so they draw over trees/props instead of being occluded.
		refs.sprite.setPosition(p.x, groundY - (def.hover ?? 0));
		refs.sprite.setDepth(baseDepth + (def.depthBias ?? 0));
		if (refs.shadow) {
			refs.shadow.setPosition(p.x, groundY);
			refs.shadow.setDepth(baseDepth - 1);
			// Frame-lock the ground shadow to the body's pose (shared layout → same
			// frame index). Skip until both sheets are resident, else __MISSING warns.
			if (
				refs.sprite.texture.key !== '__MISSING' &&
				refs.shadow.texture.key !== '__MISSING'
			) {
				refs.shadow.setFrame(refs.sprite.frame.name);
			}
		}
		placeNameplate(refs);
		const st = refs.creature.state;
		if (st !== 'Idle' && st !== 'Walking' && st !== 'Running') continue;
		const moving =
			s.moving &&
			(Math.abs(s.vx) > MOVE_EPS || Math.abs(s.vy) > MOVE_EPS);
		if (moving) {
			refs.lastMoveAt = scene.time.now;
			setCreaturePose(refs.sprite, refs.creature, 'Walking', {
				dx: s.vx,
				dy: s.vy,
			});
		} else if (
			st !== 'Idle' &&
			scene.time.now - (refs.lastMoveAt ?? 0) > MOVE_IDLE_GRACE_MS
		) {
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
