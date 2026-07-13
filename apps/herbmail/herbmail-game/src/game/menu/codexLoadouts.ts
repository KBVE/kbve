import { ARMOR_PIECES } from '../character/armor';

const ALL = ARMOR_PIECES.map((p) => p.id);

// The clothed starter kit every player gets for free: the outfit's body meshes
// (torso, hips, legs, hands, feet) with none of the knight plate on top.
const FREE = [
	'chest',
	'hips',
	'legL',
	'legR',
	'gauntletL',
	'gauntletR',
	'bootL',
	'bootR',
];

export interface CodexLoadout {
	id: string;
	label: string;
	equipped: Set<string>;
}

export const CODEX_LOADOUTS: CodexLoadout[] = [
	{ id: 'knight', label: 'Full Knight', equipped: new Set(ALL) },
	{ id: 'free', label: 'Free / Standard', equipped: new Set(FREE) },
	{ id: 'unarmored', label: 'Unarmored', equipped: new Set() },
	{
		id: 'helmetOff',
		label: 'Helmet Off',
		equipped: new Set(ALL.filter((id) => id !== 'helmet')),
	},
];
