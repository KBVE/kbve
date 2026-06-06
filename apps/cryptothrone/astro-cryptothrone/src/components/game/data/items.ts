import type { ItemData } from '../types';
import { getAllItems as getCanonicalItems } from './itemdb';

const LOCAL_EXTRAS: ItemData[] = [
	{
		id: 'health-potion',
		name: 'Health Potion',
		type: 'consumable',
		img: '/assets/icons/health-potion.png',
		description: 'Restores 25 HP.',
		bonuses: { hp: 25 },
		durability: 1,
		weight: 0.5,
		actions: ['use', 'drop', 'inspect'],
		rarity: 'common',
	},
];

const canonical = getCanonicalItems();
const canonicalRefs = new Set(canonical.map((i) => i.id));
const items: ItemData[] = [
	...canonical,
	...LOCAL_EXTRAS.filter((extra) => !canonicalRefs.has(extra.id)),
];

const itemMap = new Map(items.map((i) => [i.id, i]));

export function getItemById(id: string): ItemData | undefined {
	return itemMap.get(id);
}

export function getAllItems(): ItemData[] {
	return items;
}
