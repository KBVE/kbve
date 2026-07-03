import Phaser from 'phaser';
import { EntityStore } from '@kbve/laser';
import type { EntityRefs } from '../entities/sprites';
import { DEPTH_UI } from '../config';

/**
 * Lock reticle: a ring pinned to the locked target's on-screen sprite (already
 * hover-adjusted for flyers). Render-only — reads the locked eid each frame and
 * draws; holds no game state.
 */
export interface LockReticleHandle {
	update(lockedEid: number | null): void;
	destroy(): void;
}

const RING_COLOR = 0xf87171;
const RING_RADIUS = 26;

export function makeLockReticle(
	scene: Phaser.Scene,
	store: EntityStore<EntityRefs>,
): LockReticleHandle {
	const g = scene.add.graphics();
	g.setDepth(DEPTH_UI + 1);
	let phase = 0;
	return {
		update(lockedEid: number | null) {
			g.clear();
			if (lockedEid == null) return;
			const refs = store.refs(lockedEid);
			const sprite = refs?.sprite;
			if (!sprite) return;
			phase = (phase + 0.08) % (Math.PI * 2);
			const pulse = RING_RADIUS + Math.sin(phase) * 3;
			g.lineStyle(2, RING_COLOR, 0.9);
			g.strokeCircle(sprite.x, sprite.y, pulse);
		},
		destroy() {
			g.destroy();
		},
	};
}
