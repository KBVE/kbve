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

// One tile of empty border on every side. skyAtWorld used to take the 3x3 max in
// the fragment shader and skip neighbours that fell outside the grid; baking that
// max here would otherwise disagree at the boundary, where a centre tile sits
// outside but its neighbours do not. With the border, every centre the shader
// could have evaluated is in range and the padding contributes 0 exactly as the
// skipped samples did — so the baked result is identical, not merely close.
export const PAD = 1;

// The 3x3 max over the open-sky channel, hoisted out of the fragment shader. It
// only changes when the active room set does, but was costing 9 texture fetches
// on every lit fragment of every wall, floor and ceiling.
export function dilateSky(data: Uint8Array, cols: number, rows: number): void {
	// Written to a scratch buffer: dilating in place would feed each result into
	// the next window and smear the mask across the grid.
	const out = new Uint8Array(cols * rows);
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			let best = 0;
			for (let dy = -1; dy <= 1; dy++) {
				const ny = y + dy;
				if (ny < 0 || ny >= rows) continue;
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx;
					if (nx < 0 || nx >= cols) continue;
					const v = data[(ny * cols + nx) * 2 + 1];
					if (v > best) best = v;
				}
			}
			out[y * cols + x] = best;
		}
	}
	for (let i = 0; i < out.length; i++) data[i * 2 + 1] = out[i];
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

		const cols = maxC - minC + PAD * 2;
		const rows = maxR - minR + PAD * 2;
		// R = occluder (blocks torch light), G = open-sky (oasis, takes sky light).
		const data = new Uint8Array(cols * rows * 2);
		for (const { desc } of rooms) {
			for (let rr = 0; rr < desc.rows; rr++) {
				for (let cc = 0; cc < desc.cols; cc++) {
					const t = desc.tiles[rr * desc.cols + cc];
					const gx = desc.originCol + cc - minC + PAD;
					const gy = desc.originRow + rr - minR + PAD;
					const gi = (gy * cols + gx) * 2;
					if (t & OCCLUDES) data[gi] = 254;
					if (t & OPEN) data[gi + 1] = 254;
				}
			}
		}
		dilateSky(data, cols, rows);

		return {
			tex: makeTex(data, cols, rows),
			origin: new THREE.Vector2((minC - PAD) * TILE, (minR - PAD) * TILE),
			size: new THREE.Vector2(cols, rows),
		};
	}, [rooms]);

	useEffect(() => () => field.tex.dispose(), [field]);

	return field;
}
