export const MC_ASSET_VERSION = '1.21.5';
const ITEM_BASE = '/mc/textures/item';
const BLOCK_BASE = '/mc/textures/block';

type Pair = { primary: string; fallback: string };

const BLOCK_CATEGORIES = new Set([
	'block',
	'decoration',
	'redstone',
	'transport',
]);

export function mcTextureUrls(ref: string, category?: string | null): Pair {
	const clean = ref.replace(/^minecraft:/, '').toLowerCase();
	const isBlockish = category ? BLOCK_CATEGORIES.has(category) : false;
	if (isBlockish) {
		return {
			primary: `${BLOCK_BASE}/${clean}.png`,
			fallback: `${ITEM_BASE}/${clean}.png`,
		};
	}
	return {
		primary: `${ITEM_BASE}/${clean}.png`,
		fallback: `${BLOCK_BASE}/${clean}.png`,
	};
}
