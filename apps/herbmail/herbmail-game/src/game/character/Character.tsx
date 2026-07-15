import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CharacterAnimator } from './CharacterAnimator';
import {
	CharacterMotor,
	DEFAULT_MOTOR,
	type MotorConfig,
} from './CharacterMotor';
import { ProceduralPose } from './ProceduralPose';
import {
	classifyStrafe,
	strafeBin,
	type StrafeBin,
	type StrafeState,
} from './strafe';
import { CS, resolveBase, resolveOverlays } from './charState';
import { CharState, Caster } from '../mecs/props';
import { getTarget } from '../combat/targeting';
import { Transform3 } from '../mecs/props';
import { CastPhase, abilityById, castDuration } from '../combat/ability';
import { EquipmentPhysics } from './equipmentPhysics';
import { WEAPON_GRIP } from './weaponGrip';
import { useCharacterParts } from './useCharacterParts';
import type { PartSet } from './armor';
import { getEquipped, useEquippedArmor } from './armor';
import { useBodySkinMorph } from './body';
import { useSkinTint } from './skin';
import { triggerSwing } from './melee';
import { makeFlameMaterial } from '../render/flameMaterial';
import { buildEmbers } from '../render/emberParticles';
import { heldLight, setHeldLight, clearHeldLight } from '../render/heldLight';
import {
	HELD_ITEMS,
	VERTICAL_GRIP,
	VERTICAL_GRIP_LEFT,
	SWORD_URL,
	TORCH_URL,
} from './heldItems';

const UP = new THREE.Vector3(0, 1, 0);
const LAND_SPEED = 2.4;
const LAND_HOLD_FRAC = 0.3;

const AIR_ANIM_DELAY = 0.65;
const GROUND_Y = -0.037;

const _flexAxis = new THREE.Vector3(1, 0, 0);
const _hangAxis = new THREE.Vector3(0, 0, 1);
const TWIST_Y = new THREE.Vector3(0, 1, 0);
const COMBAT_LOOK_Y = 1.2;
const COMBAT_LOOK_WEIGHT = 0.85;
const WALK_SPEED_REF = 1.8;
const _combatLook = new THREE.Vector3();
const _bodyFwd = new THREE.Vector3();
const SPINE_FLEX_DEFAULT = 4;
const SPINE_FLEX_BY_CLIP: Record<string, number> = {
	Idle_Loop: 4,
	Walk_Loop: 6,
	Jog_Fwd_Loop: 6,
	Sprint_Loop: 6,
	Sword_Idle: 8,
};
const SPINE_FLEX = [
	{ bone: 'spine_01', frac: 0.85 },
	{ bone: 'spine_02', frac: 0.15 },
];
const FINGER_RE = /^(index|middle|ring|pinky|thumb)_0\d_(l|r)$/;
const HAND_OPEN = 0.72;
const HAND_GRIP = 0.9;
const ARM_HANG_DEG = 11 as number;
const _sf1 = new THREE.Quaternion();
const _sf2 = new THREE.Quaternion();
const _sf3 = new THREE.Quaternion();
const _vel = new THREE.Vector3();
const BLOCK_CLIPS = ['Sword_Block', 'Idle_Shield_Loop'];
const DEFAULT_BLOCK: BlockPose = {
	clip: 'Sword_Block',
	loop: false,
	frac: 0.5,
};
const PUNCH_CHAIN = [
	{ clip: 'Punch_Jab', hand: 'hand_l', ts: 1.35, out: 0.18 },
	{ clip: 'Punch_Cross', hand: 'hand_r', ts: 1.3, out: 0.18 },
	{ clip: 'Melee_Hook', hand: 'hand_r', ts: 1.15, out: 0.32 },
];
const PUNCH_WINDOW = 0.35;
const PUNCH_REACH = 0.45;

const TORCH_LIGHT_GAIN = 1.0;
const TORCH_LIGHT_REACH = 13;
const TORCH_LIGHT_DECAY = 1.1;

useGLTF.preload(SWORD_URL);
useGLTF.preload(TORCH_URL);

const HELD_FLAME_SCALE = 0.24;

const FLAME_LEAN_GAIN = 0.09;
const FLAME_LEAN_K = 90;
const FLAME_LEAN_D = 13;
const FLAME_LEAN_MAX = 0.6;
const flameGeo = new THREE.PlaneGeometry(0.66, 1);

