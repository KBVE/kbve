import * as THREE from 'three';

const ASSET_BASE = import.meta.env.BASE_URL;

export const asset = (url: string): string =>
	url.startsWith('/') && !url.startsWith('//')
		? ASSET_BASE + url.slice(1)
		: url;

THREE.DefaultLoadingManager.setURLModifier(asset);
