import hashes from 'virtual:model-hashes';

const DEV = import.meta.env.DEV;
const DEV_V = DEV ? `?v=${Date.now()}` : '';

export function modelUrl(path: string): string {
	if (DEV) return `${path}${DEV_V}`;
	const h = hashes[path];
	return h ? `${path}?v=${h}` : path;
}

export const CHARACTER_URL = modelUrl('/models/character-anim.glb');
