import * as THREE from 'three';

export interface WaterAssets {
	tileTexture: THREE.Texture;
	cubemap: THREE.CubeTexture;
}

const DIR = '/textures/water/';
let loaded: Promise<WaterAssets> | null = null;

export function loadWaterAssets(): Promise<WaterAssets> {
	if (loaded) return loaded;
	loaded = (async () => {
		const tileTexture = await new THREE.TextureLoader().loadAsync(
			`${DIR}tiles.jpg`,
		);
		tileTexture.wrapS = THREE.RepeatWrapping;
		tileTexture.wrapT = THREE.RepeatWrapping;
		tileTexture.minFilter = THREE.LinearMipmapLinearFilter;
		tileTexture.generateMipmaps = true;

		const cubemap = await new THREE.CubeTextureLoader().loadAsync([
			`${DIR}xpos.jpg`,
			`${DIR}xneg.jpg`,
			`${DIR}ypos.jpg`,
			`${DIR}ypos.jpg`,
			`${DIR}zpos.jpg`,
			`${DIR}zneg.jpg`,
		]);
		cubemap.flipY = true;
		cubemap.colorSpace = THREE.NoColorSpace;
		cubemap.minFilter = THREE.LinearFilter;
		cubemap.magFilter = THREE.LinearFilter;
		cubemap.generateMipmaps = false;

		return { tileTexture, cubemap };
	})();
	return loaded;
}
