import type { Footprint } from './grid';
import { ARMOR_PIECES } from '../character/armor';

// One inventory item kind. Footprint is the upright (rot=0) WxH in grid cells.
// `equipId` links an item to a LOADOUT entry so double-clicking it equips.
// `armor` items equip to a paperdoll slot (armor.ts) instead of a hand.
export interface ItemDef {
	id: string;
	label: string;
	fp: Footprint;
	color: string;
	equipId?: string;
	armor?: boolean;
}

export const ITEMS: Record<string, ItemDef> = {
	stone: {
		id: 'stone',
		label: 'stone',
		fp: { w: 1, h: 1 },
		color: '#8a8a92',
	},
	wood: { id: 'wood', label: 'wood', fp: { w: 1, h: 2 }, color: '#7a5230' },
	gem: { id: 'gem', label: 'gem', fp: { w: 1, h: 1 }, color: '#41b6c4' },
	sword: {
		id: 'sword',
		label: 'sword',
		fp: { w: 1, h: 3 },
		color: '#c9ced6',
		equipId: 'sword',
	},
	torch: {
		id: 'torch',
		label: 'torch',
		fp: { w: 1, h: 2 },
		color: '#e0913a',
		equipId: 'torch',
	},
	crate: {
		id: 'crate',
		label: 'crate',
		fp: { w: 2, h: 2 },
		color: '#8a6a3a',
		equipId: 'crate',
	},
};

// Footprint + color for each armor piece, keyed by ARMOR_PIECES id. The grid item
// and the paperdoll slot share this look so a piece reads the same in both places.
const ARMOR_META: Record<string, { fp: Footprint; color: string }> = {
	helmet: { fp: { w: 2, h: 2 }, color: '#9aa0ac' },
	eyePatch: { fp: { w: 1, h: 1 }, color: '#6a5a4a' },
	backpack: { fp: { w: 2, h: 2 }, color: '#7a6a4a' },
	pauldronL: { fp: { w: 1, h: 1 }, color: '#8a90a0' },
	pauldronR: { fp: { w: 1, h: 1 }, color: '#8a90a0' },
	upperArmL: { fp: { w: 1, h: 2 }, color: '#7e8494' },
	upperArmR: { fp: { w: 1, h: 2 }, color: '#7e8494' },
	elbowL: { fp: { w: 1, h: 1 }, color: '#767c8c' },
	elbowR: { fp: { w: 1, h: 1 }, color: '#767c8c' },
	bracerL: { fp: { w: 1, h: 2 }, color: '#6e7484' },
	bracerR: { fp: { w: 1, h: 2 }, color: '#6e7484' },
	fauldFront: { fp: { w: 1, h: 1 }, color: '#88807a' },
	fauldBack: { fp: { w: 1, h: 1 }, color: '#88807a' },
	fauldLeft: { fp: { w: 1, h: 1 }, color: '#88807a' },
	fauldRight: { fp: { w: 1, h: 1 }, color: '#88807a' },
	kneeL: { fp: { w: 1, h: 1 }, color: '#808898' },
	kneeR: { fp: { w: 1, h: 1 }, color: '#808898' },
	scifi09Hair: { fp: { w: 1, h: 1 }, color: '#b08a5a' },
	scifi09Visor: { fp: { w: 2, h: 1 }, color: '#4aa8c0' },
	scifi09Mask: { fp: { w: 1, h: 1 }, color: '#3a7a8a' },
	scifi09Pack: { fp: { w: 2, h: 2 }, color: '#4a6a7a' },
	scifi09Jacket: { fp: { w: 2, h: 2 }, color: '#3a8a9a' },
	scifi09SleeveL: { fp: { w: 1, h: 2 }, color: '#48929e' },
	scifi09SleeveR: { fp: { w: 1, h: 2 }, color: '#48929e' },
	scifi09CuffL: { fp: { w: 1, h: 1 }, color: '#569aa6' },
	scifi09CuffR: { fp: { w: 1, h: 1 }, color: '#569aa6' },
	scifi09GloveL: { fp: { w: 1, h: 1 }, color: '#5aa2ae' },
	scifi09GloveR: { fp: { w: 1, h: 1 }, color: '#5aa2ae' },
	scifi09Pants: { fp: { w: 2, h: 2 }, color: '#3a6a86' },
	scifi09PantLegL: { fp: { w: 1, h: 2 }, color: '#427292' },
	scifi09PantLegR: { fp: { w: 1, h: 2 }, color: '#427292' },
	scifi09SneakerL: { fp: { w: 1, h: 1 }, color: '#7a92a2' },
	scifi09SneakerR: { fp: { w: 1, h: 1 }, color: '#7a92a2' },
	scifi09PouchF: { fp: { w: 1, h: 1 }, color: '#5a7a6a' },
	scifi09PouchB: { fp: { w: 1, h: 1 }, color: '#5a7a6a' },
	scifi09PouchL: { fp: { w: 1, h: 1 }, color: '#5a7a6a' },
	scifi09PouchR: { fp: { w: 1, h: 1 }, color: '#5a7a6a' },
	scifi09ShoulderL: { fp: { w: 1, h: 1 }, color: '#4a92b2' },
	scifi09ShoulderR: { fp: { w: 1, h: 1 }, color: '#4a92b2' },
	scifi09ElbowL: { fp: { w: 1, h: 1 }, color: '#4a8aa2' },
	scifi09ElbowR: { fp: { w: 1, h: 1 }, color: '#4a8aa2' },
	scifi09KneeL: { fp: { w: 1, h: 1 }, color: '#4a82aa' },
	scifi09KneeR: { fp: { w: 1, h: 1 }, color: '#4a82aa' },
	scifi10Helmet: { fp: { w: 2, h: 2 }, color: '#c07a3a' },
	scifi10PouchB: { fp: { w: 1, h: 1 }, color: '#a2743a' },
	scifi10PouchL: { fp: { w: 1, h: 1 }, color: '#a2743a' },
	scifi10PouchR: { fp: { w: 1, h: 1 }, color: '#a2743a' },
	scifi10ShoulderL: { fp: { w: 1, h: 1 }, color: '#b2823a' },
	scifi10ShoulderR: { fp: { w: 1, h: 1 }, color: '#b2823a' },
	horr01Helmet: { fp: { w: 2, h: 2 }, color: '#7a3a42' },
};

for (const p of ARMOR_PIECES) {
	const meta = ARMOR_META[p.id] ?? { fp: { w: 1, h: 1 }, color: '#8a8a92' };
	ITEMS[p.id] = {
		id: p.id,
		label: p.label,
		fp: meta.fp,
		color: meta.color,
		equipId: p.id,
		armor: true,
	};
}

export const ARMOR_ITEM_IDS = ARMOR_PIECES.map((p) => p.id);

export function isArmorItem(id: string): boolean {
	return ITEMS[id]?.armor === true;
}

export function itemDef(id: string): ItemDef | undefined {
	return ITEMS[id];
}
