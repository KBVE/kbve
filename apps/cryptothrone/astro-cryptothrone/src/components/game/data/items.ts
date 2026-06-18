import type { ItemData } from '../types';
import { getAllItems as getCanonicalItems } from './itemdb';

export { getItemPrice } from './itemdb';

const LOCAL_EXTRAS: ItemData[] = [
	{
		id: 'health-potion',
		name: 'Health Potion',
		type: 'consumable',
		key: 0,
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

const stealLootPool: ItemData[] = items.filter(
	(i) =>
		i.type !== 'quest' &&
		(i.rarity === 'common' || i.rarity === 'uncommon'),
);

export function getStealLootPool(): ItemData[] {
	return stealLootPool;
}

export function pickStealLoot(
	roll: number = Math.random(),
): ItemData | undefined {
	if (stealLootPool.length === 0) return undefined;
	const idx = Math.min(
		stealLootPool.length - 1,
		Math.max(0, Math.floor(roll * stealLootPool.length)),
	);
	return stealLootPool[idx];
}
