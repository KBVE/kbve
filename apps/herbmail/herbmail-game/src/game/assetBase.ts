import * as THREE from 'three';

const ASSET_BASE = import.meta.env.BASE_URL;

THREE.DefaultLoadingManager.setURLModifier((url) =>
	url.startsWith('/') && !url.startsWith('//')
		? ASSET_BASE + url.slice(1)
		: url,
);
