import * as THREE from 'three';

export interface PsxViewmodelMaterial {
	material: THREE.Material;
	setSnap: (v: number) => void;
	setRes: (w: number, h: number) => void;
}

export function makePsxViewmodelMaterial(
	map: THREE.Texture | null,
	_snap: number,
): PsxViewmodelMaterial {
	if (map) {
		map.magFilter = THREE.NearestFilter;
		map.minFilter = THREE.NearestMipmapNearestFilter;
		map.colorSpace = THREE.SRGBColorSpace;
		map.needsUpdate = true;
	}

	const material = new THREE.MeshLambertMaterial({
		map,
		color: map ? 0xffffff : 0xff44aa,
	});
	material.toneMapped = false;
	material.depthTest = true;
	material.depthWrite = true;
	material.side = THREE.FrontSide;

	return {
		material,
		setSnap: () => undefined,
		setRes: () => undefined,
	};
}
