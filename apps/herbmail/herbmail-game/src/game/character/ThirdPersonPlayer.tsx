import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import {
	solidAtWorld,
	floorYAtWorld,
	dungeonSpawn,
	makeMover,
	registerBody,
} from '../dungeon/collision';
import { refreshPrompt, triggerActive } from '../interact/registry';
import { TILE } from '../config';
import { Character, type CharacterHandle, type BlockPose } from './Character';
import { useHands } from '../viewmodel/store';
import { equipmentById } from '../viewmodel/equipment';
import { triggerSwing } from './melee';
import { useMelee } from './useMelee';
import { useCrateBreak } from './useCrateBreak';
import { useStoneMine } from './useStoneMine';
import { PlayerStats, spend, tickPlayerStats } from './playerStats';
import { isOpen as isInventoryOpen } from '../inventory/store';
import { isPlaying } from '../menu/store';
import { isEagle } from '../menu/eagleStore';
import { MeleeSpark, TargetDummy } from './MeleeDebug';
import { CharacterShadow } from './CharacterShadow';
import {
	acquireOrCycle,
	dropTarget,
	getTarget,
	isHardLock,
	setHardLock,
	tickTargeting,
} from '../combat/targeting';
import { losBlockedAt } from '../combat/los';
import { TargetMarker } from '../combat/TargetMarker';
import { Transform3, Caster } from '../mecs/props';
import { playerEid, playerBits, writePlayerBits } from './playerEntity';
import { CS, canBlockBits } from './charState';
import { requestCast } from '../combat/castSystem';
import { BASIC_ID, CastPhase, abilityById } from '../combat/ability';
import { bindSwimHandle, registerSwimEntry, tickSwim, swimSpeed } from './swim';

const RADIUS = 0.35;
const CAM_DIST = 2.2;
const CAM_HEIGHT = 1.5;
const CAM_MARGIN = 0.2;
const CAM_MIN = 0.4;
const SHOULDER = 0.62;
const SHOULDER_LERP = 0.15;
const CAM_FOLLOW = 12;
const LOOK_SENS = 0.002;

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
const TAB_HOLD_MS = 250;

function wrapPi(a: number): number {
	let d = ((a + Math.PI) % (Math.PI * 2)) - Math.PI;
	if (d < -Math.PI) d += Math.PI * 2;
	return d;
}
const RUN_EP_COST = 18;
const RUN_EP_RECOVER = 30;

