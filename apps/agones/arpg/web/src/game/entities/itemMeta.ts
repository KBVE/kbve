// Client-side itemdb lookup. The canonical data is the MDX-sourced itemdb,
// bundled at build via the `@kbve/itemdb-data` alias (generated/itemdb.json) so
// the HUD shows names/rarity/sprite instead of raw refs with no network round
// trip. `key` indexes the generated sprite atlas (frame == key). SoT stays the
// itemdb — nothing here is hand-maintained.

import itemdb from '@kbve/itemdb-data';

export interface ItemMeta {
	ref: string;
	name: string;
	key: number;
	emoji?: string;
	img?: string;
	rarity?: string;
	consumable?: boolean;
}

const RARITY_COLOR: Record<string, string> = {
	common: '#cbd5e1',
	uncommon: '#4ade80',
	rare: '#60a5fa',
	epic: '#c084fc',
	legendary: '#fbbf24',
	mythic: '#f87171',
};

export function rarityColor(rarity?: string): string {
	return (rarity && RARITY_COLOR[rarity.toLowerCase()]) || '#cbd5e1';
}

let cache: Map<string, ItemMeta> | null = null;

function buildItemMeta(): Map<string, ItemMeta> {
	const map = new Map<string, ItemMeta>();
	const items = (itemdb as { items?: any[] }).items ?? [];
	for (const it of items) {
		if (!it?.ref) continue;
		map.set(it.ref, {
			ref: it.ref,
			name: it.name ?? it.ref,
			key: it.key ?? 0,
			emoji: it.emoji,
			img: it.img,
			rarity: it.rarity,
			consumable: it.consumable,
		});
	}
	return map;
}

/** Resolve the itemdb map (built once from the bundled data). */
export function loadItemMeta(): Promise<Map<string, ItemMeta>> {
	if (!cache) cache = buildItemMeta();
	return Promise.resolve(cache);
}
