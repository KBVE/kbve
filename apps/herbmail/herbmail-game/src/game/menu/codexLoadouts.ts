import { ARMOR_PIECES } from '../character/armor';

const bySet = (set: string) =>
	ARMOR_PIECES.filter((p) => p.set === set).map((p) => p.id);

const KNIGHT = bySet('KNGT');
const SCIFI = bySet('SCFI09');

// Starter_03 variant: the civilian outfit with the armored helmet, shoulders
// and hardcase pouches from SCFI_CIVL_10 swapped in.
const SCIFI_VARIANT = [
	...SCIFI.filter(
		(id) =>
			!['optic-visor', 'impact-shoulder-pads', 'pouch-rig'].includes(id),
	),
	...bySet('SCFI10'),
];

// The clothed starter kit every player gets for free: the outfit's body meshes
// (torso, hips, legs, hands, feet) with none of the knight plate on top.
const FREE = [
	'vanguard-breastplate',
	'vanguard-tassets',
	'vanguard-greaves',
	'vanguard-gauntlets',
	'vanguard-sabatons',
];

export interface CodexLoadout {
	id: string;
	label: string;
	equipped: Set<string>;
}

export const CODEX_LOADOUTS: CodexLoadout[] = [
	{ id: 'knight', label: 'Full Knight', equipped: new Set(KNIGHT) },
	{ id: 'scifi', label: 'Sci-fi Civilian', equipped: new Set(SCIFI) },
	{
		id: 'scifiVariant',
		label: 'Sci-fi Variant',
		equipped: new Set(SCIFI_VARIANT),
	},
	{
		id: 'villain',
		label: 'Villain',
		equipped: new Set([
			...FREE.filter((id) => id !== 'vanguard-breastplate'),
			'grinning-pumpkin-helm',
		]),
	},
	{ id: 'free', label: 'Free / Standard', equipped: new Set(FREE) },
	{ id: 'unarmored', label: 'Unarmored', equipped: new Set() },
	{
		id: 'helmetOff',
		label: 'Helmet Off',
		equipped: new Set(KNIGHT.filter((id) => id !== 'vanguard-helm')),
	},
];
