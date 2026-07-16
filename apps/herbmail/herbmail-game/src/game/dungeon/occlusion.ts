import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TILE } from '../config';
import { OCCLUDES, OPEN } from '../geometry/grid';
import { useActiveRooms } from './store';

export interface OcclusionField {
	tex: THREE.DataTexture;
	origin: THREE.Vector2;
	size: THREE.Vector2;
}

function makeTex(
	data: Uint8Array,
	cols: number,
	rows: number,
): THREE.DataTexture {
	const tex = new THREE.DataTexture(data, cols, rows, THREE.RGFormat);
	tex.magFilter = THREE.NearestFilter;
	tex.minFilter = THREE.NearestFilter;
	tex.wrapS = THREE.ClampToEdgeWrapping;
	tex.wrapT = THREE.ClampToEdgeWrapping;
	tex.needsUpdate = true;
	return tex;
}

export function useOcclusionField(): OcclusionField {
	const rooms = useActiveRooms();
	const field = useMemo(() => {
		if (!rooms.length) {
			return {
				tex: makeTex(new Uint8Array(2), 1, 1),
				origin: new THREE.Vector2(0, 0),
				size: new THREE.Vector2(1, 1),
			};
		}

		let minC = Infinity;
		let minR = Infinity;
		let maxC = -Infinity;
		let maxR = -Infinity;
		for (const { desc } of rooms) {
			minC = Math.min(minC, desc.originCol);
			minR = Math.min(minR, desc.originRow);
			maxC = Math.max(maxC, desc.originCol + desc.cols);
			maxR = Math.max(maxR, desc.originRow + desc.rows);
		}

		const cols = maxC - minC;
		const rows = maxR - minR;
		// R = occluder (blocks torch light), G = open-sky (oasis, takes sky light).
		const data = new Uint8Array(cols * rows * 2);
		for (const { desc } of rooms) {
			for (let rr = 0; rr < desc.rows; rr++) {
				for (let cc = 0; cc < desc.cols; cc++) {
					const t = desc.tiles[rr * desc.cols + cc];
					const gx = desc.originCol + cc - minC;
					const gy = desc.originRow + rr - minR;
					const gi = (gy * cols + gx) * 2;
					if (t & OCCLUDES) data[gi] = 254;
					if (t & OPEN) data[gi + 1] = 254;
				}
			}
		}

		return {
			tex: makeTex(data, cols, rows),
			origin: new THREE.Vector2(minC * TILE, minR * TILE),
			size: new THREE.Vector2(cols, rows),
		};
	}, [rooms]);

	useEffect(() => () => field.tex.dispose(), [field]);

	return field;
}
