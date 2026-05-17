/**
 * Resolve mcasset.cloud texture URLs for a Minecraft vanilla item / block
 * ref. We try `assets/minecraft/textures/item/<ref>.png` first for regular
 * items, and `assets/minecraft/textures/block/<ref>.png` first for blocks —
 * fallback to the other path on error.
 *
 * Returning both candidates lets the caller wire an `onerror` swap once
 * without re-doing the URL build.
 */
export const MC_ASSET_VERSION = '1.21.5';
const ITEM_BASE = `https://mcasset.cloud/${MC_ASSET_VERSION}/assets/minecraft/textures/item`;
const BLOCK_BASE = `https://mcasset.cloud/${MC_ASSET_VERSION}/assets/minecraft/textures/block`;

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
