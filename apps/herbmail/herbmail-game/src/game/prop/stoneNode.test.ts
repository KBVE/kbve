import { describe, expect, it } from 'vitest';
import { actionOf, actionsOf, nodesOf } from '../data/professiondb';
import { MINING, nodeForStone } from './stoneNode';

describe('professiondb <-> mapdb mining linkage', () => {
	it('resolves every mining node to a real action', () => {
		const nodes = nodesOf(MINING);
		expect(nodes.length).toBeGreaterThan(0);
		for (const n of nodes) {
			expect(actionOf(MINING, n.professionActionRef)).toBeDefined();
		}
	});

	it('round-trips the action -> node -> action link', () => {
		for (const action of actionsOf(MINING)) {
			if (!action.resourceNodeRef) continue;
			const node = nodesOf(MINING).find(
				(n) => n.ref === action.resourceNodeRef,
			);
			expect(node, `node ${action.resourceNodeRef}`).toBeDefined();
			expect(node?.professionActionRef).toBe(action.ref);
		}
	});

	it('gates the ore veins behind a pickaxe and leaves rubble free', () => {
		const tooled = actionsOf(MINING).filter(
			(a) => (a.toolRefs ?? []).length > 0,
		);
		expect(tooled.map((a) => a.ref).sort()).toEqual([
			'gather-copper-ore',
			'gather-crystal-ore',
			'gather-iron-ore',
		]);
		for (const a of tooled) expect(a.toolRefs).toContain('pickaxe');
	});

	it('only drops gems from tool-gated actions', () => {
		for (const a of actionsOf(MINING)) {
			const chanced = a.outputs.filter((o) => (o.chance ?? 1) < 1);
			if (chanced.length === 0) continue;
			expect(a.toolRefs ?? []).toContain('pickaxe');
		}
	});

	it('is deterministic in (seed, depth)', () => {
		for (let seed = 0; seed < 50; seed++) {
			const a = nodeForStone(seed, 40);
			const b = nodeForStone(seed, 40);
			expect(a.ref).toBe(b.ref);
		}
	});

	it('only yields depth-0 nodes at the entrance', () => {
		const shallow = new Set<string>();
		for (let seed = 0; seed < 400; seed++) {
			shallow.add(nodeForStone(seed, 0).ref);
		}
		for (const ref of shallow) {
			const node = nodesOf(MINING).find((n) => n.ref === ref);
			const action = actionOf(MINING, node!.professionActionRef);
			expect(action?.requiredLevel, ref).toBe(0);
		}
	});

	it('opens up deeper tiers with distance', () => {
		const deep = new Set<string>();
		for (let seed = 0; seed < 400; seed++) {
			deep.add(nodeForStone(seed, 200).ref);
		}
		expect(deep.size).toBeGreaterThan(1);
		expect(deep.has('ore-crystal')).toBe(true);
	});
});
