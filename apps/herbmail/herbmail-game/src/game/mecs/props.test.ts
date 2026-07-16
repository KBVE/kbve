import { beforeEach, describe, it, expect } from 'vitest';
import * as P from './props';

// The dungeon world is a process singleton; reset it before each case.
beforeEach(() => P.resetPropsWorld());

describe('mecs props shim', () => {
	it('spawn + addComponent + query round-trips', () => {
		const w = P.createWorld();
		const e = P.addEntity(w);
		P.addComponent(w, e, P.Prop);
		P.addComponent(w, e, P.Transform3);
		P.Prop.kind[e] = 4;
		P.Transform3.px[e] = 1.5;
		expect(P.query(w, [P.Prop])).toContain(e);
		expect(P.query(w, [P.Prop, P.Transform3])).toContain(e);
		expect(P.Transform3.px[e]).toBeCloseTo(1.5);
		expect(P.Prop.kind[e]).toBe(4);
	});

	it('query requires ALL listed components', () => {
		const w = P.createWorld();
		const a = P.addEntity(w);
		P.addComponent(w, a, P.Prop);
		const b = P.addEntity(w);
		P.addComponent(w, b, P.Prop);
		P.addComponent(w, b, P.Collider);
		expect(P.query(w, [P.Prop]).sort()).toEqual([a, b]);
		expect(P.query(w, [P.Prop, P.Collider])).toEqual([b]);
	});

	it('despawnWhere removes only entities matching field value', () => {
		const w = P.createWorld();
		const a = P.addEntity(w);
		P.addComponent(w, a, P.Prop);
		P.Prop.ownerEid[a] = 7;
		const b = P.addEntity(w);
		P.addComponent(w, b, P.Prop);
		P.Prop.ownerEid[b] = 9;
		expect(P.despawnWhere(w, P.Prop, 'ownerEid', 7)).toBe(1);
		expect(P.query(w, [P.Prop])).toEqual([b]);
	});

	it('applyStats seeds full Health', () => {
		const w = P.createWorld();
		const e = P.addEntity(w);
		P.applyStats(w, e, { maxHp: 3 });
		expect(P.hasComponent(w, e, P.Health)).toBe(true);
		expect(P.Health.hp[e]).toBe(3);
		expect(P.Health.maxHp[e]).toBe(3);
	});

	it('each iterates exactly the matching entities, no allocation of results', () => {
		const w = P.createWorld();
		const ids: number[] = [];
		for (let i = 0; i < 3; i++) {
			const e = P.addEntity(w);
			P.addComponent(w, e, P.Prop);
			ids.push(e);
		}
		const seen: number[] = [];
		P.each(w, [P.Prop], (e) => seen.push(e));
		expect(seen.sort()).toEqual(ids.sort());
	});

	it('removeEntity clears membership and frees the slot', () => {
		const w = P.createWorld();
		const e = P.addEntity(w);
		P.addComponent(w, e, P.Prop);
		P.removeEntity(w, e);
		expect(P.query(w, [P.Prop])).toEqual([]);
		expect(P.addEntity(w)).toBe(e);
	});

	it('resetPropsWorld wipes all entities', () => {
		const w = P.createWorld();
		P.addComponent(w, P.addEntity(w), P.Prop);
		P.addComponent(w, P.addEntity(w), P.Prop);
		P.resetPropsWorld();
		expect(P.query(w, [P.Prop])).toEqual([]);
	});
});
