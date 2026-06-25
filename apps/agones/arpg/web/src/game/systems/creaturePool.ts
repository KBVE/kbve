import type { EntityRefs } from '../entities/sprites';

/**
 * Reuse pool for animated creature display objects, keyed by creature def id.
 * Streaming NPCs (apex predators) are culled + respawned constantly as players
 * roam; rebuilding their packed-spritesheet Sprite each time is the expensive
 * part. On despawn we park the Sprite (+ baked shadow + view) here; the next
 * spawn of the same def wakes it instead of allocating a fresh one. The cheap
 * per-entity bits (hp bar, status fx, nameplate) are rebuilt on wake.
 *
 * Parked refs carry only `sprite`, `shadow`, and `creature` — the caller strips
 * and destroys the rest before releasing.
 */
export class CreaturePool {
	private idle = new Map<string, EntityRefs[]>();

	acquire(defId: string): EntityRefs | null {
		const list = this.idle.get(defId);
		return list && list.length ? (list.pop() ?? null) : null;
	}

	release(defId: string, refs: EntityRefs): void {
		let list = this.idle.get(defId);
		if (!list) {
			list = [];
			this.idle.set(defId, list);
		}
		list.push(refs);
	}
}
