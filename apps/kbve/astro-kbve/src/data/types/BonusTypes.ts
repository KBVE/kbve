export const BonusKeys = [
	'armor',
	'intelligence',
	'health',
	'mana',
	'energy',
	'strength',
] as const;

export type BonusKey = (typeof BonusKeys)[number];
