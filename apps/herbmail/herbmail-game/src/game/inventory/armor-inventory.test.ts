import { describe, it, expect } from 'vitest';
import { getItems } from './store';
import { ARMOR_ITEM_IDS, isArmorItem, itemDef } from './items';
import { getEquipped, setArmor } from '../character/armor';

const inGrid = (id: string) => getItems().some((p) => p.itemId === id);

describe('armor inventory bridge', () => {
	it('every armor piece is a registered inventory item', () => {
		for (const id of ARMOR_ITEM_IDS) {
			expect(isArmorItem(id)).toBe(true);
			expect(itemDef(id)).toBeTruthy();
		}
	});

	it('every armor piece starts unequipped in the grid', () => {
		for (const id of ARMOR_ITEM_IDS) {
			expect(getEquipped().has(id)).toBe(false);
			expect(inGrid(id)).toBe(true);
		}
	});

	it('equipping a piece removes it from the grid', () => {
		setArmor('helmet', true);
		expect(inGrid('helmet')).toBe(false);
		expect(getEquipped().has('helmet')).toBe(true);
	});

	it('unequipping refits the piece back into the grid', () => {
		setArmor('helmet', true);
		setArmor('helmet', false);
		expect(inGrid('helmet')).toBe(true);
		expect(getEquipped().has('helmet')).toBe(false);
	});

	it('never duplicates a piece across equip/unequip cycles', () => {
		for (let i = 0; i < 3; i++) {
			setArmor('bracerL', true);
			setArmor('bracerL', false);
		}
		const count = getItems().filter((p) => p.itemId === 'bracerL').length;
		expect(count).toBe(1);
	});
});
