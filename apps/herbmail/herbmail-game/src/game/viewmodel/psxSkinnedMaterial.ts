import * as THREE from 'three';

export interface PsxViewmodelMaterial {
	material: THREE.MeshBasicMaterial;
	setSnap: (v: number) => void;
	setRes: (w: number, h: number) => void;
}

const SNAP_INJECT = /* glsl */ `
	#include <project_vertex>
	{
		vec3 psxNdc = gl_Position.xyz / gl_Position.w;
		float psxAspect = uRes.x / max(uRes.y, 1.0);
		vec2 psxGrid = vec2(uSnap * psxAspect, uSnap);
		psxNdc.xy = floor(psxNdc.xy * psxGrid + 0.5) / psxGrid;
		gl_Position.xyz = psxNdc * gl_Position.w;
	}
`;

export function makePsxViewmodelMaterial(
	map: THREE.Texture | null,
	snap: number,
): PsxViewmodelMaterial {
	if (map) {
		map.magFilter = THREE.NearestFilter;
		map.minFilter = THREE.NearestMipmapNearestFilter;
		map.colorSpace = THREE.SRGBColorSpace;
		map.needsUpdate = true;
	}

	const material = new THREE.MeshBasicMaterial({
		map,
		color: map ? 0xffffff : 0xff44aa,
	});
	material.toneMapped = false;
	material.depthTest = true;
	material.depthWrite = true;
	material.side = THREE.FrontSide;

	const uSnap = { value: snap };
	const uRes = { value: new THREE.Vector2(1, 1) };

	void SNAP_INJECT;

	return {
		material,
		setSnap: (v) => (uSnap.value = v),
		setRes: (w, h) => uRes.value.set(w, h),
	};
}
