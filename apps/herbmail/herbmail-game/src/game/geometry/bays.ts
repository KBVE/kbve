import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COVE_R, TILE, WALL_H } from '../config';
import { exposedFaces, faceMatrix, isBay, type Face } from './faces';
import { jitter } from './rng';
import { scaleUV } from './uv';

const HALF = TILE / 2;
const CAP_H = WALL_H - COVE_R;
const BASE = CAP_H * 0.08;

interface Niche {
	openHW: number;
	spring: number;
	recess: number;
}

function nicheOf(face: Face): Niche {
	return {
		openHW: jitter(
			face.col,
			face.row,
			face.di + 1,
			TILE * 0.22,
			TILE * 0.34,
		),
		spring: jitter(
			face.col,
			face.row,
			face.di + 2,
			CAP_H * 0.5,
			CAP_H * 0.72,
		),
		recess: jitter(face.col, face.row, face.di + 3, 0.25, 0.45),
	};
}

function frameShape(n: Niche): THREE.Shape {
	const s = new THREE.Shape();
	s.moveTo(-HALF, 0);
	s.lineTo(HALF, 0);
	s.lineTo(HALF, CAP_H);
	s.lineTo(-HALF, CAP_H);
	s.closePath();
	const h = new THREE.Path();
	h.moveTo(-n.openHW, BASE);
	h.lineTo(n.openHW, BASE);
	h.lineTo(n.openHW, n.spring);
	h.absarc(0, n.spring, n.openHW, 0, Math.PI, false);
	h.lineTo(-n.openHW, BASE);
	s.holes.push(h);
	return s;
}

function nicheShape(n: Niche): THREE.Shape {
	const s = new THREE.Shape();
	s.moveTo(-n.openHW, BASE);
	s.lineTo(n.openHW, BASE);
	s.lineTo(n.openHW, n.spring);
	s.absarc(0, n.spring, n.openHW, 0, Math.PI, false);
	s.lineTo(-n.openHW, BASE);
	return s;
}

export interface BayGeometry {
	frames: THREE.BufferGeometry;
	backs: THREE.BufferGeometry;
}

export function buildBays(): BayGeometry {
	const faces = exposedFaces().filter(isBay);
	if (!faces.length) {
		return {
			frames: new THREE.BufferGeometry(),
			backs: new THREE.BufferGeometry(),
		};
	}

	const frameParts: THREE.BufferGeometry[] = [];
	const backParts: THREE.BufferGeometry[] = [];
	for (const face of faces) {
		const n = nicheOf(face);
		const m = faceMatrix(face, 0);

		const frame = new THREE.ExtrudeGeometry(frameShape(n), {
			depth: n.recess,
			bevelEnabled: false,
		});
		scaleUV(frame, 1 / TILE);
		frame.scale(1, 1, -1);
		frame.applyMatrix4(m);
		frameParts.push(frame);

		const back = new THREE.ShapeGeometry(nicheShape(n));
		scaleUV(back, 1 / TILE);
		back.translate(0, 0, -n.recess);
		back.applyMatrix4(m);
		backParts.push(back);
	}

	return {
		frames: mergeGeometries(frameParts, false),
		backs: mergeGeometries(backParts, false),
	};
}
