import { describe, it, expect } from 'vitest';
import type { EntityDelta } from '@kbve/laser';
import { EntityStore, type EntityCat } from '../ecs/store';
import {
	applyEntitySync,
	type SyncBridge,
	type SyncResolvers,
	type SyncState,
} from './netSync';

interface Ref {
	id: number;
}

// Kind convention for the stubs: 1 = player, 2 = npc, 3 = item; 9 = hostile npc.
function delta(p: {
	eid: number;
	kind: number;
	owner?: number;
	x: number;
	y: number;
	hp?: number;
	maxHp?: number;
	qx?: number;
	qy?: number;
	inputAck?: number;
}): EntityDelta {
	return {
		eid: p.eid,
		kind: p.kind,
		owner: p.owner ?? 0xffff,
		tile: { x: p.x, y: p.y },
		hp: p.hp ?? 10,
		max_hp: p.maxHp ?? 10,
		qx: p.qx,
		qy: p.qy,
		input_ack: p.inputAck,
	} as unknown as EntityDelta;
}

function harness(mySlot = 7) {
	const store = new EntityStore<Ref>();
	const calls: string[] = [];
	const bridge: SyncBridge<Ref> = {
		create: (e) => {
			calls.push(`create:${e.eid}`);
			return { id: e.eid };
		},
		move: (r, t) => calls.push(`move:${r.id}->${t.x},${t.y}`),
		follow: (r) => calls.push(`follow:${r.id}`),
		remove: (r) => calls.push(`remove:${r.id}`),
	};
	const resolve: SyncResolvers = {
		cat: (k): EntityCat => (k === 1 ? 'player' : k === 3 ? 'item' : 'npc'),
		hostile: (k) => k === 9,
		label: (e, cat) => `${cat}:${e.eid}`,
	};
	const state: SyncState = {
		myEid: -1,
		mySlot,
		predicted: { x: 0, y: 0 },
		predictSeeded: false,
	};
	return { store, calls, bridge, resolve, state };
}

describe('applyEntitySync', () => {
	it('spawns new entities and stores their data', () => {
		const h = harness();
		applyEntitySync(
			[delta({ eid: 2, kind: 2, x: 3, y: 4, hp: 6 })],
			h.store,
			h.bridge,
			h.resolve,
			h.state,
		);
		expect(h.store.has(2)).toBe(true);
		expect(h.store.tile(2)).toEqual({ x: 3, y: 4 });
		expect(h.store.hp(2)).toBe(6);
		expect(h.calls).toContain('create:2');
	});

	it('seeds myEid + prediction on the local player and follows it', () => {
		const h = harness(7);
		applyEntitySync(
			[delta({ eid: 1, kind: 1, owner: 7, x: 5, y: 5 })],
			h.store,
			h.bridge,
			h.resolve,
			h.state,
		);
		expect(h.state.myEid).toBe(1);
		expect(h.state.predictSeeded).toBe(true);
		expect(h.state.predicted).toEqual({ x: 5, y: 5 });
		expect(h.calls).toContain('follow:1');
	});

	it('does NOT claim a player owned by another slot', () => {
		const h = harness(7);
		applyEntitySync(
			[delta({ eid: 1, kind: 1, owner: 99, x: 5, y: 5 })],
			h.store,
			h.bridge,
			h.resolve,
			h.state,
		);
		expect(h.state.myEid).toBe(-1);
	});

	it('exposes the server float pos + input ack for the local player', () => {
		const h = harness(7);
		// Spawn frame seeds myEid; serverPos stays undefined (the scene seeds its
		// float body from the tile via `serverPos ?? predicted`).
		applyEntitySync(
			[delta({ eid: 1, kind: 1, owner: 7, x: 5, y: 5 })],
			h.store,
			h.bridge,
			h.resolve,
			h.state,
		);
		expect(h.state.serverPos).toBeUndefined();
		expect(h.state.predicted).toEqual({ x: 5, y: 5 });

		// Next sync (already in store, no qx/qy) → server pos falls back to tile.
		applyEntitySync(
			[delta({ eid: 1, kind: 1, owner: 7, x: 5, y: 5 })],
			h.store,
			h.bridge,
			h.resolve,
			h.state,
		);
		expect(h.state.serverPos).toEqual({ x: 5, y: 5 });

		// qx/qy are quantized at POS_SCALE=32; predicted always tracks the
		// authoritative tile while the scene reconciles its float body itself.
		applyEntitySync(
			[
				delta({
					eid: 1,
					kind: 1,
					owner: 7,
					x: 6,
					y: 5,
					qx: 6 * 32 + 16,
					qy: 5 * 32,
					inputAck: 4,
				}),
			],
			h.store,
			h.bridge,
			h.resolve,
			h.state,
		);
		expect(h.state.predicted).toEqual({ x: 6, y: 5 });
		expect(h.state.serverPos).toEqual({ x: 6.5, y: 5 });
		expect(h.state.inputAck).toBe(4);
	});

	it('interpolates other entities toward the authoritative tile', () => {
		const h = harness();
		applyEntitySync(
			[delta({ eid: 2, kind: 2, x: 1, y: 1 })],
			h.store,
			h.bridge,
			h.resolve,
			h.state,
		);
		applyEntitySync(
			[delta({ eid: 2, kind: 2, x: 2, y: 1 })],
			h.store,
			h.bridge,
			h.resolve,
			h.state,
		);
		expect(h.calls).toContain('move:2->2,1');
		expect(h.store.tile(2)).toEqual({ x: 2, y: 1 });
	});

	it('despawns entities absent from the snapshot and returns their ids', () => {
		const h = harness(7);
		applyEntitySync(
			[
				delta({ eid: 1, kind: 1, owner: 7, x: 5, y: 5 }),
				delta({ eid: 2, kind: 2, x: 3, y: 3 }),
			],
			h.store,
			h.bridge,
			h.resolve,
			h.state,
		);
		// next snapshot drops both 2 and the local player
		const gone = applyEntitySync([], h.store, h.bridge, h.resolve, h.state);
		expect(gone.sort()).toEqual([1, 2]);
		expect(h.store.has(2)).toBe(false);
		expect(h.state.myEid).toBe(-1);
		expect(h.calls).toContain('remove:2');
	});
});
