import * as THREE from 'three';
import { UV_INSET } from '../config';

export function scaleUV(g: THREE.BufferGeometry, s: number): void {
	const uv = g.attributes.uv as THREE.BufferAttribute;
	for (let i = 0; i < uv.count; i++) {
		uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
	}
	uv.needsUpdate = true;
}

export function insetUV(g: THREE.BufferGeometry): void {
	const uv = g.attributes.uv as THREE.BufferAttribute;
	for (let i = 0; i < uv.count; i++) {
		uv.setXY(
			i,
			UV_INSET + uv.getX(i) * (1 - 2 * UV_INSET),
			UV_INSET + uv.getY(i) * (1 - 2 * UV_INSET),
		);
	}
	uv.needsUpdate = true;
}
