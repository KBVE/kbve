import { describe, it, expect, vi } from 'vitest';
import type { EntityDelta, StatusView } from '@kbve/laser';
import type { EntityCat, EntityStore } from '../ecs/store';
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

const CAT_BY_KIND: Record<number, EntityCat> = {
	1: 'player',
	2: 'npc',
	3: 'env',
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
