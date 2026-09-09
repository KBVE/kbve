import { describe, it, expect, beforeEach } from 'vitest';
import * as P from './props';
import { spawnPropBase } from '../prop/base';

const POS: [number, number, number] = [1, 0, 1];
const DIR: [number, number, number] = [0, 1, 0];

describe('owner index', () => {
	beforeEach(() => P.resetPropsWorld());

	it('tracks spawned props per owner', () => {
		const w = P.createWorld();
		const a = spawnPropBase(w, 1, 7, POS, DIR);
		const b = spawnPropBase(w, 1, 7, POS, DIR);
		const c = spawnPropBase(w, 1, 9, POS, DIR);
		expect([...P.membersOf(7)].sort()).toEqual([a, b].sort());
		expect([...P.membersOf(9)]).toEqual([c]);
		expect([...P.membersOf(42)]).toEqual([]);
	});

	it('despawnWhere drops membership', () => {
		const w = P.createWorld();
		spawnPropBase(w, 1, 7, POS, DIR);
		spawnPropBase(w, 1, 9, POS, DIR);
		P.despawnWhere(w, P.Prop, 'ownerEid', 7);
		expect([...P.membersOf(7)]).toEqual([]);
		expect([...P.membersOf(9)]).toHaveLength(1);
	});

	it('removeEntity drops a single membership', () => {
		const w = P.createWorld();
		const a = spawnPropBase(w, 1, 7, POS, DIR);
		const b = spawnPropBase(w, 1, 7, POS, DIR);
		P.removeEntity(w, a);
		expect([...P.membersOf(7)]).toEqual([b]);
	});

	it('resetPropsWorld clears the index', () => {
		const w = P.createWorld();
		spawnPropBase(w, 1, 7, POS, DIR);
		P.resetPropsWorld();
		expect([...P.membersOf(7)]).toEqual([]);
	});

	it('eachOwned visits only owner members carrying the terms', () => {
		const w = P.createWorld();
		const a = spawnPropBase(w, 1, 7, POS, DIR);
		const b = spawnPropBase(w, 1, 7, POS, DIR);
		spawnPropBase(w, 1, 9, POS, DIR);
		P.addComponent(w, a, P.LightEmitter);
		const seen: number[] = [];
		P.eachOwned(7, [P.LightEmitter, P.Transform3], (eid) => seen.push(eid));
		expect(seen).toEqual([a]);
		expect(seen).not.toContain(b);
	});

	it('matches a full each() scan for the same terms', () => {
		const w = P.createWorld();
		const owners = [7, 9, 11];
		for (const o of owners)
			for (let i = 0; i < 5; i++) {
				const e = spawnPropBase(w, 1, o, POS, DIR);
				if (i % 2 === 0) P.addComponent(w, e, P.LightEmitter);
			}
		const terms = [P.LightEmitter, P.Transform3];
		const full: number[] = [];
		P.each(w, terms, (eid) => full.push(eid));
		const scoped: number[] = [];
		for (const o of owners)
			P.eachOwned(o, terms, (eid) => scoped.push(eid));
		expect(scoped.sort()).toEqual(full.sort());
	});
});
