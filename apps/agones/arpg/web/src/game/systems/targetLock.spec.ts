import { describe, it, expect } from 'vitest';
import type { EntityStore } from '@kbve/laser';
import type { EntityRefs } from '../entities/sprites';
import {
	makeTargetLockState,
	lockUnderCursor,
	cycleLock,
	clearLock,
	tickLockValidity,
	lockedAimPoint,
	hostilesByDistance,
	type TargetLockDeps,
} from './targetLock';

const CAT_NPC = 1;

interface FakeEntity {
	tile: { x: number; y: number };
	kind: number;
	corpse?: boolean;
}

function fakeDeps(
	ents: Record<number, FakeEntity>,
	player = { x: 0, y: 0 },
	range = 10,
): TargetLockDeps {
	const store = {
		serverIdsWith: (_c: number) =>
			Object.keys(ents)
				.map(Number)
				.filter((id) => ents[id].kind === CAT_NPC),
		tile: (id: number) => (ents[id] ? { ...ents[id].tile } : null),
		has: (id: number) => ents[id] !== undefined,
		refs: (id: number) => (ents[id] ? ({} as EntityRefs) : undefined),
		at: (x: number, y: number, _except: number) => {
			const id = Object.keys(ents)
				.map(Number)
				.find((k) => ents[k].tile.x === x && ents[k].tile.y === y);
			return id === undefined
				? null
				: { serverEid: id, eid: id, refs: {} as EntityRefs };
		},
	} as unknown as EntityStore<EntityRefs>;
	return {
		store,
		myEid: () => 999,
		isHostile: (id) => ents[id]?.kind === CAT_NPC && !ents[id]?.corpse,
		isCorpse: (id) => ents[id]?.corpse === true,
		playerTile: () => ({ ...player }),
		maxRange: () => range,
	};
}

describe('targetLock', () => {
	it('locks the hostile under the cursor when one is there', () => {
		const deps = fakeDeps({
			1: { tile: { x: 5, y: 0 }, kind: CAT_NPC },
			2: { tile: { x: 2, y: 0 }, kind: CAT_NPC },
		});
		const st = makeTargetLockState();
		const got = lockUnderCursor(st, deps, { x: 5, y: 0 });
		expect(got).toBe(1);
		expect(st.lockedEid).toBe(1);
	});

	it('falls back to nearest hostile when cursor is on empty tile', () => {
		const deps = fakeDeps({
			1: { tile: { x: 5, y: 0 }, kind: CAT_NPC },
			2: { tile: { x: 2, y: 0 }, kind: CAT_NPC },
		});
		const st = makeTargetLockState();
		expect(lockUnderCursor(st, deps, { x: 9, y: 9 })).toBe(2);
	});

	it('cycles nearest-outward and wraps, skipping the current lock', () => {
		const deps = fakeDeps({
			1: { tile: { x: 1, y: 0 }, kind: CAT_NPC },
			2: { tile: { x: 3, y: 0 }, kind: CAT_NPC },
			3: { tile: { x: 6, y: 0 }, kind: CAT_NPC },
		});
		const st = makeTargetLockState();
		lockUnderCursor(st, deps, { x: 1, y: 0 }); // lock 1 (nearest)
		expect(cycleLock(st, deps)).toBe(2);
		expect(cycleLock(st, deps)).toBe(3);
		expect(cycleLock(st, deps)).toBe(1); // wrap
	});

	it('clears the lock', () => {
		const deps = fakeDeps({ 1: { tile: { x: 1, y: 0 }, kind: CAT_NPC } });
		const st = makeTargetLockState();
		lockUnderCursor(st, deps, { x: 1, y: 0 });
		clearLock(st);
		expect(st.lockedEid).toBeNull();
	});

	it('validity: breaks and auto-advances when the target dies', () => {
		const ents: Record<number, FakeEntity> = {
			1: { tile: { x: 1, y: 0 }, kind: CAT_NPC },
			2: { tile: { x: 2, y: 0 }, kind: CAT_NPC },
		};
		const deps = fakeDeps(ents);
		const st = makeTargetLockState();
		lockUnderCursor(st, deps, { x: 1, y: 0 }); // lock 1
		ents[1].corpse = true; // 1 dies
		expect(tickLockValidity(st, deps)).toBe(2); // advanced to next-nearest
		expect(st.lockedEid).toBe(2);
	});

	it('validity: unlocks on death when no other hostile in range', () => {
		const ents: Record<number, FakeEntity> = {
			1: { tile: { x: 1, y: 0 }, kind: CAT_NPC },
		};
		const deps = fakeDeps(ents);
		const st = makeTargetLockState();
		lockUnderCursor(st, deps, { x: 1, y: 0 });
		ents[1].corpse = true;
		expect(tickLockValidity(st, deps)).toBeNull();
		expect(st.lockedEid).toBeNull();
	});

	it('validity: breaks when the target leaves range', () => {
		const ents: Record<number, FakeEntity> = {
			1: { tile: { x: 1, y: 0 }, kind: CAT_NPC },
		};
		const deps = fakeDeps(ents, { x: 0, y: 0 }, 5);
		const st = makeTargetLockState();
		lockUnderCursor(st, deps, { x: 1, y: 0 });
		ents[1].tile = { x: 50, y: 0 }; // far out of range
		expect(tickLockValidity(st, deps)).toBeNull();
	});

	it('lockedAimPoint returns the locked target tile, null when unlocked', () => {
		const deps = fakeDeps({ 1: { tile: { x: 4, y: 2 }, kind: CAT_NPC } });
		const st = makeTargetLockState();
		expect(lockedAimPoint(st, deps)).toBeNull();
		lockUnderCursor(st, deps, { x: 4, y: 2 });
		expect(lockedAimPoint(st, deps)).toEqual({ x: 4, y: 2 });
	});

	it('hostilesByDistance sorts nearest-first, tie-breaks by sid', () => {
		const deps = fakeDeps({
			5: { tile: { x: 2, y: 0 }, kind: CAT_NPC },
			3: { tile: { x: 2, y: 0 }, kind: CAT_NPC },
			1: { tile: { x: 5, y: 0 }, kind: CAT_NPC },
		});
		const order = hostilesByDistance(deps).map((h) => h.sid);
		expect(order).toEqual([3, 5, 1]);
	});
});