function buildFlame(gripScale: number): {
	flame: THREE.Group;
	mats: THREE.ShaderMaterial[];
} {
	const mats: THREE.ShaderMaterial[] = [];
	const flame = new THREE.Group();
	flame.scale.setScalar(HELD_FLAME_SCALE / gripScale);
	for (let i = 0; i < 3; i++) {
		const mat = makeFlameMaterial(i * 3.713, 12);
		mats.push(mat);
		const mesh = new THREE.Mesh(flameGeo, mat);
		mesh.rotation.y = (i / 3) * Math.PI;
		mesh.position.y = flameGeo.parameters.height * 0.5;
		mesh.renderOrder = 10;
		flame.add(mesh);
	}

	const embers = buildEmbers();
	flame.add(embers.points);
	mats.push(embers.mat);
	return { flame, mats };
}

const UPPER_BONE =
	/spine|neck|head|clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky|prop/i;

function isUpperBone(name: string): boolean {
	return UPPER_BONE.test(name);
}

const LOWER_BONE = /pelvis|thigh|calf|foot|ball|hipAttach|kneeAttach/i;

const CLAMPED_CLIPS = new WeakSet<THREE.AnimationClip>();
function clampIdleLegs(clips: THREE.AnimationClip[]): void {
	for (const c of clips) {
		if (c.name !== 'Idle_Loop' || CLAMPED_CLIPS.has(c)) continue;
		CLAMPED_CLIPS.add(c);
		for (const t of c.tracks) {
			if (!LOWER_BONE.test(t.name.split('.')[0])) continue;
			const size = t.getValueSize();
			t.times = t.times.slice(0, 1);
			t.values = t.values.slice(0, size);
		}
	}
}

export interface BlockPose {
	clip: string;
	loop: boolean;
	frac?: number;
}

export interface CharacterHandle {
	motor: CharacterMotor;
	animator: CharacterAnimator;
	pose: ProceduralPose;
	attack: () => Promise<void>;
	punch: () => void;
	setBlocking: (b: boolean, pose?: BlockPose) => void;
	isBlocking: () => boolean;
	bone: (name: string) => THREE.Object3D | null;
}

interface Props {
	url: string;
	position?: [number, number, number];
	scale?: number;
	motorConfig?: MotorConfig;
	lookTarget?: THREE.Vector3 | null;
	armed?: boolean;
	rightId?: string | null;
	leftId?: string | null;
	tint?: string;
	armor?: Set<string>;
	hide?: Set<string>;
	bodySet?: Exclude<PartSet, 'KNGT'>;
	locomotion?: LocomotionClips;
	onReady?: (h: CharacterHandle) => void;
	drive?: (motor: CharacterMotor, t: number) => void;

	stateEid?: () => number;
}

export interface LocomotionClips {
	idle: string;
	walk: string;
	run: string;

	speedRef?: number;

	idleOverlay?: string;
}

const DEFAULT_LOCOMOTION: LocomotionClips = {
	idle: 'Idle_Loop',
	walk: 'Walk_Loop',
	run: 'Jog_Fwd_Loop',
};

const WALK_TS_MIN = 0.6;
const WALK_TS_MAX = 2.6;

const REBASED_CLIPS = new WeakSet<THREE.AnimationClip>();
function rebasePelvis(clips: THREE.AnimationClip[], restY: number): void {
	for (const c of clips) {
		if (!c.name.startsWith('Zombie_') || REBASED_CLIPS.has(c)) continue;
		REBASED_CLIPS.add(c);
		const track = c.tracks.find((t) => t.name === 'pelvis.position');
		if (!track) continue;
		const v = track.values;
		let sum = 0;
		for (let i = 1; i < v.length; i += 3) sum += v[i];
		const delta = sum / (v.length / 3) - restY;
		for (let i = 1; i < v.length; i += 3) v[i] -= delta;
	}
}

