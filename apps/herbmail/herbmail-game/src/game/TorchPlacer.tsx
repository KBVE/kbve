import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { addTorch } from './torches';
import { getEquippedId } from './viewmodel/store';

const CENTER = new THREE.Vector2(0, 0);
const RANGE = 4;
const PITCH = 0.5;
const OFF = 0.06;

export function TorchPlacer() {
	const camera = useThree((s) => s.camera);
	const scene = useThree((s) => s.scene);
	const ray = useRef(new THREE.Raycaster());
	const nmat = useRef(new THREE.Matrix3());

	useEffect(() => {
		const onDown = (e: MouseEvent) => {
			if (e.button !== 0) return;
			if (!document.pointerLockElement) return;
			if (getEquippedId() !== 'torch') return;

			ray.current.setFromCamera(CENTER, camera);
			const hits = ray.current.intersectObjects(scene.children, true);
			const hit = hits.find((h) => {
				const k = h.object.userData.kind as string | undefined;
				return k === 'wall' || k === 'wall niche' || k === 'archway';
			});
			if (!hit || hit.distance > RANGE || !hit.face) return;

			const n = hit.face.normal
				.clone()
				.applyNormalMatrix(
					nmat.current.getNormalMatrix(hit.object.matrixWorld),
				);
			n.y = 0;
			if (n.lengthSq() < 1e-4) return;
			n.normalize();

			const c = Math.cos(PITCH);
			const dir: [number, number, number] = [
				n.x * c,
				Math.sin(PITCH),
				n.z * c,
			];
			const pos: [number, number, number] = [
				hit.point.x + n.x * OFF,
				hit.point.y,
				hit.point.z + n.z * OFF,
			];
			addTorch(pos, dir);
		};
		window.addEventListener('mousedown', onDown);
		return () => window.removeEventListener('mousedown', onDown);
	}, [camera, scene]);

	return null;
}
