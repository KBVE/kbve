import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { solidAtWorld, dungeonSpawn } from '../dungeon/collision';
import { refreshPrompt, triggerActive } from '../interact/registry';
import { TILE } from '../config';
import { Character, type CharacterHandle } from './Character';
import { useEquippedId } from '../viewmodel/store';
import { equipmentById } from '../viewmodel/equipment';
import { SWING, triggerSwing } from './melee';
import { useMelee } from './useMelee';
import { useCrateBreak } from './useCrateBreak';
import { useStoneMine } from './useStoneMine';
import { tickPlayerStats } from './playerStats';
import { MeleeSpark, TargetDummy } from './MeleeDebug';
import { CharacterShadow } from './CharacterShadow';

const RADIUS = 0.35;
const CAM_DIST = 2.2;
const CAM_HEIGHT = 1.5;
const CAM_MARGIN = 0.2;
const CAM_MIN = 0.4;
const SHOULDER = 0.62;
const SHOULDER_LERP = 0.15;
const CAM_FOLLOW = 12;
const LOOK_SENS = 0.002;
const LOOK_FOLLOW = 14;
const PITCH_MAX = 1.4;

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
		if (solidAtWorld(px + dx * (t + 1e-3), pz + dz * (t + 1e-3))) {
			return Math.max(CAM_MIN, t - CAM_MARGIN);
		}
	}
	return max;
}

function moveAxis(pos: THREE.Vector3, dx: number, dz: number): void {
	if (dx !== 0 && !solidAtWorld(pos.x + dx + Math.sign(dx) * RADIUS, pos.z))
		pos.x += dx;
	if (dz !== 0 && !solidAtWorld(pos.x, pos.z + dz + Math.sign(dz) * RADIUS))
		pos.z += dz;
}

// Sub-step so a single frame never advances more than RADIUS (< one tile): a long
// frame or fast move would otherwise sample past a thin wall and tunnel through it.
function tryMove(pos: THREE.Vector3, dx: number, dz: number): void {
	const dist = Math.hypot(dx, dz);
	const steps = Math.min(64, Math.max(1, Math.ceil(dist / RADIUS)));
	const sx = dx / steps;
	const sz = dz / steps;
	for (let i = 0; i < steps; i++) moveAxis(pos, sx, sz);
}

interface Props {
	url: string;
	scale?: number;
}

export function ThirdPersonPlayer({ url, scale = 1 }: Props) {
	const { camera, gl } = useThree();
	const equippedId = useEquippedId();
	const armed = equipmentById(equippedId).kind === 'weapon';
	const armedRef = useRef(armed);
	useEffect(() => {
		armedRef.current = armed;
	}, [armed]);
	const handleRef = useRef<CharacterHandle | null>(null);
	useMelee();
	useCrateBreak();
	useStoneMine();
	const keys = useRef<Record<string, boolean>>({});
	const fwd = useRef(new THREE.Vector3());
	const right = useRef(new THREE.Vector3());
	const dir = useRef(new THREE.Vector3());
	const pivot = useRef(new THREE.Vector3());
	const desired = useRef(new THREE.Vector3());
	const shoulder = useRef(1);
	const targetYaw = useRef(0);
	const targetPitch = useRef(0);
	const curYaw = useRef(0);
	const curPitch = useRef(0);
	const eul = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
	const [sx, , sz] = dungeonSpawn();

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			keys.current[e.code] = true;
			if (e.code === 'Space') {
				e.preventDefault();
				handleRef.current?.motor.jump();
			}
			if (e.code === 'KeyF') triggerActive();
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
		// Mouse look drives a TARGET yaw/pitch; the camera eases toward it each
		// frame (see useFrame) so the crosshair glides instead of snapping 1:1.
		const dom = gl.domElement;
		const lock = () => dom.requestPointerLock();
		const move = (e: MouseEvent) => {
			if (document.pointerLockElement !== dom) return;
			targetYaw.current -= e.movementX * LOOK_SENS;
			targetPitch.current -= e.movementY * LOOK_SENS;
			targetPitch.current = Math.max(
				-PITCH_MAX,
				Math.min(PITCH_MAX, targetPitch.current),
			);
		};
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		window.addEventListener('mousedown', attack);
		window.addEventListener('mousemove', move);
		dom.addEventListener('click', lock);
		return () => {
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
			window.removeEventListener('mousedown', attack);
			window.removeEventListener('mousemove', move);
			dom.removeEventListener('click', lock);
		};
	}, [gl]);

	useFrame((_, dt) => {
		tickPlayerStats(dt);
		const h = handleRef.current;
		if (!h) return;
		const k = keys.current;
		const f = (k['KeyW'] ? 1 : 0) - (k['KeyS'] ? 1 : 0);
		const s = (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0);
		const run = k['ShiftLeft'] || k['ShiftRight'];

		// Ease camera orientation toward the mouse target (frame-rate independent).
		const look = 1 - Math.exp(-LOOK_FOLLOW * dt);
		curYaw.current += (targetYaw.current - curYaw.current) * look;
		curPitch.current += (targetPitch.current - curPitch.current) * look;
		eul.current.set(curPitch.current, curYaw.current, 0);
		camera.quaternion.setFromEuler(eul.current);

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
		refreshPrompt(h.motor.position.x, h.motor.position.z);

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
		desired.current.copy(pivot.current).addScaledVector(dir.current, -dist);

		// Fixed right-shoulder offset. Only dynamic edge case: if the full offset
		// would clip a wall, ease the shoulder back in toward center, then ease
		// back out once clear — no side switching, no movement coupling.
		const blocked = solidAtWorld(
			desired.current.x + right.current.x * SHOULDER,
			desired.current.z + right.current.z * SHOULDER,
		);
		shoulder.current +=
			((blocked ? 0 : 1) - shoulder.current) * SHOULDER_LERP;
		desired.current.addScaledVector(
			right.current,
			SHOULDER * shoulder.current,
		);

		// Frame-rate independent critically-damped follow so the camera trails the
		// player smoothly instead of hard-snapping each frame.
		const a = 1 - Math.exp(-CAM_FOLLOW * dt);
		camera.position.lerp(desired.current, a);
	});

	return (
		<>
			<Character
				url={url}
				scale={scale}
				armed={armed}
				heldId={equippedId}
				position={[sx, 0, sz]}
				onReady={(h) => {
					h.motor.mover = tryMove;
					handleRef.current = h;
					(window as unknown as Record<string, unknown>).__coll = {
						solid: solidAtWorld,
						pos: h.motor.position,
					};
				}}
			/>
			<CharacterShadow target={handleRef} />
			<TargetDummy />
			<MeleeSpark />
		</>
	);
}
