import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Prop, Transform3 } from '../mecs/props';
import { placeCrate, breakCrate } from '../dungeon/store';
import { solidAtWorld } from '../dungeon/collision';
import { isHeld } from '../viewmodel/store';
import { getDebrisPool } from '../render/DebrisPool';
import { TILE } from '../config';
import { crateAtTile } from './crateGrid';
import { crateTransform, CRATE_HALF } from './crate';
import { MODEL_URLS, MODEL_CRATE, PROP_CRATE } from './kinds';

const CENTER = new THREE.Vector2(0, 0);
const RANGE = 6;
const GREEN = new THREE.Color(0x4fdc6a);
const RED = new THREE.Color(0xe0483a);
const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const CRATE_URL = MODEL_URLS[MODEL_CRATE];
useGLTF.preload(CRATE_URL);

interface Placement {
	pos: [number, number, number];
	valid: boolean;
}

function floorTile(
	ray: THREE.Raycaster,
	camera: THREE.Camera,
): Placement | null {
	ray.setFromCamera(CENTER, camera);
	const hit = new THREE.Vector3();
	if (!ray.ray.intersectPlane(FLOOR_PLANE, hit)) return null;
	if (hit.distanceTo(camera.position) > RANGE) {
		const wc = Math.floor(hit.x / TILE);
		const wr = Math.floor(hit.z / TILE);
		return { pos: crateTransform(wc, wr), valid: false };
	}
	const wc = Math.floor(hit.x / TILE);
	const wr = Math.floor(hit.z / TILE);
	const cx = (wc + 0.5) * TILE;
	const cz = (wr + 0.5) * TILE;
	const valid = !solidAtWorld(cx, cz) && !crateAtTile(wc, wr);
	return { pos: [cx, CRATE_HALF, cz], valid };
}

function crateAtCenter(
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
			if (eid !== undefined) {
				return Prop.kind[eid] === PROP_CRATE ? eid : null;
			}
			o = o.parent;
		}
	}
	return null;
}

export function CratePlacer() {
	const camera = useThree((s) => s.camera);
	const scene = useThree((s) => s.scene);
	const gltf = useGLTF(CRATE_URL);
	const ray = useRef(new THREE.Raycaster());
	const last = useRef<Placement | null>(null);

	const { ghost, mat } = useMemo(() => {
		const mat = new THREE.MeshBasicMaterial({
			color: GREEN,
			transparent: true,
			opacity: 0.45,
			depthWrite: false,
		});
		const model = gltf.scene.clone(true);
		model.traverse((o) => {
			const mesh = o as THREE.Mesh;
			if (mesh.isMesh) mesh.material = mat;
		});
		const ghost = new THREE.Group();
		ghost.add(model);
		ghost.visible = false;
		return { ghost, mat };
	}, [gltf.scene]);

	useFrame(() => {
		const active = !!document.pointerLockElement && isHeld('crate');
		if (!active) {
			ghost.visible = false;
			last.current = null;
			return;
		}
		const p = floorTile(ray.current, camera);
		last.current = p;
		if (!p) {
			ghost.visible = false;
			return;
		}
		ghost.visible = true;
		ghost.position.set(p.pos[0], p.pos[1], p.pos[2]);
		mat.color.copy(p.valid ? GREEN : RED);
	});

	useEffect(() => {
		const onDown = (e: MouseEvent) => {
			if (!document.pointerLockElement) return;
			if (!isHeld('crate')) return;
			if (e.button === 0) {
				const p = last.current;
				if (p && p.valid) placeCrate(p.pos);
			} else if (e.button === 2) {
				const eid = crateAtCenter(ray.current, camera, scene);
				if (eid !== null) {
					getDebrisPool().burst([
						Transform3.px[eid],
						Transform3.py[eid],
						Transform3.pz[eid],
					]);
					breakCrate(eid);
				}
			}
		};
		const onCtx = (e: MouseEvent) => {
			if (document.pointerLockElement && isHeld('crate'))
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
