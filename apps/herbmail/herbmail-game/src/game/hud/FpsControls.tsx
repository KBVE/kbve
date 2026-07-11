import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { COLS, ROWS, solidAt, spawnPoint } from '../level';
import { TILE } from '../config';

const SPEED = 3.2;
const RADIUS = 0.35;

interface Props {
	eye: number;
	fov: number;
}

function blocked(x: number, z: number): boolean {
	return solidAt(x, z);
}

function tryMove(pos: THREE.Vector3, dx: number, dz: number) {
	if (!blocked(pos.x + dx + Math.sign(dx) * RADIUS, pos.z)) pos.x += dx;
	if (!blocked(pos.x, pos.z + dz + Math.sign(dz) * RADIUS)) pos.z += dz;
}

export function FpsControls({ eye, fov }: Props) {
	const { camera } = useThree();
	const keys = useRef<Record<string, boolean>>({});
	const fwd = useRef(new THREE.Vector3());
	const right = useRef(new THREE.Vector3());
	const spawned = useRef(false);

	useEffect(() => {
		if (spawned.current) {
			camera.position.y = eye;
			return;
		}
		const [x, , z] = spawnPoint();
		camera.position.set(x, eye, z);
		camera.lookAt((COLS * TILE) / 2, eye, (ROWS * TILE) / 2);
		spawned.current = true;
	}, [camera, eye]);

	useEffect(() => {
		const cam = camera as THREE.PerspectiveCamera;
		cam.fov = fov;
		cam.updateProjectionMatrix();
	}, [camera, fov]);

	useEffect(() => {
		const down = (e: KeyboardEvent) => (keys.current[e.code] = true);
		const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		return () => {
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
		};
	}, []);

	useFrame((_, dt) => {
		const k = keys.current;
		const f = (k['KeyW'] ? 1 : 0) - (k['KeyS'] ? 1 : 0);
		const s = (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0);
		if (!f && !s) return;

		camera.getWorldDirection(fwd.current);
		fwd.current.y = 0;
		fwd.current.normalize();
		right.current.crossVectors(fwd.current, camera.up).normalize();

		const move = new THREE.Vector3()
			.addScaledVector(fwd.current, f)
			.addScaledVector(right.current, s);
		if (move.lengthSq() > 0) move.normalize().multiplyScalar(SPEED * dt);

		tryMove(camera.position, move.x, move.z);
	});

	return <PointerLockControls />;
}
