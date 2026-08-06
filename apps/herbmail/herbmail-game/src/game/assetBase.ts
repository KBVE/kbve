import * as THREE from 'three';
import hashes from 'virtual:asset-hashes';

const ASSET_BASE = import.meta.env.BASE_URL;
const DEV = import.meta.env.DEV;
const DEV_V = DEV ? `?v=${Date.now()}` : '';

// Every three loader resolves through here, so this is where public/ assets get
// their cache key. Textures are rewritten on the way into dist (downscaled) at
// a stable URL, so without a version they would be served from whatever the
// browser cached. Callers that already versioned a URL — modelUrl() — carry a
// query and are left alone rather than stacking a second one.
export const asset = (url: string): string => {
	if (!url.startsWith('/') || url.startsWith('//')) return url;
	const based = ASSET_BASE + url.slice(1);
	if (based.includes('?')) return based;
	if (DEV) return `${based}${DEV_V}`;
	const h = hashes[url];
	return h ? `${based}?v=${h}` : based;
};

THREE.DefaultLoadingManager.setURLModifier(asset);
