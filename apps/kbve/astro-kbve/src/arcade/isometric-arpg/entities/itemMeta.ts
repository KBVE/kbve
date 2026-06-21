// Client-side itemdb lookup. The canonical data is the MDX-sourced itemdb
// served at /api/itemdb.json ({ items, index }); we fetch it once and expose a
// ref -> meta map so the HUD can show names/emoji/rarity instead of raw refs.
// SoT stays the itemdb — nothing here is hand-maintained.

export interface ItemMeta {
	ref: string;
	name: string;
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
let inflight: Promise<Map<string, ItemMeta>> | null = null;

async function fetchItemMeta(): Promise<Map<string, ItemMeta>> {
	const map = new Map<string, ItemMeta>();
	try {
		const res = await fetch('/api/itemdb.json');
		if (!res.ok) return map;
		const data = (await res.json()) as { items?: any[] };
		for (const it of data.items ?? []) {
			if (!it?.ref) continue;
			map.set(it.ref, {
				ref: it.ref,
				name: it.name ?? it.ref,
				emoji: it.emoji,
				img: it.img,
				rarity: it.rarity,
				consumable: it.consumable,
			});
		}
	} catch {
		// offline / endpoint missing: callers fall back to the raw ref.
	}
	return map;
}

/** Resolve the itemdb map once, sharing one in-flight request across callers. */
export function loadItemMeta(): Promise<Map<string, ItemMeta>> {
	if (cache) return Promise.resolve(cache);
	if (!inflight) {
		inflight = fetchItemMeta().then((m) => {
			cache = m;
			inflight = null;
			return m;
		});
	}
	return inflight;
}
