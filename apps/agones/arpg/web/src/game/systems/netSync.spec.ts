import { describe, it, expect, vi } from 'vitest';
import type {
	EntityDelta,
	StatusView,
	EntityCat,
	EntityStore,
} from '@kbve/laser';
import {
	applyEntitySync,
	type SyncBridge,
	type SyncResolvers,
	type SyncState,
} from './netSync';

type Ref = { id: number };
type Row = {
	tile: { x: number; y: number };
	kind: number;
	effects: StatusView[];
};

// Numeric Cat values (Player=0, Npc=1, Env=3) inlined rather than importing Cat
// as a value — this spec stays free of the @kbve/laser runtime barrel, which is
// unresolvable under vitest's node env.
const CAT_BY_KIND: Record<number, EntityCat> = {
	1: 0,
	2: 1,
	3: 3,
};

// Hand-rolled store so the spec never value-imports ../ecs/store (which pulls the
// @kbve/laser runtime barrel — unresolvable under vitest). Covers only the surface
// applyEntitySync touches.
function fakeStore() {
	const rows = new Map<number, Row>();
	const store = {
		has: (id: number) => rows.has(id),
		spawn: (
			id: number,
			d: {
				tile: { x: number; y: number };
				kind: number;
				effects?: StatusView[];
			},
		) => {
			rows.set(id, {
				tile: { ...d.tile },
				kind: d.kind,
				effects: d.effects ?? [],
			});
			return id;
		},
		update: (
			id: number,
			d: { tile?: { x: number; y: number }; effects?: StatusView[] },
		) => {
			const r = rows.get(id);
			if (!r) return;
			if (d.tile) r.tile = { ...d.tile };
			if (d.effects !== undefined) r.effects = d.effects;
		},
		tile: (id: number) => rows.get(id)?.tile ?? null,
		refs: (id: number) => (rows.has(id) ? ({ id } as Ref) : undefined),
		kind: (id: number) => rows.get(id)?.kind ?? -1,
		despawn: (id: number) => rows.delete(id),
		*entries() {
			for (const [id] of rows)
				yield [id, id, { id } as Ref] as [number, number, Ref];
		},
		effects: (id: number) => rows.get(id)?.effects ?? [],
	};
	return store as unknown as EntityStore<Ref> & {
		effects: (id: number) => StatusView[];
	};
}

function bridge(): SyncBridge<Ref> {
	return {
		create: (e) => ({ id: e.eid }),
		move: () => {},
		setPos: () => {},
		follow: () => {},
		remove: () => {},
	};
}

const resolvers: SyncResolvers = {
	cat: (kind) => CAT_BY_KIND[kind] ?? 'item',
	hostile: () => false,
	label: () => undefined,
};

function delta(
	eid: number,
	kind: number,
	x: number,
	y: number,
	effects?: StatusView[],
): EntityDelta {
	return {
		eid,
		kind,
		owner: 0,
		tile: { x, y },
		facing: 'Down',
		sub: 0,
		hp: 100,
		max_hp: 100,
		destroyed: false,
		effects,
	};
}

function state(): SyncState {
	return {
		myEid: -1,
		mySlot: 99,
		predicted: { x: 0, y: 0 },
		predictSeeded: false,
	};
}

describe('applyEntitySync env-change signal', () => {
	it('fires onEnvChange on env spawn, move, despawn — not for non-env', () => {
		const store = fakeStore();
		const onEnv = vi.fn();

		applyEntitySync(
			[delta(2, 2, 5, 5)],
			store,
			bridge(),
			resolvers,
			state(),
			onEnv,
		);
		expect(onEnv).not.toHaveBeenCalled();

		applyEntitySync(
			[delta(2, 2, 5, 5), delta(7, 3, 3, 3)],
			store,
			bridge(),
			resolvers,
			state(),
			onEnv,
		);
		expect(onEnv).toHaveBeenCalledTimes(1);

		onEnv.mockClear();
		applyEntitySync(
			[delta(2, 2, 5, 5), delta(7, 3, 4, 3)],
			store,
			bridge(),
			resolvers,
			state(),
			onEnv,
		);
		expect(onEnv).toHaveBeenCalledTimes(1);

		onEnv.mockClear();
		applyEntitySync(
			[delta(2, 2, 5, 5)],
			store,
			bridge(),
			resolvers,
			state(),
			onEnv,
		);
		expect(onEnv).toHaveBeenCalledTimes(1);
	});
});

describe('applyEntitySync eid recycling (reconnect / space return)', () => {
	it('resprites an eid that returns as a different kind', () => {
		const store = fakeStore();
		const br = bridge();
		const created: number[] = [];
		const removed: number[] = [];
		br.create = (e) => {
			created.push(e.eid);
			return { id: e.eid };
		};
		br.remove = (_r, id) => {
			removed.push(id);
		};

		applyEntitySync([delta(8, 3, 5, 5)], store, br, resolvers, state());
		expect(store.kind(8)).toBe(3);

		applyEntitySync([delta(8, 1, 6, 6)], store, br, resolvers, state());
		expect(removed).toContain(8);
		expect(store.kind(8)).toBe(1);
		expect(created.filter((e) => e === 8).length).toBe(2);
	});

	it('reclaims myEid for a pre-existing player entity on reconnect', () => {
		const store = fakeStore();
		const s = state();
		s.mySlot = 0;

		applyEntitySync([delta(1, 1, 4, 4)], store, bridge(), resolvers, s);
		expect(s.myEid).toBe(1);

		s.myEid = -1;
		applyEntitySync([delta(1, 1, 4, 4)], store, bridge(), resolvers, s);
		expect(s.myEid).toBe(1);
	});

	it('claims only the player owned by my slot', () => {
		const store = fakeStore();
		const s = state();
		s.mySlot = 7;
		const other = { ...delta(2, 1, 3, 3), owner: 4 };
		const mine = { ...delta(1, 1, 2, 2), owner: 7 };
		applyEntitySync([other, mine], store, bridge(), resolvers, s);
		expect(s.myEid).toBe(1);
	});

	it('drops myEid when its eid is recycled to a non-player kind', () => {
		const store = fakeStore();
		const s = state();
		s.mySlot = 0;

		applyEntitySync([delta(1, 1, 2, 2)], store, bridge(), resolvers, s);
		expect(s.myEid).toBe(1);

		const tree = delta(1, 3, 2, 2);
		const me = { ...delta(5, 1, 4, 4), owner: 0 };
		applyEntitySync([tree, me], store, bridge(), resolvers, s);
		expect(store.kind(1)).toBe(3);
		expect(s.myEid).toBe(5);
	});
});

describe('applyEntitySync effects passthrough', () => {
	it('stores effects on spawn and replaces them on update', () => {
		const store = fakeStore();
		const burn: StatusView[] = [{ kind: 'Burn', remaining: 30 }];

		applyEntitySync(
			[delta(2, 2, 5, 5, burn)],
			store,
			bridge(),
			resolvers,
			state(),
		);
		expect(store.effects(2)).toEqual(burn);

		applyEntitySync(
			[delta(2, 2, 5, 5, [])],
			store,
			bridge(),
			resolvers,
			state(),
		);
		expect(store.effects(2)).toEqual([]);
	});
});
