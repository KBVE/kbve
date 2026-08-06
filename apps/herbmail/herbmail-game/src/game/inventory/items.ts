import type { Footprint } from './grid';
import { ARMOR_PIECES, pieceLabel } from '../character/armor';
import { itemFootprint, itemLabel } from '../data/itemdb';
import { actionsOf } from '../data/professiondb';
import { MINING } from '../prop/stoneNode';
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
	sword: {
		id: 'sword',
		label: 'sword',
		fp: { w: 1, h: 3 },
		color: '#c9ced6',
		equipId: 'sword',
	},
	pickaxe: {
		id: 'pickaxe',
		label: 'pickaxe',
		fp: itemFootprint('pickaxe'),
		color: '#8d6b4b',
		icon: asset('/icons/items/pickaxe.png'),
		equipId: 'pickaxe',
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

// Every item a mining action can yield, registered straight off professiondb so
// adding an output in the MDX makes it lootable here without a second edit.
// `stone` is already declared above; the loop leaves existing entries alone.
const MINING_COLOR: Record<string, string> = {
	'mossy-stone': '#6f7d5a',
	'copper-ore': '#b06a3a',
	'iron-ore': '#8a8f98',
	'crystal-ore': '#41b6c4',
	emerald: '#3aa86a',
	sapphire: '#3a6ac4',
	ruby: '#c43a4a',
	diamond: '#e8f4fa',
};

// One shared gem mesh recoloured per stone (art/items/render_gems.py), so these
// are the only mining outputs with a rendered icon; the ores fall back to a
// flat grid tile.
const GEM_ICONS = new Set(['emerald', 'sapphire', 'ruby', 'diamond']);

for (const action of actionsOf(MINING)) {
	for (const out of action.outputs) {
		if (ITEMS[out.itemRef]) continue;
		ITEMS[out.itemRef] = {
			id: out.itemRef,
			label: itemLabel(out.itemRef),
			fp: itemFootprint(out.itemRef),
			color: MINING_COLOR[out.itemRef] ?? '#8a8a92',
			icon: GEM_ICONS.has(out.itemRef)
				? asset(`/icons/items/${out.itemRef}.png`)
				: undefined,
		};
	}
}

// Grid tile color for each armor set item, keyed by itemdb ref. The grid item
// and the paperdoll slot share this look; `icon` is the Blender-rendered
// 64x64 png under public/icons/items/. Footprints are not here — they live in
// the itemdb mdx as `grid:` and arrive via itemFootprint().
const ARMOR_COLOR: Record<string, string> = {
	'vanguard-helm': '#9aa0ac',
	'worn-eye-patch': '#6a5a4a',
	'campaign-pack': '#7a6a4a',
	'vanguard-breastplate': '#8a90a0',
	'vanguard-pauldrons': '#8a90a0',
	'vanguard-arm-guards': '#7e8494',
	'vanguard-elbow-guards': '#767c8c',
	'vanguard-bracers': '#6e7484',
	'vanguard-gauntlets': '#7e8494',
	'vanguard-tassets': '#88807a',
	'vanguard-faulds': '#88807a',
	'vanguard-greaves': '#808898',
	'vanguard-knee-guards': '#808898',
	'vanguard-sabatons': '#6e7484',
	'ion-blue-hair': '#4a8ab2',
	'optic-visor': '#4aa8c0',
	'filter-mask': '#3a7a8a',
	'tech-pack': '#4a6a7a',
	'circuit-jacket': '#3a8a9a',
	'padded-sleeves': '#48929e',
	'utility-cuffs': '#569aa6',
	'grip-gloves': '#5aa2ae',
	'cargo-slacks': '#3a6a86',
	'shin-wraps': '#427292',
	'mag-sneakers': '#7a92a2',
	'pouch-rig': '#5a7a6a',
	'impact-shoulder-pads': '#4a92b2',
	'impact-elbow-pads': '#4a8aa2',
	'impact-knee-pads': '#4a82aa',
	'crest-helmet': '#c07a3a',
	'hardcase-pouches': '#a2743a',
	'hardpoint-shoulders': '#b2823a',
	'grinning-pumpkin-helm': '#7a3a42',
};

for (const p of ARMOR_PIECES) {
	ITEMS[p.id] = {
		id: p.id,
		label: pieceLabel(p.id),
		fp: itemFootprint(p.id),
		color: ARMOR_COLOR[p.id] ?? '#8a8a92',
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
