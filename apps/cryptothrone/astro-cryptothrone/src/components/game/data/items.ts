import type { ItemData } from '../types';

const ITEMS: ItemData[] = [
	{
		id: 'item_health_potion',
		name: 'Health Potion',
		type: 'consumable',
		img: '/assets/icons/health_potion.png',
		description: 'Restores 25 HP',
		bonuses: { hp: 25 },
		durability: 1,
		weight: 0.5,
		actions: ['use', 'drop', 'inspect'],
	},
	{
		id: 'item_mana_potion',
		name: 'Mana Potion',
		type: 'consumable',
		img: '/assets/icons/mana_potion.png',
		description: 'Restores 20 MP',
		bonuses: { mp: 20 },
		durability: 1,
		weight: 0.5,
		actions: ['use', 'drop', 'inspect'],
	},
	{
		id: 'item_iron_sword',
		name: 'Iron Sword',
		type: 'weapon',
		img: '/assets/icons/iron_sword.png',
		description: 'A sturdy iron sword',
		bonuses: { attack: 5 },
		durability: 100,
		weight: 3,
		actions: ['equip', 'drop', 'inspect'],
	},
	{
		id: 'item_salmon',
		name: 'Salmon',
		type: 'consumable',
		img: '/assets/icons/salmon.png',
		description: 'A fresh salmon. Restores 10 HP.',
		bonuses: { hp: 10 },
		durability: 1,
		weight: 1,
		actions: ['use', 'drop', 'inspect'],
	},
	{
		id: 'item_blue_shark',
		name: 'Blue Shark',
		type: 'consumable',
		img: '/assets/icons/blue_shark.png',
		description: 'A rare blue shark. Restores 30 HP.',
		bonuses: { hp: 30 },
		durability: 1,
		weight: 2,
		actions: ['use', 'drop', 'inspect'],
	},
];

const itemMap = new Map(ITEMS.map((i) => [i.id, i]));

export function getItemById(id: string): ItemData | undefined {
	return itemMap.get(id);
}

export function getAllItems(): ItemData[] {
	return ITEMS;
}
