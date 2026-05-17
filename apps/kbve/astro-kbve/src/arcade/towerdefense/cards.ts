export type CardId =
	| 'bonus_gold'
	| 'free_basic_tower'
	| 'soldier_squad'
	| 'field_repair'
	| 'battery_surge'
	| 'wave_bounty';

export interface CardOption {
	id: CardId;
	name: string;
	description: string;
	color: number;
}

export const CARD_POOL: CardOption[] = [
	{
		id: 'bonus_gold',
		name: 'Bonus Gold',
		description: '+150 gold',
		color: 0xfbd38d,
	},
	{
		id: 'free_basic_tower',
		name: 'Tower Kit',
		description: 'Next basic tower is free',
		color: 0x4299e1,
	},
	{
		id: 'soldier_squad',
		name: 'Soldier Squad',
		description: 'Spawn 5 soldiers from your armouries',
		color: 0xb794f4,
	},
	{
		id: 'field_repair',
		name: 'Field Repair',
		description: 'All buildings to full HP',
		color: 0x68d391,
	},
	{
		id: 'battery_surge',
		name: 'Battery Surge',
		description: '+30 charge to batteries',
		color: 0xf6e05e,
	},
	{
		id: 'wave_bounty',
		name: 'Wave Bounty',
		description: '+50% kill rewards next wave',
		color: 0xfc8181,
	},
];

export function pickThreeCards(): CardOption[] {
	const pool = [...CARD_POOL];
	const out: CardOption[] = [];
	for (let i = 0; i < 3 && pool.length > 0; i++) {
		const idx = Math.floor(Math.random() * pool.length);
		out.push(pool[idx]);
		pool.splice(idx, 1);
	}
	return out;
}
