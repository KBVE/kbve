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
