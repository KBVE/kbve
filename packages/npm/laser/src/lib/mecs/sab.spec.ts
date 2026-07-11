import { describe, it, expect } from 'vitest';
import { createSabWorld, sabBytes, type Schema } from './sab';

const SCHEMA = {
	Transform: {
		px: 'f32',
		py: 'f32',
		pz: 'f32',
		qx: 'f32',
		qy: 'f32',
		qz: 'f32',
		qw: 'f32',
	},
	Health: { hp: 'f32', max: 'f32' },
	Flags: { mask: 'u32' },
} satisfies Schema;

const CAP = 128;

function makeWorld() {
	const buf = new ArrayBuffer(sabBytes(SCHEMA, CAP));
	return createSabWorld(buf, SCHEMA, CAP);
}

describe('mecs sab world', () => {
	it('spawns dense ascending eids and tracks count', () => {
		const w = makeWorld();
		expect(w.count()).toBe(0);
		const a = w.spawn();
		const b = w.spawn();
		expect(a).toBe(0);
		expect(b).toBe(1);
		expect(w.count()).toBe(2);
		expect(w.isAlive(a)).toBe(true);
	});

	it('reuses despawned slots', () => {
		const w = makeWorld();
		const a = w.spawn();
		w.spawn();
		w.despawn(a);
		expect(w.isAlive(a)).toBe(false);
		expect(w.spawn()).toBe(a);
	});

	it('component add/remove drives has() and query()', () => {
		const w = makeWorld();
		const a = w.spawn();
		const b = w.spawn();
		w.add(a, 'Health');
		w.add(a, 'Transform');
		w.add(b, 'Transform');
		expect(w.has(a, 'Health')).toBe(true);
		expect(w.has(b, 'Health')).toBe(false);
		expect(w.query(['Transform']).sort()).toEqual([a, b]);
		expect(w.query(['Transform', 'Health'])).toEqual([a]);
	});

	it('stores read/write through typed views', () => {
		const w = makeWorld();
		const e = w.spawn();
		w.add(e, 'Transform');
		w.stores.Transform.px[e] = 3.5;
		w.stores.Transform.qw[e] = 1;
		expect(w.stores.Transform.px[e]).toBeCloseTo(3.5);
		expect(w.stores.Transform.qw[e]).toBe(1);
	});

	it('despawn clears component membership', () => {
		const w = makeWorld();
		const e = w.spawn();
		w.add(e, 'Health');
		w.despawn(e);
		const e2 = w.spawn();
		expect(e2).toBe(e);
		expect(w.has(e2, 'Health')).toBe(false);
	});

	it('two worlds over one buffer share membership + data (cross-thread model)', () => {
		const buf = new ArrayBuffer(sabBytes(SCHEMA, CAP));
		const writer = createSabWorld(buf, SCHEMA, CAP);
		const reader = createSabWorld(buf, SCHEMA, CAP);
		const e = writer.spawn();
		writer.add(e, 'Transform');
		writer.stores.Transform.px[e] = 42;
		expect(reader.isAlive(e)).toBe(true);
		expect(reader.query(['Transform'])).toEqual([e]);
		expect(reader.stores.Transform.px[e]).toBe(42);
	});

	it('rejects cap mismatch on re-attach', () => {
		const buf = new ArrayBuffer(sabBytes(SCHEMA, CAP + 32));
		createSabWorld(buf, SCHEMA, CAP);
		expect(() => createSabWorld(buf, SCHEMA, CAP + 32)).toThrow(/cap/);
	});

	it('seqlock gen advances around a write', () => {
		const w = makeWorld();
		const g0 = w.gen();
		w.beginWrite();
		expect(w.gen() & 1).toBe(1);
		w.endWrite();
		expect(w.gen()).toBe(g0 + 2);
	});

	it('clear() wipes membership and reuses eid 0', () => {
		const w = makeWorld();
		const a = w.spawn();
		w.add(a, 'Health');
		w.spawn();
		w.clear();
		expect(w.count()).toBe(0);
		expect(w.isAlive(a)).toBe(false);
		expect(w.query(['Health'])).toEqual([]);
		expect(w.spawn()).toBe(0);
	});

	it('fills to capacity then returns -1', () => {
		const w = makeWorld();
		for (let i = 0; i < CAP; i++) expect(w.spawn()).toBe(i);
		expect(w.spawn()).toBe(-1);
		expect(w.count()).toBe(CAP);
	});
});
