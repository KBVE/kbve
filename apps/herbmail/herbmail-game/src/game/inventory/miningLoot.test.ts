import { describe, expect, it } from 'vitest';
import { actionsOf } from '../data/professiondb';
import { MINING } from '../prop/stoneNode';
import { itemByRef } from '../data/itemdb';
import { itemDef } from './items';
import { addLoot, getItems, removeItem } from './store';

// addLoot silently no-ops when an id has no ItemDef, so a mining output that
// never got registered would vanish on pickup with no error anywhere. These
// assert the whole professiondb -> itemdb -> inventory chain resolves.
const outputRefs = [
	...new Set(
		actionsOf(MINING).flatMap((a) => a.outputs.map((o) => o.itemRef)),
	),
];

describe('mining loot reaches the inventory', () => {
	it('has outputs to check', () => {
		expect(outputRefs.length).toBeGreaterThan(0);
	});

	it('resolves every mining output in itemdb', () => {
		for (const ref of outputRefs) {
			expect(itemByRef(ref), `itemdb missing ${ref}`).toBeDefined();
		}
	});

	it('registers every mining output as an inventory item', () => {
		for (const ref of outputRefs) {
			const def = itemDef(ref);
			expect(def, `no ItemDef for ${ref}`).toBeDefined();
			expect(def!.fp.w).toBeGreaterThan(0);
			expect(def!.fp.h).toBeGreaterThan(0);
		}
	});

	it('actually places each output into the grid', () => {
		for (const ref of outputRefs) {
			const before = new Set(getItems().map((i) => i.uid));
			expect(addLoot(ref), `addLoot rejected ${ref}`).toBe(true);
			const added = getItems().find((i) => !before.has(i.uid));
			expect(added?.itemId, `${ref} not placed`).toBe(ref);
			removeItem(added!.uid);
		}
	});

	it('covers all four gems', () => {
		for (const gem of ['emerald', 'sapphire', 'ruby', 'diamond']) {
			expect(outputRefs, `${gem} is not a mining output`).toContain(gem);
		}
	});
});
