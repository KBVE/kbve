import { describe, it, expect } from 'vitest';
import {
	chebyshev,
	resolveClick,
	resolvePending,
	nearestAdjacentNpc,
	adjacentFreeTile,
	type ClickHit,
} from './interaction';

const item = (eid: number): ClickHit => ({ eid, cat: 'item', hasRef: true });
const npc = (eid: number, hasRef = true): ClickHit => ({
	eid,
	cat: 'npc',
	hasRef,
});
const player = (eid: number): ClickHit => ({
	eid,
	cat: 'player',
	hasRef: false,
});

describe('chebyshev', () => {
	it('is the king-move distance', () => {
		expect(chebyshev({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
		expect(chebyshev({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(1);
		expect(chebyshev({ x: 0, y: 0 }, { x: 3, y: 1 })).toBe(3);
	});
});

describe('resolveClick', () => {
	it('empty tile → move', () => {
		expect(resolveClick(null, false)).toEqual({ kind: 'move' });
	});

	it('item: pickup when adjacent, pickup-move when far', () => {
		expect(resolveClick(item(2), true)).toEqual({ kind: 'pickup', eid: 2 });
		expect(resolveClick(item(2), false)).toEqual({
			kind: 'pickup-move',
			eid: 2,
		});
	});

	it('npc: interact when adjacent with a ref, interact-move otherwise', () => {
		expect(resolveClick(npc(5), true)).toEqual({
			kind: 'interact',
			eid: 5,
		});
		expect(resolveClick(npc(5), false)).toEqual({
			kind: 'interact-move',
			eid: 5,
		});
	});

	it('npc adjacent but ref-less → interact-move (walk, resolve on arrival)', () => {
		expect(resolveClick(npc(5, false), true)).toEqual({
			kind: 'interact-move',
			eid: 5,
		});
	});

	it('another player → plain move', () => {
		expect(resolveClick(player(9), true)).toEqual({ kind: 'move' });
	});
});

describe('resolvePending', () => {
	const me = { x: 5, y: 5 };
	it('cancels when the target is gone', () => {
		expect(resolvePending('pickup', me, null)).toBe('cancel');
		expect(resolvePending('interact', null, { x: 5, y: 5 })).toBe('cancel');
	});
	it('waits while out of range', () => {
		expect(resolvePending('pickup', me, { x: 9, y: 9 })).toBe('wait');
	});
	it('fires the queued kind once adjacent', () => {
		expect(resolvePending('pickup', me, { x: 6, y: 5 })).toBe('pickup');
		expect(resolvePending('interact', me, { x: 4, y: 4 })).toBe('interact');
	});
});

describe('nearestAdjacentNpc', () => {
	const me = { x: 5, y: 5 };
	it('returns null when nothing is adjacent', () => {
		expect(
			nearestAdjacentNpc(me, [{ eid: 1, tile: { x: 8, y: 8 } }]),
		).toBeNull();
	});
	it('picks the closest in-range npc', () => {
		const got = nearestAdjacentNpc(me, [
			{ eid: 1, tile: { x: 4, y: 4 } }, // dist 1
			{ eid: 2, tile: { x: 5, y: 6 } }, // dist 1 (first wins on tie)
			{ eid: 3, tile: { x: 9, y: 9 } }, // out of range
		]);
		expect(got).toBe(1);
	});
});

describe('adjacentFreeTile', () => {
	const open = () => false;
	const noneOccupied = () => false;

	it('returns the neighbour closest to `from`', () => {
		// target at 5,5; from at 3,5 → the tile at 4,5 (west) is closest.
		const got = adjacentFreeTile(
			{ x: 5, y: 5 },
			{ x: 3, y: 5 },
			open,
			noneOccupied,
		);
		expect(got).toEqual({ x: 4, y: 5 });
	});

	it('skips blocked and occupied neighbours', () => {
		const blocked = (x: number, y: number) => x === 4 && y === 5;
		const occupied = (t: { x: number; y: number }) =>
			t.x === 4 && t.y === 4;
		const got = adjacentFreeTile(
			{ x: 5, y: 5 },
			{ x: 3, y: 5 },
			blocked,
			occupied,
		);
		expect(got).not.toEqual({ x: 4, y: 5 });
		expect(got).not.toEqual({ x: 4, y: 4 });
	});

	it('falls back to the target when fully boxed in', () => {
		const got = adjacentFreeTile(
			{ x: 5, y: 5 },
			{ x: 3, y: 5 },
			() => true,
			noneOccupied,
		);
		expect(got).toEqual({ x: 5, y: 5 });
	});
});