export function Character({
	url,
	position = [0, 0, 0],
	scale = 1,
	motorConfig = DEFAULT_MOTOR,
	lookTarget = null,
	armed = false,
	rightId = null,
	leftId = null,
	tint,
	armor,
	hide,
	bodySet,
	locomotion = DEFAULT_LOCOMOTION,
	onReady,
	drive,
	stateEid,
}: Props) {
	const gltf = useGLTF(url);
	const sword = useGLTF(SWORD_URL);
	const torch = useGLTF(TORCH_URL);
	const heldAnchor = useRef<THREE.Object3D | null>(null);
	const heldFlame = useRef<THREE.Object3D | null>(null);
	const heldMats = useRef<THREE.ShaderMaterial[] | null>(null);
	const heldPos = useRef(new THREE.Vector3());
	const heldQuat = useRef(new THREE.Quaternion());

	const flamePrev = useRef<THREE.Vector3 | null>(null);
	const leanRef = useRef({ x: 0, z: 0, vx: 0, vz: 0 });
	const leanTilt = useRef(new THREE.Quaternion());
	const leanEuler = useRef(new THREE.Euler());

	const flameVel = useRef(new THREE.Vector3());
	const heldLightCfg = useRef<{
		intensity: number;
		color: [number, number, number];
	} | null>(null);
	const groupRef = useRef<THREE.Group>(null);
	const torchLight = useRef<THREE.PointLight>(null);

	const flamePool = useRef<{
		flame: THREE.Group;
		mats: THREE.ShaderMaterial[];
	} | null>(null);
	const tRef = useRef(0);
	const jumpRef = useRef({
		wasGrounded: true,
		landUntil: 0,
		recover: false,
		airStart: 0,
		rose: false,
	});
	const comboRef = useRef({ step: -1, until: 0 });
	const castPhaseRef = useRef(0);
	const localBits = useRef(0);
	const blockRef = useRef<{ on: boolean; pose: BlockPose }>({
		on: false,
		pose: DEFAULT_BLOCK,
	});

	const scene = useMemo(() => {
		const s = cloneSkinned(gltf.scene);
		s.traverse((o) => {
			if ((o as THREE.Mesh).isMesh) o.castShadow = true;
		});
		return s;
	}, [gltf]);
	useCharacterParts(scene, armor, hide, bodySet);
	useBodySkinMorph(scene);
	useSkinTint(scene, tint);
	const spineBones = useMemo(
		() =>
			SPINE_FLEX.map((s) => ({
				bone: scene.getObjectByName(s.bone) as THREE.Bone | null,
				frac: s.frac,
			})).filter((s) => s.bone),
		[scene],
	);
	const upperArms = useMemo(
		() => ({
			r: scene.getObjectByName('upperarm_r') as THREE.Bone | null,
			l: scene.getObjectByName('upperarm_l') as THREE.Bone | null,
		}),
		[scene],
	);
	const strafeBones = useMemo(
		() => ({
			pelvis: scene.getObjectByName('pelvis') as THREE.Bone | null,
			spine: scene.getObjectByName('spine_01') as THREE.Bone | null,
		}),
		[scene],
	);
	const legTwistCur = useRef(0);
	const fingerBones = useMemo(() => {
		const grip: Record<string, THREE.Quaternion> = {};
		const idle = gltf.animations.find((a) => a.name === 'Idle_Loop');
		for (const t of idle?.tracks ?? []) {
			if (!t.name.endsWith('.quaternion')) continue;
			const name = t.name.slice(0, -'.quaternion'.length);
			if (!FINGER_RE.test(name)) continue;
			const v = t.values;
			grip[name] = new THREE.Quaternion(v[0], v[1], v[2], v[3]);
		}
		const out: {
			bone: THREE.Bone;
			rest: THREE.Quaternion;
			grip: THREE.Quaternion;
			side: string;
		}[] = [];
		scene.traverse((o) => {
			const m = FINGER_RE.exec(o.name);
			if (m)
				out.push({
					bone: o as THREE.Bone,
					rest: (o as THREE.Bone).quaternion.clone(),
					grip: grip[o.name] ?? (o as THREE.Bone).quaternion.clone(),
					side: m[2],
				});
		});
		return out;
	}, [scene, gltf]);

	useEffect(() => {
		const srcByUrl: Record<string, THREE.Object3D> = {
			[SWORD_URL]: sword.scene,
			[TORCH_URL]: torch.scene,
		};
		const cleanups: Array<() => void> = [];

		const attachOne = (
			boneName: string,
			grip: {
				pos: [number, number, number];
				rot: [number, number, number];
			},
			id: string,
		) => {
			const cfg = HELD_ITEMS[id];
			const hand = scene.getObjectByName(boneName);
			if (!cfg || !hand) return;
			const src = srcByUrl[cfg.modelUrl];
			if (!src) return;

			const inner = cloneSkinned(src);
			inner.traverse((o) => {
				const mesh = o as THREE.Mesh;
				if (!mesh.isMesh) return;
				const m = mesh.material as THREE.MeshStandardMaterial;
				if (m.map) {
					m.map.magFilter = THREE.NearestFilter;
					m.map.minFilter = THREE.NearestMipmapNearestFilter;
					m.map.needsUpdate = true;
				}
				mesh.castShadow = true;
			});

			const axis = new THREE.Vector3(...cfg.axis).normalize();
			inner.quaternion.setFromUnitVectors(axis, UP);
			inner.updateMatrixWorld(true);
			const box = new THREE.Box3().setFromObject(inner);
			const gripY = box.min.y + cfg.gripFrac * (box.max.y - box.min.y);
			inner.position.y = -gripY;
			const headPoint = new THREE.Vector3(
				(box.min.x + box.max.x) / 2,
				box.max.y - gripY,
				(box.min.z + box.max.z) / 2,
			);

			const pivot = new THREE.Group();
			pivot.name = cfg.pivotName;
			pivot.add(inner);
			pivot.position.fromArray(grip.pos);
			pivot.rotation.set(grip.rot[0], grip.rot[1], grip.rot[2]);
			pivot.scale.setScalar(cfg.scale);
			pivot.userData.heldPivot = true;

			let anchor: THREE.Object3D | null = null;
			let flame: THREE.Group | null = null;
			let mats: THREE.ShaderMaterial[] | null = null;
			if (cfg.flame || cfg.light) {
				anchor = new THREE.Object3D();
				anchor.position.copy(headPoint);
				pivot.add(anchor);
			}
			if (cfg.flame && anchor) {
				if (!flamePool.current)
					flamePool.current = buildFlame(cfg.scale);
				flame = flamePool.current.flame;
				mats = flamePool.current.mats;
				anchor.add(flame);
			}

			hand.add(pivot);
			if (anchor || cfg.light) {
				heldAnchor.current = anchor;
				heldFlame.current = flame;
				heldMats.current = mats;
				heldLightCfg.current = cfg.light ?? null;
			}

			cleanups.push(() => hand.remove(pivot));
		};

		if (rightId) attachOne(WEAPON_GRIP.handBone, VERTICAL_GRIP, rightId);
		if (leftId)
			attachOne(WEAPON_GRIP.handBoneLeft, VERTICAL_GRIP_LEFT, leftId);

		return () => {
			for (const c of cleanups) c();
			heldAnchor.current = null;
			heldFlame.current = null;
			heldMats.current = null;
			heldLightCfg.current = null;
			flamePrev.current = null;
			leanRef.current.x = leanRef.current.z = 0;
			leanRef.current.vx = leanRef.current.vz = 0;
			clearHeldLight();
		};
	}, [scene, rightId, leftId, sword, torch]);

	useEffect(
		() => () => {
			const p = flamePool.current;
			if (p) {
				for (const m of p.mats) m.dispose();
				flamePool.current = null;
			}
		},
		[],
	);

	const rig = useMemo(() => {
		const pelvis = scene.getObjectByName('pelvis');
		rebasePelvis(gltf.animations, pelvis?.position.y ?? 0.91);
		clampIdleLegs(gltf.animations);
		const animator = new CharacterAnimator(scene, gltf.animations);
		const motor = new CharacterMotor(motorConfig);
		const pose = new ProceduralPose(scene);
		const equipment = new EquipmentPhysics(scene, getEquipped());
		motor.position.set(position[0], position[1], position[2]);
		return { animator, motor, pose, equipment };
	}, [scene, gltf]);

	const equippedArmor = useEquippedArmor();
	useEffect(() => {
		rig.equipment.setEquipped(armor ?? equippedArmor);
	}, [rig, equippedArmor, armor]);

	useEffect(() => {
		const { animator, motor, pose } = rig;
		if (animator.has(locomotion.idle))
			animator.play(locomotion.idle, { fade: 0 });
		const attackClip = animator.has('Sword_Attack')
			? 'Sword_Attack'
			: 'Punch_Cross';
		const hasUpper = animator.registerMasked(
			'Attack_Upper',
			attackClip,
			isUpperBone,
		);
		const punchMasked = new Map<string, boolean>();
		for (const p of PUNCH_CHAIN) {
			if (animator.has(p.clip))
				punchMasked.set(
					p.clip,
					animator.registerMasked(`${p.clip}_U`, p.clip, isUpperBone),
				);
		}
		for (const clip of BLOCK_CLIPS)
			if (animator.has(clip))
				animator.registerMasked(`${clip}_B`, clip, isUpperBone);
		if (locomotion.idleOverlay && animator.has(locomotion.idleOverlay))
			animator.registerMasked(
				'Idle_Overlay',
				locomotion.idleOverlay,
				isUpperBone,
			);
		const handle: CharacterHandle = {
			motor,
			animator,
			pose,
			// Standing still on the ground → full-body swing. Moving or airborne
			// → mask to the upper body so the legs keep running/jumping.
			attack: () =>
				hasUpper && (motor.gait !== 'idle' || motor.airborne)
					? animator.playMaskedOnce('Attack_Upper')
					: animator.playOnce(attackClip),
			punch: () => {
				if (blockRef.current.on) return;
				const c = comboRef.current;
				const now = tRef.current;
				c.step = now < c.until ? Math.min(c.step + 1, 2) : 0;
				const p = PUNCH_CHAIN[c.step];
				if (!animator.has(p.clip)) return;
				const masked = motor.gait !== 'idle' || motor.airborne;
				if (masked && punchMasked.get(p.clip))
					void animator.playMaskedOnce(
						`${p.clip}_U`,
						0.08,
						p.ts,
						p.out,
					);
				else void animator.playOnce(p.clip, 0.08, p.ts, p.out);
				c.until = now + animator.duration(p.clip) / p.ts + PUNCH_WINDOW;
				triggerSwing({ fistBone: p.hand, reach: PUNCH_REACH });
			},
			setBlocking: (b: boolean, pose?: BlockPose) => {
				blockRef.current.on = b;
				const e = stateEid?.() ?? -1;
				if (e >= 0)
					CharState.bits[e] = b
						? CharState.bits[e] | CS.BLOCKING
						: CharState.bits[e] & ~CS.BLOCKING;
				else
					localBits.current = b
						? localBits.current | CS.BLOCKING
						: localBits.current & ~CS.BLOCKING;
				if (b) {
					blockRef.current.pose = pose ?? DEFAULT_BLOCK;
					comboRef.current.step = -1;
				}
			},
			isBlocking: () => blockRef.current.on,
			bone: (name: string) => scene.getObjectByName(name) ?? null,
		};
		onReady?.(handle);
		return () => animator.dispose();
	}, [rig]);

	useFrame((_, dtRaw) => {
		const dt = Math.min(dtRaw, 0.05);
		const { animator, motor, pose, equipment } = rig;
		tRef.current += dt;
		drive?.(motor, tRef.current);
		motor.update(dt);

		const gait = motor.gait;
		const j = jumpRef.current;
		// --- Motor-derived state bits. Character is the single writer for the
		// motion bits; controller-owned bits (BLOCKING, EXHAUSTED, HAS_*) pass
		// through untouched. Entities share the word via CharState; instances
		// without an entity (Codex viewer) fall back to a local ref.
		const eid = stateEid?.() ?? -1;
		let bits = eid >= 0 ? CharState.bits[eid] : localBits.current;
		bits &= ~(
			CS.MOVING |
			CS.RUNNING |
			CS.AIRBORNE |
			CS.RISING |
			CS.LANDING |
			CS.COMBAT_LOCK |
			CS.SWIMMING |
			CS.CLIMBING
		);
		if (motor.mode !== 'ground') {
			bits |= motor.mode === 'swim' ? CS.SWIMMING : CS.CLIMBING;
			// Suppress the jump state machine while in water / on a ledge.
			j.wasGrounded = true;
			j.landUntil = 0;
		} else if (motor.airborne) {
			if (j.wasGrounded) {
				j.wasGrounded = false;
				j.airStart = tRef.current;
				// Rising at liftoff = a jump; walking off a ledge starts
				// falling and should skip the windup for the hang loop.
				j.rose = motor.vy > 0.2;
			}
			bits |= CS.AIRBORNE;
			// A standard hop (~0.55s of air) rides Jump_Start clamped on its
			// last frame straight into the landing — the Jump_Loop hang pose
			// only engages on real drops that outlast AIR_ANIM_DELAY.
			if (
				j.rose &&
				tRef.current - j.airStart <= AIR_ANIM_DELAY &&
				animator.has('Jump_Start')
			)
				bits |= CS.RISING;
		} else {
			if (!j.wasGrounded) {
				j.wasGrounded = true;
				// Landing recovery only when touching down in place; landing
				// while moving would freeze the legs and slide.
				j.landUntil =
					gait === 'idle'
						? tRef.current +
							(animator.duration('Jump_Land') * LAND_HOLD_FRAC) /
								LAND_SPEED
						: 0;
				if (gait === 'idle') j.recover = true;
			}
			if (tRef.current < j.landUntil) bits |= CS.LANDING;
		}
		if (gait !== 'idle') bits |= CS.MOVING;
		if (motor.runBlend > 0.001) bits |= CS.RUNNING;
		if (motor.yawLock !== null) bits |= CS.COMBAT_LOCK;
		if (eid >= 0) CharState.bits[eid] = bits;
		else localBits.current = bits;

		// Ability cast -> full-body one-shot. On the idle->windup edge, play the
		// ability's clip time-scaled to fit the whole cast so the visual swing
		// lines up with the active-phase hit window. Non-caster entities keep
		// Caster.phase at 0 (never written), so this never fires for them. This
		// replaces the old upper-body-masked attack, and puppet casters (future
		// NPCs) animate through the very same path.
		if (eid >= 0) {
			const cphase = Caster.phase[eid];
			if (
				cphase !== CastPhase.Idle &&
				castPhaseRef.current === CastPhase.Idle
			) {
				const ab = abilityById(Caster.ability[eid]);
				if (ab) {
					const clip = animator.has(ab.clip)
						? ab.clip
						: 'Sword_Attack';
					const dur = animator.duration(clip);
					const ts = THREE.MathUtils.clamp(
						dur > 0 ? dur / castDuration(ab) : 1,
						0.6,
						1.8,
					);
					void animator.playOnce(clip, 0.1, ts);
				}
			}
			castPhaseRef.current = cphase;
		}

		// --- Resolve the base layer from the state word.
		let bin: StrafeBin = 'Fwd';
		let strafeOffset = 0;
		const strafing =
			(bits & CS.COMBAT_LOCK) !== 0 &&
			(bits & CS.MOVING) !== 0 &&
			motor.speed > 0.15;
		if (strafing) {
			strafeOffset =
				Math.atan2(motor.velocity.x, motor.velocity.z) - motor.yaw;
			bin = strafeBin(strafeOffset);
		}
		const decision = resolveBase(bits, {
			runBlend: motor.runBlend,
			walkTs: locomotion.speedRef
				? THREE.MathUtils.clamp(
						motor.speed / locomotion.speedRef,
						WALK_TS_MIN,
						WALK_TS_MAX,
					)
				: 1,
			strafeBin: bin,
			landSpeed: LAND_SPEED,
			loco: locomotion,
		});

		// --- Apply. Missing directional clip falls back to the procedural
		// walk-twist strafe (pre-clip-library behavior).
		let strafe: StrafeState | null = null;
		if (decision.kind === 'blend') {
			animator.blend(decision.a, decision.b, decision.alpha);
		} else if (strafing && !animator.has(decision.clip)) {
			strafe = classifyStrafe(strafeOffset);
			animator.play(locomotion.walk);
			animator.setBaseTimeScale(
				THREE.MathUtils.clamp(
					motor.speed / WALK_SPEED_REF,
					WALK_TS_MIN,
					WALK_TS_MAX,
				),
			);
		} else {
			const idleClip = decision.clip === locomotion.idle;
			animator.play(decision.clip, {
				loop: decision.loop,
				timeScale: decision.timeScale,
				// Snap out of the landing pose fast; the drawn-out default
				// crossfade is what read as a laggy tail.
				fade: idleClip && j.recover ? 0.14 : decision.fade,
			});
			if (idleClip) j.recover = false;
			// play() early-returns on an already-running base without touching
			// its rate — re-assert per frame so speed tracking stays live.
			if (decision.timeScale !== undefined)
				animator.setBaseTimeScale(decision.timeScale);
		}

		const legTwistGoal = strafe?.legTwist ?? 0;
		animator.setLocomotionReverse(strafe?.reverse ?? false);

		const ov = resolveOverlays(bits);
		const bp = blockRef.current.pose;
		for (const clip of BLOCK_CLIPS) {
			const on = ov.block && bp.clip === clip;
			animator.holdMasked(`${clip}_B`, on, bp.loop, bp.frac ?? 0.5);
		}
		if (locomotion.idleOverlay)
			animator.holdMasked(
				'Idle_Overlay',
				!(bits & (CS.MOVING | CS.AIRBORNE | CS.LANDING)),
			);

		animator.update(dt);
		// Ease the leg cheat and apply post-mixer: pelvis yaws toward travel,
		// spine_01 counter-yaws so the chest stays squared on the target.
		legTwistCur.current = THREE.MathUtils.damp(
			legTwistCur.current,
			legTwistGoal,
			10,
			dt,
		);
		if (Math.abs(legTwistCur.current) > 0.002) {
			const twist = (bone: THREE.Bone | null, rad: number) => {
				if (!bone) return;
				bone.getWorldQuaternion(_sf1);
				_sf2.setFromAxisAngle(TWIST_Y, rad);
				_sf1.premultiply(_sf2);
				bone.parent!.getWorldQuaternion(_sf3).invert();
				bone.quaternion.copy(_sf3.multiply(_sf1));
				bone.updateWorldMatrix(false, true);
			};
			twist(strafeBones.pelvis, legTwistCur.current);
			twist(strafeBones.spine, -legTwistCur.current);
		}
		_flexAxis.set(Math.cos(motor.yaw), 0, -Math.sin(motor.yaw));
		_hangAxis.set(Math.sin(motor.yaw), 0, Math.cos(motor.yaw));
		// Spine flex + arm hang style grounded locomotion; jump clips are
		// full-body authored poses, so airborne/landing frames get the clip
		// untouched.
		const inJump =
			(bits & (CS.AIRBORNE | CS.LANDING | CS.SWIMMING | CS.CLIMBING)) !==
			0;
		const flexDeg = inJump
			? 0
			: (SPINE_FLEX_BY_CLIP[animator.current()] ?? SPINE_FLEX_DEFAULT);
		if (flexDeg !== 0) {
			const rad = (flexDeg * Math.PI) / 180;
			for (const s of spineBones) {
				const bone = s.bone!;
				bone.getWorldQuaternion(_sf1);
				_sf2.setFromAxisAngle(_flexAxis, rad * s.frac);
				_sf1.premultiply(_sf2);
				bone.parent!.getWorldQuaternion(_sf3).invert();
				bone.quaternion.copy(_sf3.multiply(_sf1));
				bone.updateWorldMatrix(false, false);
			}
		}
		if (ARM_HANG_DEG !== 0 && !inJump) {
			const rad = (ARM_HANG_DEG * Math.PI) / 180;
			const hang = (bone: THREE.Bone | null, sign: number) => {
				if (!bone) return;
				bone.getWorldQuaternion(_sf1);
				_sf2.setFromAxisAngle(_hangAxis, rad * sign);
				_sf1.premultiply(_sf2);
				bone.parent!.getWorldQuaternion(_sf3).invert();
				bone.quaternion.copy(_sf3.multiply(_sf1));
				bone.updateWorldMatrix(false, true);
			};
			if (!rightId) hang(upperArms.r, -1);
			if (!leftId) hang(upperArms.l, 1);
		}
		for (const f of fingerBones) {
			const holds = f.side === 'r' ? !!rightId : !!leftId;
			if (holds) f.bone.quaternion.slerp(f.grip, HAND_GRIP);
			else f.bone.quaternion.slerp(f.rest, HAND_OPEN);
		}
		// Combat lock pins the head on the target (overrides the clip's head
		// sway — most visible jog-strafing). yawLock is player-only state, so
		// goblin puppets sharing this component never trigger it.
		const combatEid = motor.yawLock !== null ? getTarget() : null;
		if (combatEid !== null) {
			_combatLook.set(
				Transform3.px[combatEid],
				Transform3.py[combatEid] + COMBAT_LOOK_Y,
				Transform3.pz[combatEid],
			);
			pose.setStrength(COMBAT_LOOK_WEIGHT);
			pose.lookAt(_combatLook);
		} else {
			pose.setStrength(0.6);
			pose.lookAt(lookTarget);
		}
		_bodyFwd.set(Math.sin(motor.yaw), 0, Math.cos(motor.yaw));
		pose.update(dt, _bodyFwd);

		const g = groupRef.current;
		if (g) {
			g.position.copy(motor.position);
			g.position.y += GROUND_Y;
			g.rotation.y = motor.yaw;
			// Dive pitch: nose-down when swimming toward the floor, nose-up
			// when rising; zero everywhere else.
			g.rotation.x = motor.mode === 'swim' ? -motor.swimPitch : 0;
			g.updateMatrixWorld(true);
		}
		equipment.update(dt);

		// Held torch: advance the flame and drive the light from the head anchor's
		// world position (matrices are up to date after updateMatrixWorld above).
		// Real point light for the standard-material body, tracking the same held
		// torch that LightSystem feeds to the walls. Off when no torch is held.
		const pl = torchLight.current;
		if (pl) {
			if (heldLight.on) {
				pl.visible = true;
				pl.position.copy(heldLight.pos);
				pl.color.setRGB(heldLight.r, heldLight.g, heldLight.b);
				pl.intensity = heldLight.intensity * TORCH_LIGHT_GAIN;
			} else {
				pl.visible = false;
			}
		}

		const mats = heldMats.current;
		if (mats)
			for (const m of mats) {
				m.uniforms.uTime.value = tRef.current;
				// Only the ember material carries uVel; sparks drag on flame motion.
				if (m.uniforms.uVel)
					m.uniforms.uVel.value.copy(flameVel.current);
			}
		const anchor = heldAnchor.current;
		if (anchor) {
			anchor.getWorldPosition(heldPos.current);
			const lc = heldLightCfg.current;
			if (lc) {
				setHeldLight(
					heldPos.current.x,
					heldPos.current.y,
					heldPos.current.z,
					lc.intensity,
					lc.color[0],
					lc.color[1],
					lc.color[2],
				);
			}
			// Keep the flame world-upright (fire rises up) regardless of torch tilt,
			// then spring a reactive lean on top so a fast swing whips the fire.
			const fl = heldFlame.current;
			if (fl) {
				anchor.getWorldQuaternion(heldQuat.current);
				fl.quaternion.copy(heldQuat.current.invert());

				const prev = flamePrev.current;
				const ln = leanRef.current;
				if (prev && dt > 1e-4) {
					const vx = (heldPos.current.x - prev.x) / dt;
					const vy = (heldPos.current.y - prev.y) / dt;
					const vz = (heldPos.current.z - prev.z) / dt;
					// Smoothed world velocity drives the ember drag (sparks trail behind
					// fast motion); the same vx/vz feed the flame lean.
					flameVel.current.lerp(
						_vel.set(vx, vy, vz),
						Math.min(1, 12 * dt),
					);
					// Fire drags opposite the motion: +X push tilts the tip to -X
					// (rotation about +Z), +Z push tilts it to -Z (about -X).
					const tgtZ = THREE.MathUtils.clamp(
						vx * FLAME_LEAN_GAIN,
						-FLAME_LEAN_MAX,
						FLAME_LEAN_MAX,
					);
					const tgtX = THREE.MathUtils.clamp(
						-vz * FLAME_LEAN_GAIN,
						-FLAME_LEAN_MAX,
						FLAME_LEAN_MAX,
					);
					ln.vx +=
						(tgtX - ln.x) * FLAME_LEAN_K * dt -
						ln.vx * FLAME_LEAN_D * dt;
					ln.vz +=
						(tgtZ - ln.z) * FLAME_LEAN_K * dt -
						ln.vz * FLAME_LEAN_D * dt;
					ln.x += ln.vx * dt;
					ln.z += ln.vz * dt;
					leanEuler.current.set(ln.x, 0, ln.z, 'XYZ');
					leanTilt.current.setFromEuler(leanEuler.current);
					// Apply in world space: local = anchorⁿ¹ · tilt (multiply, not pre-).
					fl.quaternion.multiply(leanTilt.current);
				}
				(flamePrev.current ??= new THREE.Vector3()).copy(
					heldPos.current,
				);
			} else {
				flameVel.current.multiplyScalar(Math.max(0, 1 - 8 * dt));
			}
		} else {
			flameVel.current.multiplyScalar(Math.max(0, 1 - 8 * dt));
		}
	});

	return (
		<>
			<group ref={groupRef} name="characterRoot" scale={scale}>
				<primitive object={scene} />
			</group>
			<pointLight
				ref={torchLight}
				visible={false}
				distance={TORCH_LIGHT_REACH}
				decay={TORCH_LIGHT_DECAY}
				castShadow={false}
			/>
		</>
	);
}
