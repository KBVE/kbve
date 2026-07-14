import type { Footprint } from './grid';
import { ARMOR_PIECES, pieceLabel } from '../character/armor';

// One inventory item kind. Footprint is the upright (rot=0) WxH in grid cells.
// `equipId` links an item to a LOADOUT entry so double-clicking it equips.
// `armor` items equip to a paperdoll slot (armor.ts) instead of a hand.
export interface ItemDef {
	id: string;
	label: string;
	fp: Footprint;
	color: string;
	icon?: string;
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

// Footprint + color for each armor set item, keyed by itemdb ref. The grid item
// and the paperdoll slot share this look; `icon` is the Blender-rendered
// 64x64 png under public/icons/items/.
const ARMOR_META: Record<string, { fp: Footprint; color: string }> = {
	'kngt-helmet': { fp: { w: 2, h: 2 }, color: '#9aa0ac' },
	'kngt-eye-patch': { fp: { w: 1, h: 1 }, color: '#6a5a4a' },
	'kngt-backpack': { fp: { w: 2, h: 2 }, color: '#7a6a4a' },
	'kngt-chest': { fp: { w: 2, h: 2 }, color: '#8a90a0' },
	'kngt-pauldrons': { fp: { w: 2, h: 1 }, color: '#8a90a0' },
	'kngt-upper-arms': { fp: { w: 1, h: 2 }, color: '#7e8494' },
	'kngt-elbow-guards': { fp: { w: 1, h: 1 }, color: '#767c8c' },
	'kngt-bracers': { fp: { w: 1, h: 2 }, color: '#6e7484' },
	'kngt-gauntlets': { fp: { w: 2, h: 1 }, color: '#7e8494' },
	'kngt-hips': { fp: { w: 2, h: 1 }, color: '#88807a' },
	'kngt-fauld-set': { fp: { w: 2, h: 2 }, color: '#88807a' },
	'kngt-legs': { fp: { w: 2, h: 2 }, color: '#808898' },
	'kngt-knee-guards': { fp: { w: 1, h: 1 }, color: '#808898' },
	'kngt-boots': { fp: { w: 2, h: 1 }, color: '#6e7484' },
	'scifi09-hair': { fp: { w: 1, h: 1 }, color: '#4a8ab2' },
	'scifi09-visor': { fp: { w: 2, h: 1 }, color: '#4aa8c0' },
	'scifi09-mask': { fp: { w: 1, h: 1 }, color: '#3a7a8a' },
	'scifi09-tech-pack': { fp: { w: 2, h: 2 }, color: '#4a6a7a' },
	'scifi09-jacket': { fp: { w: 2, h: 2 }, color: '#3a8a9a' },
	'scifi09-sleeves': { fp: { w: 1, h: 2 }, color: '#48929e' },
	'scifi09-cuffs': { fp: { w: 1, h: 1 }, color: '#569aa6' },
	'scifi09-gloves': { fp: { w: 2, h: 1 }, color: '#5aa2ae' },
	'scifi09-pants': { fp: { w: 2, h: 2 }, color: '#3a6a86' },
	'scifi09-pant-legs': { fp: { w: 1, h: 2 }, color: '#427292' },
	'scifi09-sneakers': { fp: { w: 2, h: 1 }, color: '#7a92a2' },
	'scifi09-pouch-set': { fp: { w: 2, h: 2 }, color: '#5a7a6a' },
	'scifi09-shoulder-pads': { fp: { w: 2, h: 1 }, color: '#4a92b2' },
	'scifi09-elbow-pads': { fp: { w: 1, h: 1 }, color: '#4a8aa2' },
	'scifi09-knee-pads': { fp: { w: 1, h: 1 }, color: '#4a82aa' },
	'scifi10-helmet': { fp: { w: 2, h: 2 }, color: '#c07a3a' },
	'scifi10-pouch-set': { fp: { w: 2, h: 2 }, color: '#a2743a' },
	'scifi10-shoulders': { fp: { w: 2, h: 1 }, color: '#b2823a' },
	'horr01-villain-helm': { fp: { w: 2, h: 2 }, color: '#7a3a42' },
};

for (const p of ARMOR_PIECES) {
	const meta = ARMOR_META[p.id] ?? { fp: { w: 1, h: 1 }, color: '#8a8a92' };
	ITEMS[p.id] = {
		id: p.id,
		label: pieceLabel(p.id),
		fp: meta.fp,
		color: meta.color,
		icon: `/icons/items/${p.id}.png`,
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
