import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { solidAtWorld, dungeonSpawn } from '../dungeon/collision';
import { Character, type CharacterHandle } from './Character';

const RADIUS = 0.35;
const CAM_DIST = 2.2;
const CAM_HEIGHT = 1.5;

function tryMove(pos: THREE.Vector3, dx: number, dz: number): void {
	if (!solidAtWorld(pos.x + dx + Math.sign(dx) * RADIUS, pos.z)) pos.x += dx;
	if (!solidAtWorld(pos.x, pos.z + dz + Math.sign(dz) * RADIUS)) pos.z += dz;
}

interface Props {
	url: string;
	scale?: number;
}

export function ThirdPersonPlayer({ url, scale = 1 }: Props) {
	const { camera } = useThree();
	const handleRef = useRef<CharacterHandle | null>(null);
	const keys = useRef<Record<string, boolean>>({});
	const fwd = useRef(new THREE.Vector3());
	const right = useRef(new THREE.Vector3());
	const dir = useRef(new THREE.Vector3());
	const pivot = useRef(new THREE.Vector3());
	const [sx, , sz] = dungeonSpawn();

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

	useFrame(() => {
		const h = handleRef.current;
		if (!h) return;
		const k = keys.current;
		const f = (k['KeyW'] ? 1 : 0) - (k['KeyS'] ? 1 : 0);
		const s = (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0);
		const run = k['ShiftLeft'] || k['ShiftRight'];

		camera.getWorldDirection(fwd.current);
		fwd.current.y = 0;
		fwd.current.normalize();
		right.current.crossVectors(fwd.current, camera.up).normalize();

		dir.current
			.set(0, 0, 0)
			.addScaledVector(fwd.current, f)
			.addScaledVector(right.current, s);
		const speed = run ? 4.5 : 1.8;
		if (dir.current.lengthSq() > 0) {
			dir.current.normalize().multiplyScalar(speed);
		}
		h.motor.setDesiredVelocity(dir.current.x, dir.current.z);

		pivot.current
			.copy(h.motor.position)
			.add(new THREE.Vector3(0, CAM_HEIGHT, 0));
		camera.getWorldDirection(dir.current);
		camera.position
			.copy(pivot.current)
			.addScaledVector(dir.current, -CAM_DIST);
	});

	return (
		<>
			<Character
				url={url}
				scale={scale}
				position={[sx, 0, sz]}
				onReady={(h) => {
					h.motor.mover = tryMove;
					handleRef.current = h;
				}}
			/>
			<PointerLockControls />
		</>
	);
}
