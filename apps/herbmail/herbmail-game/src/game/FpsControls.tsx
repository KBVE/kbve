import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { COLS, isWall, ROWS, spawnPoint, TILE } from './level';

const SPEED = 3.2;
const RADIUS = 0.35;

function blocked(x: number, z: number): boolean {
	const col = Math.floor(x / TILE);
	const row = Math.floor(z / TILE);
	return isWall(col, row);
}

function tryMove(pos: THREE.Vector3, dx: number, dz: number) {
	if (!blocked(pos.x + dx + Math.sign(dx) * RADIUS, pos.z)) pos.x += dx;
	if (!blocked(pos.x, pos.z + dz + Math.sign(dz) * RADIUS)) pos.z += dz;
}

export function FpsControls() {
	const { camera } = useThree();
	const keys = useRef<Record<string, boolean>>({});
	const fwd = useRef(new THREE.Vector3());
	const right = useRef(new THREE.Vector3());

	useEffect(() => {
		const [x, y, z] = spawnPoint();
		camera.position.set(x, y, z);
		camera.lookAt((COLS * TILE) / 2, y, (ROWS * TILE) / 2);
	}, [camera]);

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
