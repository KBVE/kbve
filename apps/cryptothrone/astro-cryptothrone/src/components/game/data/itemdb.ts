import rawItemdb from '@kbve/itemdb-data';
import type { ItemData, ItemAction, ItemRarity } from '../types';

// Inline SVG placeholder for item icons whose sprite is missing (the default
// /assets/icons/<ref>.png path has no backing file for many items). A data URI
// can't 404, so it sidesteps Cloudflare caching a missing-asset 404.
const FALLBACK_SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">' +
	'<rect width="32" height="32" rx="4" fill="#3f3f46"/>' +
	'<text x="16" y="22" font-size="16" fill="#a1a1aa" text-anchor="middle" ' +
	'font-family="monospace">?</text></svg>';
export const ITEM_ICON_FALLBACK = `data:image/svg+xml;utf8,${encodeURIComponent(
	FALLBACK_SVG,
)}`;

const FLAG_WEAPON = 1 << 0;
const FLAG_ARMOR = 1 << 1;
const FLAG_FOOD = 1 << 3;
const FLAG_DRINK = 1 << 4;
const FLAG_POTION = 1 << 5;
const FLAG_QUEST = 1 << 12;
const FLAG_CONSUMABLE = FLAG_FOOD | FLAG_DRINK | FLAG_POTION;

const BONUS_ALIAS: Record<string, string> = {
	health: 'hp',
	mana: 'mp',
	energy: 'ep',
};

interface RawItem {
	ref: string;
	name: string;
	description?: string;
	lore?: string;
	typeFlags?: number;
	rarity?: string;
	img?: string;
	hasImg?: boolean;
	weight?: number;
	durability?: number;
	consumable?: boolean;
	bonuses?: Record<string, number>;
}

function resolveType(flags: number): ItemData['type'] {
	if (flags & FLAG_WEAPON) return 'weapon';
	if (flags & FLAG_ARMOR) return 'armor';
	if (flags & FLAG_CONSUMABLE) return 'consumable';
	if (flags & FLAG_QUEST) return 'quest';
	return 'material';
}

function resolveActions(type: ItemData['type']): ItemAction[] {
	if (type === 'consumable') return ['use', 'drop', 'inspect'];
	if (type === 'weapon' || type === 'armor')
		return ['equip', 'drop', 'inspect'];
	return ['drop', 'inspect'];
}

function resolveRarity(raw?: string): ItemRarity {
	const r = (raw ?? '').replace(/^ITEM_RARITY_/, '').toLowerCase();
	switch (r) {
		case 'uncommon':
		case 'rare':
		case 'epic':
		case 'legendary':
		case 'mythic':
			return r;
		default:
			return 'common';
	}
}

function normalizeBonuses(
	raw?: Record<string, number>,
): Record<string, number> {
	const out: Record<string, number> = {};
	for (const [k, v] of Object.entries(raw ?? {})) {
		out[BONUS_ALIAS[k] ?? k] = v;
	}
	return out;
}

function adapt(raw: RawItem): ItemData {
	const flags = raw.typeFlags ?? 0;
	const type = resolveType(flags);
	return {
		id: raw.ref,
		name: raw.name,
		type,
		img: raw.img ?? `/assets/icons/${raw.ref}.png`,
		description: (raw.description ?? '').trim(),
		bonuses: normalizeBonuses(raw.bonuses),
		durability: raw.durability ?? (type === 'consumable' ? 1 : 100),
		weight: raw.weight ?? 1,
		actions: resolveActions(type),
		rarity: resolveRarity(raw.rarity),
		lore: raw.lore?.trim() || undefined,
	};
}

const pool = (rawItemdb as { items?: RawItem[] }).items ?? [];
const items: ItemData[] = pool.filter((r) => r && r.ref && r.name).map(adapt);

const itemMap = new Map(items.map((i) => [i.id, i]));

export function getItemById(ref: string): ItemData | undefined {
	return itemMap.get(ref);
}

export function getAllItems(): ItemData[] {
	return items;
}
