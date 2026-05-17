/**
 * Resolve Minecraft texture URLs for a given vanilla ref.
 *
 * Textures are self-hosted at `apps/kbve/astro-kbve/public/mc/textures/`
 * (downloaded from InventivetalentDev/minecraft-assets at the version
 * pinned by MC_ASSET_VERSION). Same-origin avoids the mcasset.cloud CORS /
 * availability issues we hit with the prior implementation.
 *
 * Returns both `item/` and `block/` URLs; the caller (`MCTextureImage`)
 * tries the most likely path first based on category and falls back to
 * the alternate on `onError`. Missing PNGs in either path resolve to a
 * themed initial-letter placeholder rendered by the component.
 */
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
