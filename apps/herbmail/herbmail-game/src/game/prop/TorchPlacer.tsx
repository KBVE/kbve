import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { placeTorch, removeTorch } from '../dungeon/store';
import { isHeld } from '../viewmodel/store';
import { headDir } from './torch';
import { MODEL_URLS } from './kinds';

const CENTER = new THREE.Vector2(0, 0);
const RANGE = 4;
const OFF = 0.06;
const SCALE = 1.1;
const HEAD_LOCAL = new THREE.Vector3(0, 0, 1);
const GREEN = new THREE.Color(0x4fdc6a);
const RED = new THREE.Color(0xe0483a);

const TORCH_URL = MODEL_URLS[0];
useGLTF.preload(TORCH_URL);

interface Placement {
	pos: [number, number, number];
	dir: [number, number, number];
	valid: boolean;
}

function placementHit(
	ray: THREE.Raycaster,
	camera: THREE.Camera,
	scene: THREE.Scene,
	nmat: THREE.Matrix3,
): Placement | null {
	ray.setFromCamera(CENTER, camera);
	const hits = ray.intersectObjects(scene.children, true);
	const hit = hits.find((h) => {
		const k = h.object.userData.kind as string | undefined;
		return k === 'wall' || k === 'wall niche' || k === 'archway';
	});
	if (!hit || !hit.face) return null;

	const n = hit.face.normal
		.clone()
		.applyNormalMatrix(nmat.getNormalMatrix(hit.object.matrixWorld));
	n.y = 0;
	if (n.lengthSq() < 1e-4) return null;
	n.normalize();

	return {
		pos: [hit.point.x + n.x * OFF, hit.point.y, hit.point.z + n.z * OFF],
		dir: headDir(n.x, n.z),
		valid: hit.distance <= RANGE,
	};
}

function torchAtCenter(
	ray: THREE.Raycaster,
	camera: THREE.Camera,
	scene: THREE.Scene,
): number | null {
	ray.setFromCamera(CENTER, camera);
	const hits = ray.intersectObjects(scene.children, true);
	for (const h of hits) {
		if (h.distance > RANGE) break;
		let o: THREE.Object3D | null = h.object;
		while (o) {
			const eid = o.userData.eid as number | undefined;
			if (eid !== undefined) return eid;
			o = o.parent;
		}
	}
	return null;
}

export function TorchPlacer() {
	const camera = useThree((s) => s.camera);
	const scene = useThree((s) => s.scene);
	const gltf = useGLTF(TORCH_URL);
	const ray = useRef(new THREE.Raycaster());
	const nmat = useRef(new THREE.Matrix3());
	const last = useRef<Placement | null>(null);

	const { ghost, mat } = useMemo(() => {
		const mat = new THREE.MeshBasicMaterial({
			color: GREEN,
			transparent: true,
			opacity: 0.5,
			depthWrite: false,
		});
		const model = gltf.scene.clone(true);
		model.traverse((o) => {
			const mesh = o as THREE.Mesh;
			if (mesh.isMesh) mesh.material = mat;
		});
		model.scale.setScalar(SCALE);
		model.position.z = SCALE;
		const ghost = new THREE.Group();
		ghost.add(model);
		ghost.visible = false;
		return { ghost, mat };
	}, [gltf.scene]);

	useFrame(() => {
		const active = !!document.pointerLockElement && isHeld('torch');
		if (!active) {
			ghost.visible = false;
			last.current = null;
			return;
		}
		const p = placementHit(ray.current, camera, scene, nmat.current);
		last.current = p;
		if (!p) {
			ghost.visible = false;
			return;
		}
		ghost.visible = true;
		ghost.position.set(p.pos[0], p.pos[1], p.pos[2]);
		ghost.quaternion.setFromUnitVectors(
			HEAD_LOCAL,
			new THREE.Vector3(p.dir[0], p.dir[1], p.dir[2]).normalize(),
		);
		mat.color.copy(p.valid ? GREEN : RED);
	});

	useEffect(() => {
		const onDown = (e: MouseEvent) => {
			if (!document.pointerLockElement) return;
			if (!isHeld('torch')) return;
			if (e.button === 0) {
				const p = last.current;
				if (p && p.valid) placeTorch(p.pos, p.dir);
			} else if (e.button === 2) {
				const eid = torchAtCenter(ray.current, camera, scene);
				if (eid !== null) removeTorch(eid);
			}
		};
		const onCtx = (e: MouseEvent) => {
			if (document.pointerLockElement && isHeld('torch'))
				e.preventDefault();
		};
		window.addEventListener('mousedown', onDown);
		window.addEventListener('contextmenu', onCtx);
		return () => {
			window.removeEventListener('mousedown', onDown);
			window.removeEventListener('contextmenu', onCtx);
		};
	}, [camera, scene]);

	return <primitive object={ghost} />;
}
