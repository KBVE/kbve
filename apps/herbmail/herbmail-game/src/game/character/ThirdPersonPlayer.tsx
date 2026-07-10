import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { solidAt, spawnPoint } from '../level';
import { TILE } from '../config';
import { Character, type CharacterHandle } from './Character';
import { useEquippedId } from '../viewmodel/store';
import { equipmentById } from '../viewmodel/equipment';
import { SWING, triggerSwing } from './melee';
import { useMelee } from './useMelee';
import { MeleeSpark, TargetDummy } from './MeleeDebug';

const RADIUS = 0.35;
const CAM_DIST = 2.2;
const CAM_HEIGHT = 1.5;
const CAM_MARGIN = 0.2;
const CAM_MIN = 0.4;

// Exact first-wall distance along the camera boom via grid DDA (tile-by-tile),
// ~1-2 tile checks vs a fixed 0.1 march — and no stair-step camera pop.
function clampBoom(
	px: number,
	pz: number,
	dx: number,
	dz: number,
	max: number,
): number {
	const tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
	const tDeltaZ = dz !== 0 ? Math.abs(TILE / dz) : Infinity;
	const stepX = dx > 0 ? 1 : -1;
	const stepZ = dz > 0 ? 1 : -1;
	let cellX = Math.floor(px / TILE);
	let cellZ = Math.floor(pz / TILE);
	let tMaxX =
		dx !== 0
			? ((stepX > 0 ? (cellX + 1) * TILE : cellX * TILE) - px) / dx
			: Infinity;
	let tMaxZ =
		dz !== 0
			? ((stepZ > 0 ? (cellZ + 1) * TILE : cellZ * TILE) - pz) / dz
			: Infinity;

	for (let guard = 0; guard < 16; guard++) {
		const t = Math.min(tMaxX, tMaxZ);
		if (t > max) return max;
		if (tMaxX < tMaxZ) {
			cellX += stepX;
			tMaxX += tDeltaX;
		} else {
			cellZ += stepZ;
			tMaxZ += tDeltaZ;
		}
		// sample just inside the entered cell (honors arch openings)
		if (solidAt(px + dx * (t + 1e-3), pz + dz * (t + 1e-3))) {
			return Math.max(CAM_MIN, t - CAM_MARGIN);
		}
	}
	return max;
}

function tryMove(pos: THREE.Vector3, dx: number, dz: number): void {
	if (!solidAt(pos.x + dx + Math.sign(dx) * RADIUS, pos.z)) pos.x += dx;
	if (!solidAt(pos.x, pos.z + dz + Math.sign(dz) * RADIUS)) pos.z += dz;
}

interface Props {
	url: string;
	scale?: number;
}

export function ThirdPersonPlayer({ url, scale = 1 }: Props) {
	const { camera } = useThree();
	const equippedId = useEquippedId();
	const armed = equipmentById(equippedId).kind === 'weapon';
	const armedRef = useRef(armed);
	useEffect(() => {
		armedRef.current = armed;
	}, [armed]);
	const handleRef = useRef<CharacterHandle | null>(null);
	useMelee();
	const keys = useRef<Record<string, boolean>>({});
	const fwd = useRef(new THREE.Vector3());
	const right = useRef(new THREE.Vector3());
	const dir = useRef(new THREE.Vector3());
	const pivot = useRef(new THREE.Vector3());
	const [sx, , sz] = spawnPoint();

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			keys.current[e.code] = true;
			if (e.code === 'Space') {
				e.preventDefault();
				handleRef.current?.motor.jump();
			}
		};
		const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
		const attack = (e: MouseEvent) => {
			if (e.button !== 0 || !document.pointerLockElement) return;
			const h = handleRef.current;
			if (!h) return;
			if (armedRef.current) {
				// step-in: forward impulse -> legs walk (no slide); masked swing
				// plays over the stepping legs.
				const m = h.motor;
				m.velocity.set(
					Math.sin(m.yaw) * SWING.stepSpeed,
					0,
					Math.cos(m.yaw) * SWING.stepSpeed,
				);
				void h.animator.playMaskedOnce('Attack_Upper');
				triggerSwing();
			} else {
				void h.attack();
			}
		};
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		window.addEventListener('mousedown', attack);
		return () => {
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
			window.removeEventListener('mousedown', attack);
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

		pivot.current.copy(h.motor.position);
		pivot.current.y += CAM_HEIGHT;
		camera.getWorldDirection(dir.current);
		const dist = clampBoom(
			pivot.current.x,
			pivot.current.z,
			-dir.current.x,
			-dir.current.z,
			CAM_DIST,
		);
		camera.position.copy(pivot.current).addScaledVector(dir.current, -dist);
	});

	return (
		<>
			<Character
				url={url}
				scale={scale}
				armed={armed}
				position={[sx, 0, sz]}
				onReady={(h) => {
					h.motor.mover = tryMove;
					handleRef.current = h;
				}}
			/>
			<TargetDummy />
			<MeleeSpark />
			<PointerLockControls />
		</>
	);
}