const RUN_EP_EMPTY = 1;
const ATTACK_EP_PUNCH = 4;

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
		const shield = !!left && left.kind === 'shield';
		blockPoseRef.current = shield
			? { clip: 'Idle_Shield_Loop', loop: true }
			: { clip: 'Sword_Block', loop: false, frac: 0.5 };

		if (!canBlockBits(playerBits())) handleRef.current?.setBlocking(false);
	}, [hands, armed]);
	const handleRef = useRef<CharacterHandle | null>(null);
	const bodyUnreg = useRef<(() => void) | null>(null);
	// Two movers: the normal one collides with walls + actor bodies; the terrain
	// mover collides with walls only, used while lunging so a combo slides on
	// walls but passes through enemies instead of being deflected off them.
	const bodyMover = useRef<ReturnType<typeof makeMover> | null>(null);
	const terrainMover = useRef<ReturnType<typeof makeMover> | null>(null);
	useMelee();
	useCrateBreak();
	useStoneMine();
	useEffect(() => registerSwimEntry(), []);
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
	const tabDownAt = useRef(0);
	const tabHardEngaged = useRef(false);
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
			if (e.code === 'Tab') {
				e.preventDefault();
				if (!e.repeat) {
					tabDownAt.current = performance.now();
					tabHardEngaged.current = false;
				}
			}
			if (e.code === 'Escape') dropTarget();
		};
		const up = (e: KeyboardEvent) => {
			keys.current[e.code] = false;
			if (e.code === 'Tab') {
				if (tabHardEngaged.current) {
					setHardLock(false);
					tabHardEngaged.current = false;
				} else {
					const h = handleRef.current;
					if (h) {
						camera.getWorldDirection(fwd.current);
						acquireOrCycle(
							h.motor.position.x,
							h.motor.position.z,
							fwd.current.x,
							fwd.current.z,
							losBlockedAt,
						);
					}
				}
			}
		};
		const attack = (e: MouseEvent) => {
			if (!document.pointerLockElement) return;
			const h = handleRef.current;
			if (!h || h.motor.mode !== 'ground') return;
			if (e.button === 2) {
				if (canBlockBits(playerBits()))
					h.setBlocking(true, blockPoseRef.current);
				return;
			}
			if (e.button !== 0 || h.isBlocking()) return;

			const locked = getTarget();
			if (locked !== null) {
				h.motor.yaw = Math.atan2(
					Transform3.px[locked] - h.motor.position.x,
					Transform3.pz[locked] - h.motor.position.z,
				);
			}
			if (armedRef.current) {
				// Armed basic attack routes through the cast system (ability 0):
				// castSystem drives the phases + goblin damage, Character plays the
				// clip, and the lunge is applied per-frame from the cast phase below.
				// triggerSwing still fires so the mesh-hitbox path keeps breaking
				// crates/stones (props carry Health but no Targetable).
				requestCast(playerEid(), BASIC_ID);
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

		const reset = () => {
			keys.current = {};
			handleRef.current?.setBlocking(false);
		};
		const onLockChange = () => {
			if (document.pointerLockElement !== dom) reset();
		};

		const dom = gl.domElement;
		const lock = () => {
			if (isEagle()) return;
			dom.requestPointerLock();
		};
		const move = (e: MouseEvent) => {
			if (document.pointerLockElement !== dom) return;

			if (isHardLock()) return;
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
		const dt = Math.min(dtRaw, 0.05);
		tickPlayerStats(dt);
		const h = handleRef.current;
		if (!h) return;
		if (!isPlaying() || isEagle()) {
			h.motor.setDesiredVelocity(0, 0);
			return;
		}
		const k = keys.current;
		const menu = isInventoryOpen();
		const f = menu ? 0 : (k['KeyW'] ? 1 : 0) - (k['KeyS'] ? 1 : 0);
		const s = menu ? 0 : (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0);
		const moving = f !== 0 || s !== 0;
		const wantRun = !menu && (k['ShiftLeft'] || k['ShiftRight']);

		const ep = PlayerStats.ep.value[PlayerStats.eid];
		if (ep <= RUN_EP_EMPTY) exhausted.current = true;
		else if (ep >= RUN_EP_RECOVER) exhausted.current = false;
		const running = wantRun && moving && !exhausted.current;
		if (running) spend(PlayerStats.ep, RUN_EP_COST * dt);
		writePlayerBits(
			CS.EXHAUSTED | CS.HARD_LOCK,
			(exhausted.current ? CS.EXHAUSTED : 0) |
				(isHardLock() ? CS.HARD_LOCK : 0),
		);
		const pe = playerEid();
		Transform3.px[pe] = h.motor.position.x;
		Transform3.py[pe] = h.motor.position.y;
		Transform3.pz[pe] = h.motor.position.z;
		Transform3.dx[pe] = Math.sin(h.motor.yaw);
		Transform3.dz[pe] = Math.cos(h.motor.yaw);

		tickTargeting(h.motor.position.x, h.motor.position.z);

		if (
			k['Tab'] &&
			!tabHardEngaged.current &&
			getTarget() !== null &&
			performance.now() - tabDownAt.current > TAB_HOLD_MS
		) {
			setHardLock(true);
			tabHardEngaged.current = true;
		}

		const hardEid = isHardLock() ? getTarget() : null;
		if (hardEid !== null) {
			const tx = Transform3.px[hardEid] - h.motor.position.x;
			const ty =
				Transform3.py[hardEid] +
				1.0 -
				(h.motor.position.y + CAM_HEIGHT);
			const tz = Transform3.pz[hardEid] - h.motor.position.z;
			const planar = Math.hypot(tx, tz) || 1;
			const yawTo = Math.atan2(-tx, -tz);
			targetYaw.current = curYaw.current + wrapPi(yawTo - curYaw.current);
			targetPitch.current = Math.max(
				-PITCH_MAX,
				Math.min(PITCH_MAX, Math.atan2(ty, planar)),
			);

			h.motor.yawLock = Math.atan2(tx, tz);
		} else {
			h.motor.yawLock = null;
		}

		const look = 1 - Math.exp(-LOOK_FOLLOW * dt);
		curYaw.current += (targetYaw.current - curYaw.current) * look;
		curPitch.current += (targetPitch.current - curPitch.current) * look;
		eul.current.set(curPitch.current, curYaw.current, 0);
		camera.quaternion.setFromEuler(eul.current);

		const swimming = h.motor.mode === 'swim';
		camera.getWorldDirection(fwd.current);
		// Swimming steers along the full camera direction (dive by looking
		// down); on foot movement stays planar.
		if (!swimming) fwd.current.y = 0;
		fwd.current.normalize();
		right.current.crossVectors(fwd.current, camera.up).normalize();
		right.current.y = 0;

		dir.current
			.set(0, 0, 0)
			.addScaledVector(fwd.current, f)
			.addScaledVector(right.current, s);
		if (swimming && !menu && k['Space']) dir.current.y += 0.8;
		const speed = swimming
			? swimSpeed()
			: (running ? 4.5 : 1.8) * (h.isBlocking() ? 0.55 : 1);
		if (dir.current.lengthSq() > 0) {
			dir.current.normalize().multiplyScalar(speed);
		}
		h.motor.setDesiredVelocity(
			dir.current.x,
			dir.current.z,
			swimming ? dir.current.y : 0,
		);
		tickSwim(dt, f > 0);
		// During an ability cast's windup/active, drive a forward lunge along
		// facing (dash abilities push harder), overriding WASD; recover releases.
		const cphase = Caster.phase[pe];
		const castAb =
			cphase === CastPhase.Windup || cphase === CastPhase.Active
				? abilityById(Caster.ability[pe])
				: undefined;
		if (castAb && (castAb.lunge > 0 || castAb.dash)) {
			const push = castAb.dash ? castAb.lunge * 2 : castAb.lunge;
			h.motor.setDesiredVelocity(
				Math.sin(h.motor.yaw) * push,
				Math.cos(h.motor.yaw) * push,
			);
			// Slide on terrain only for the lunge — pass through enemies.
			if (terrainMover.current) h.motor.mover = terrainMover.current;
		} else if (bodyMover.current && h.motor.mover !== bodyMover.current) {
			h.motor.mover = bodyMover.current;
		}
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

		const a = 1 - Math.exp(-CAM_FOLLOW * dt);
		camera.position.lerp(desired.current, a);
	});

	return (
		<>
			<Character
				url={url}
				scale={scale}
				armed={armed}
				stateEid={playerEid}
				rightId={hands.right}
				leftId={hands.left}
				position={[sx, 0, sz]}
				onReady={(h) => {
					const body = { pos: h.motor.position, radius: RADIUS };
					bodyUnreg.current?.();
					bodyUnreg.current = registerBody(body);
					bodyMover.current = makeMover(RADIUS, body);
					terrainMover.current = makeMover(RADIUS, body, true);
					h.motor.mover = bodyMover.current;
					h.motor.floorAt = floorYAtWorld;
					bindSwimHandle(h);
					handleRef.current = h;
					(window as unknown as Record<string, unknown>).__coll = {
						solid: solidAtWorld,
						pos: h.motor.position,
					};
				}}
			/>
			<CharacterShadow target={handleRef} />
			<TargetDummy />
			<TargetMarker />
			<MeleeSpark />
		</>
	);
}
