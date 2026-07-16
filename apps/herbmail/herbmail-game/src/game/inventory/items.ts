import type { Footprint } from './grid';
import { ARMOR_PIECES, pieceLabel } from '../character/armor';
import { asset } from '../assetBase';

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
	'vanguard-helm': { fp: { w: 2, h: 2 }, color: '#9aa0ac' },
	'worn-eye-patch': { fp: { w: 1, h: 1 }, color: '#6a5a4a' },
	'campaign-pack': { fp: { w: 2, h: 2 }, color: '#7a6a4a' },
	'vanguard-breastplate': { fp: { w: 2, h: 2 }, color: '#8a90a0' },
	'vanguard-pauldrons': { fp: { w: 2, h: 1 }, color: '#8a90a0' },
	'vanguard-arm-guards': { fp: { w: 1, h: 2 }, color: '#7e8494' },
	'vanguard-elbow-guards': { fp: { w: 1, h: 1 }, color: '#767c8c' },
	'vanguard-bracers': { fp: { w: 1, h: 2 }, color: '#6e7484' },
	'vanguard-gauntlets': { fp: { w: 2, h: 1 }, color: '#7e8494' },
	'vanguard-tassets': { fp: { w: 2, h: 1 }, color: '#88807a' },
	'vanguard-faulds': { fp: { w: 2, h: 2 }, color: '#88807a' },
	'vanguard-greaves': { fp: { w: 2, h: 2 }, color: '#808898' },
	'vanguard-knee-guards': { fp: { w: 1, h: 1 }, color: '#808898' },
	'vanguard-sabatons': { fp: { w: 2, h: 1 }, color: '#6e7484' },
	'ion-blue-hair': { fp: { w: 1, h: 1 }, color: '#4a8ab2' },
	'optic-visor': { fp: { w: 2, h: 1 }, color: '#4aa8c0' },
	'filter-mask': { fp: { w: 1, h: 1 }, color: '#3a7a8a' },
	'tech-pack': { fp: { w: 2, h: 2 }, color: '#4a6a7a' },
	'circuit-jacket': { fp: { w: 2, h: 2 }, color: '#3a8a9a' },
	'padded-sleeves': { fp: { w: 1, h: 2 }, color: '#48929e' },
	'utility-cuffs': { fp: { w: 1, h: 1 }, color: '#569aa6' },
	'grip-gloves': { fp: { w: 2, h: 1 }, color: '#5aa2ae' },
	'cargo-slacks': { fp: { w: 2, h: 2 }, color: '#3a6a86' },
	'shin-wraps': { fp: { w: 1, h: 2 }, color: '#427292' },
	'mag-sneakers': { fp: { w: 2, h: 1 }, color: '#7a92a2' },
	'pouch-rig': { fp: { w: 2, h: 2 }, color: '#5a7a6a' },
	'impact-shoulder-pads': { fp: { w: 2, h: 1 }, color: '#4a92b2' },
	'impact-elbow-pads': { fp: { w: 1, h: 1 }, color: '#4a8aa2' },
	'impact-knee-pads': { fp: { w: 1, h: 1 }, color: '#4a82aa' },
	'crest-helmet': { fp: { w: 2, h: 2 }, color: '#c07a3a' },
	'hardcase-pouches': { fp: { w: 2, h: 2 }, color: '#a2743a' },
	'hardpoint-shoulders': { fp: { w: 2, h: 1 }, color: '#b2823a' },
	'grinning-pumpkin-helm': { fp: { w: 2, h: 2 }, color: '#7a3a42' },
};

for (const p of ARMOR_PIECES) {
	const meta = ARMOR_META[p.id] ?? { fp: { w: 1, h: 1 }, color: '#8a8a92' };
	ITEMS[p.id] = {
		id: p.id,
		label: pieceLabel(p.id),
		fp: meta.fp,
		color: meta.color,
		icon: asset(`/icons/items/${p.id}.png`),
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
