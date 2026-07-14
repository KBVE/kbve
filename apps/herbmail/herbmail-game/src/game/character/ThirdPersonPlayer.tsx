import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import {
	solidAtWorld,
	dungeonSpawn,
	makeMover,
	registerBody,
} from '../dungeon/collision';
import { refreshPrompt, triggerActive } from '../interact/registry';
import { TILE } from '../config';
import { Character, type CharacterHandle, type BlockPose } from './Character';
import { useHands } from '../viewmodel/store';
import { equipmentById } from '../viewmodel/equipment';
import { SWING, triggerSwing } from './melee';
import { useMelee } from './useMelee';
import { useCrateBreak } from './useCrateBreak';
import { useStoneMine } from './useStoneMine';
import { PlayerStats, spend, tickPlayerStats } from './playerStats';
import { isOpen as isInventoryOpen } from '../inventory/store';
import { isPlaying } from '../menu/store';
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
// Chromium reports pointer-lock movementX/Y in physical pixels (Retina = 2x
// what the spec's CSS px say); WebKit reports CSS px. Normalize by DPR on
// Chromium so look speed matches across browsers.
const isChromium =
	typeof navigator !== 'undefined' &&
	((
		navigator as Navigator & {
			userAgentData?: { brands: { brand: string }[] };
		}
	).userAgentData?.brands.some((b) => b.brand === 'Chromium') ??
		/Chrome\//.test(navigator.userAgent));
function lookScale(): number {
	return isChromium ? LOOK_SENS / (window.devicePixelRatio || 1) : LOOK_SENS;
}
const LOOK_FOLLOW = 14;
const PITCH_MAX = 1.4;
const RUN_EP_COST = 25;
const RUN_EP_RECOVER = 30;
// Always-on EP regen means the pool never reads exactly 0 mid-sprint (it hovers at
// one frame of regen). Latch exhaustion at a small floor above that.
const RUN_EP_EMPTY = 1;
const ATTACK_EP_WEAPON = 15;
const ATTACK_EP_PUNCH = 8;

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

interface Props {
	url: string;
	scale?: number;
}

export function ThirdPersonPlayer({ url, scale = 1 }: Props) {
	const { camera, gl } = useThree();
	const hands = useHands();
	const armed = !!hands.right && equipmentById(hands.right).kind === 'weapon';
	const armedRef = useRef(armed);
	useEffect(() => {
		armedRef.current = armed;
	}, [armed]);
	const blockPoseRef = useRef<BlockPose>({
		clip: 'Sword_Block',
		loop: false,
		frac: 0.5,
	});
	useEffect(() => {
		const left = hands.left ? equipmentById(hands.left) : null;
		blockPoseRef.current =
			left && left.kind === 'shield'
				? { clip: 'Idle_Shield_Loop', loop: true }
				: { clip: 'Sword_Block', loop: false, frac: 0.5 };
	}, [hands]);
	const handleRef = useRef<CharacterHandle | null>(null);
	const bodyUnreg = useRef<(() => void) | null>(null);
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
	const exhausted = useRef(false);
	const targetYaw = useRef(0);
	const targetPitch = useRef(0);
	const curYaw = useRef(0);
	const curPitch = useRef(0);
	const eul = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
	const [sx, , sz] = dungeonSpawn();

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (!isPlaying() || isInventoryOpen()) return;
			keys.current[e.code] = true;
			if (e.code === 'Space') {
				e.preventDefault();
				handleRef.current?.motor.jump();
			}
			if (e.code === 'KeyF') triggerActive();
		};
		const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
		const attack = (e: MouseEvent) => {
			if (!document.pointerLockElement) return;
			const h = handleRef.current;
			if (!h) return;
			if (e.button === 2) {
				h.setBlocking(true, blockPoseRef.current);
				return;
			}
			if (e.button !== 0 || h.isBlocking()) return;
			if (armedRef.current) {
				if (PlayerStats.ep.value[PlayerStats.eid] < ATTACK_EP_WEAPON)
					return;
				spend(PlayerStats.ep, ATTACK_EP_WEAPON);
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
				if (PlayerStats.ep.value[PlayerStats.eid] < ATTACK_EP_PUNCH)
					return;
				spend(PlayerStats.ep, ATTACK_EP_PUNCH);
				h.punch();
			}
		};
		const release = (e: MouseEvent) => {
			if (e.button === 2) handleRef.current?.setBlocking(false);
		};
		const noContext = (e: Event) => e.preventDefault();
		// Losing focus / pointer lock never fires keyup or mouseup, so held keys and
		// the RMB block would stay stuck (walk forever, permablock). Clear them.
		const reset = () => {
			keys.current = {};
			handleRef.current?.setBlocking(false);
		};
		const onLockChange = () => {
			if (document.pointerLockElement !== dom) reset();
		};
		// Mouse look drives a TARGET yaw/pitch; the camera eases toward it each
		// frame (see useFrame) so the crosshair glides instead of snapping 1:1.
		const dom = gl.domElement;
		const lock = () => dom.requestPointerLock();
		const move = (e: MouseEvent) => {
			if (document.pointerLockElement !== dom) return;
			const sens = lookScale();
			targetYaw.current -= e.movementX * sens;
			targetPitch.current -= e.movementY * sens;
			targetPitch.current = Math.max(
				-PITCH_MAX,
				Math.min(PITCH_MAX, targetPitch.current),
			);
		};
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		window.addEventListener('mousedown', attack);
		window.addEventListener('mouseup', release);
		window.addEventListener('mousemove', move);
		window.addEventListener('blur', reset);
		document.addEventListener('pointerlockchange', onLockChange);
		dom.addEventListener('click', lock);
		dom.addEventListener('contextmenu', noContext);
		return () => {
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
			window.removeEventListener('mousedown', attack);
			window.removeEventListener('mouseup', release);
			window.removeEventListener('mousemove', move);
			window.removeEventListener('blur', reset);
			document.removeEventListener('pointerlockchange', onLockChange);
			dom.removeEventListener('click', lock);
			dom.removeEventListener('contextmenu', noContext);
		};
	}, [gl]);

	useFrame((_, dtRaw) => {
		// A backgrounded tab balloons dt to multiple seconds on return; a single huge
		// step defeats the sub-stepped collision (tunnels through walls). Clamp it.
		const dt = Math.min(dtRaw, 0.05);
		tickPlayerStats(dt);
		const h = handleRef.current;
		if (!h) return;
		if (!isPlaying()) {
			h.motor.setDesiredVelocity(0, 0);
			return;
		}
		const k = keys.current;
		const menu = isInventoryOpen();
		const f = menu ? 0 : (k['KeyW'] ? 1 : 0) - (k['KeyS'] ? 1 : 0);
		const s = menu ? 0 : (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0);
		const moving = f !== 0 || s !== 0;
		const wantRun = !menu && (k['ShiftLeft'] || k['ShiftRight']);
		// Exhaustion hysteresis: emptying EP locks out sprint until it climbs
		// back past RUN_EP_RECOVER — otherwise the always-on regen would let a
		// one-frame sliver re-trigger running every tick.
		const ep = PlayerStats.ep.value[PlayerStats.eid];
		if (ep <= RUN_EP_EMPTY) exhausted.current = true;
		else if (ep >= RUN_EP_RECOVER) exhausted.current = false;
		const running = wantRun && moving && !exhausted.current;
		if (running) spend(PlayerStats.ep, RUN_EP_COST * dt);

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
		const speed = (running ? 4.5 : 1.8) * (h.isBlocking() ? 0.55 : 1);
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
				rightId={hands.right}
				leftId={hands.left}
				position={[sx, 0, sz]}
				onReady={(h) => {
					const body = { pos: h.motor.position, radius: RADIUS };
					bodyUnreg.current?.();
					bodyUnreg.current = registerBody(body);
					h.motor.mover = makeMover(RADIUS, body);
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
