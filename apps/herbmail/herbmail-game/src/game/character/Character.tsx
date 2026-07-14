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
import { EquipmentPhysics } from './equipmentPhysics';
import { WEAPON_GRIP } from './weaponGrip';
import { useCharacterParts } from './useCharacterParts';
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
const LAND_SPEED = 1.35;
const GROUND_Y = -0.037;
const SPINE_X = new THREE.Vector3(1, 0, 0);
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
const ARM_Z = new THREE.Vector3(0, 0, 1);
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

// The world is lit by LightSystem's PSX uniforms, but the character keeps its GLB
// standard material, so it needs a real light to catch the same torch. This point
// light mirrors heldLight (the held-torch flame) so the body is lit by the exact
// source lighting the walls. Tune gain/reach/decay to match the wall falloff.
const TORCH_LIGHT_GAIN = 4;
const TORCH_LIGHT_REACH = 8;
const TORCH_LIGHT_DECAY = 1.5;

useGLTF.preload(SWORD_URL);
useGLTF.preload(TORCH_URL);

const HELD_FLAME_SCALE = 0.24;
// Reactive flame lean: the held flame is world-upright, but a fast hand motion
// (thrust, swing) should make the fire drag behind and whip. We spring a tilt
// toward the anchor's horizontal world velocity, negated so +Y bends away from
// the motion. GAIN maps m/s → radians; K/D are the spring stiffness/damping
// (under-damped for overshoot = whip); MAX clamps the tilt so it never inverts.
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
	// Embers share the flame's uTime so the existing frame loop animates them too.
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
	locomotion?: LocomotionClips;
	onReady?: (h: CharacterHandle) => void;
	drive?: (motor: CharacterMotor, t: number) => void;
}

export interface LocomotionClips {
	idle: string;
	walk: string;
	run: string;
	/** World m/s the walk clip's stride matches at timeScale 1 (incl. model
	 *  scale). When set, the walk loop's timeScale tracks actual speed so feet
	 *  stop skating at speeds the clip wasn't authored for. */
	speedRef?: number;
}

const DEFAULT_LOCOMOTION: LocomotionClips = {
	idle: 'Idle_Loop',
	walk: 'Walk_Loop',
	run: 'Jog_Fwd_Loop',
};

const WALK_TS_MIN = 0.6;
const WALK_TS_MAX = 2.6;

// The Zombie_* clips animate pelvis translation at a different rest height
// than this rig (1.02 vs 0.91), which floats + bobs the whole body ~10cm —
// there's no foot IK to pin the feet. Drop the pelvis position track once
// (shared GLTF cache): the hunch comes from rotations and survives intact.
const GROUNDED_CLIPS = new WeakSet<THREE.AnimationClip>();
function groundPelvis(clips: THREE.AnimationClip[]): void {
	for (const c of clips) {
		if (!c.name.startsWith('Zombie_') || GROUNDED_CLIPS.has(c)) continue;
		c.tracks = c.tracks.filter((t) => t.name !== 'pelvis.position');
		GROUNDED_CLIPS.add(c);
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
	locomotion = DEFAULT_LOCOMOTION,
	onReady,
	drive,
}: Props) {
	const gltf = useGLTF(url);
	const sword = useGLTF(SWORD_URL);
	const torch = useGLTF(TORCH_URL);
	const heldAnchor = useRef<THREE.Object3D | null>(null);
	const heldFlame = useRef<THREE.Object3D | null>(null);
	const heldMats = useRef<THREE.ShaderMaterial[] | null>(null);
	const heldPos = useRef(new THREE.Vector3());
	const heldQuat = useRef(new THREE.Quaternion());
	// Flame-lean physics: last anchor world pos, spring tilt state (rad) + its
	// velocity, and scratch objects reused per frame to avoid per-frame allocs.
	const flamePrev = useRef<THREE.Vector3 | null>(null);
	const leanRef = useRef({ x: 0, z: 0, vx: 0, vz: 0 });
	const leanTilt = useRef(new THREE.Quaternion());
	const leanEuler = useRef(new THREE.Euler());
	// Smoothed flame world-velocity, fed to the ember shader so sparks streak
	// (drag opposite the motion) when the torch is moved quickly.
	const flameVel = useRef(new THREE.Vector3());
	const heldLightCfg = useRef<{
		intensity: number;
		color: [number, number, number];
	} | null>(null);
	const groupRef = useRef<THREE.Group>(null);
	const torchLight = useRef<THREE.PointLight>(null);
	// One persistent flame reused across equips: built lazily, reparented to the
	// live hand's anchor on equip, detached on unequip, disposed only on unmount.
	const flamePool = useRef<{
		flame: THREE.Group;
		mats: THREE.ShaderMaterial[];
	} | null>(null);
	const tRef = useRef(0);
	const jumpRef = useRef({ wasGrounded: true, landUntil: 0, recover: false });
	const comboRef = useRef({ step: -1, until: 0 });
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
	useCharacterParts(scene, armor, hide);
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

	// Generic held-item attach: everything is driven by the HELD_ITEMS registry, so
	// a new object is a config entry, not new code. Grips the handle end, applies
	// the authored pos/rot/scale, and wires optional flame/light attachments.
	useEffect(() => {
		const srcByUrl: Record<string, THREE.Object3D> = {
			[SWORD_URL]: sword.scene,
			[TORCH_URL]: torch.scene,
		};
		const cleanups: Array<() => void> = [];

		// Attach one registry item to one hand bone with its authored grip. The
		// flame/light of a lit item (torch) is captured into the shared refs so the
		// frame loop drives it from whichever hand ends up holding it.
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

			// Normalize any vertical item the same way: rotate its long axis to +Y
			// (up) and shift so the grip point sits at the pivot origin (the fist).
			// After this every item is "a vertical stick gripped at the bottom", so
			// the shared grip poses them identically. Tip is +Y for the flame.
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

			// Detach only — the pooled flame is reused, so it is not disposed here.
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

	// Dispose the pooled flame once, when the character unmounts.
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
		groundPelvis(gltf.animations);
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
				if (b) {
					blockRef.current.pose = pose ?? DEFAULT_BLOCK;
					comboRef.current.step = -1;
				}
			},
			isBlocking: () => blockRef.current.on,
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
		let jumping = false;
		if (motor.airborne) {
			j.wasGrounded = false;
			// Rising → windup pose, then hang/fall → loop.
			if (motor.vy > 0.2 && animator.has('Jump_Start')) {
				animator.play('Jump_Start', { fade: 0.1, loop: false });
			} else {
				animator.play('Jump_Loop', { fade: 0.12 });
			}
			jumping = true;
		} else if (!j.wasGrounded) {
			j.wasGrounded = true;
			// Only play the landing recovery when touching down in place;
			// landing while still moving would freeze the legs and slide.
			j.landUntil =
				gait === 'idle'
					? tRef.current +
						(animator.duration('Jump_Land') * 0.55) / LAND_SPEED
					: 0;
			if (gait === 'idle') j.recover = true;
		}
		// Hold the landing recovery briefly before locomotion resumes.
		if (!jumping && tRef.current < j.landUntil) {
			animator.play('Jump_Land', { loop: false, timeScale: LAND_SPEED });
			jumping = true;
		}

		if (jumping) {
			// jump state already selected
		} else if (gait === 'idle') {
			// Snap out of the landing pose fast; the drawn-out default
			// crossfade is what read as a laggy tail.
			animator.play(locomotion.idle, j.recover ? { fade: 0.14 } : {});
			j.recover = false;
		} else if (
			motor.runBlend <= 0.001 ||
			locomotion.walk === locomotion.run
		) {
			animator.play(locomotion.walk);
			if (locomotion.speedRef)
				animator.setBaseTimeScale(
					THREE.MathUtils.clamp(
						motor.speed / locomotion.speedRef,
						WALK_TS_MIN,
						WALK_TS_MAX,
					),
				);
		} else {
			animator.blend(locomotion.walk, locomotion.run, motor.runBlend);
		}

		const bp = blockRef.current.pose;
		for (const clip of BLOCK_CLIPS) {
			const on = blockRef.current.on && bp.clip === clip;
			animator.holdMasked(`${clip}_B`, on, bp.loop, bp.frac ?? 0.5);
		}

		animator.update(dt);
		const flexDeg =
			SPINE_FLEX_BY_CLIP[animator.current()] ?? SPINE_FLEX_DEFAULT;
		if (flexDeg !== 0) {
			const rad = (flexDeg * Math.PI) / 180;
			for (const s of spineBones) {
				const bone = s.bone!;
				bone.getWorldQuaternion(_sf1);
				_sf2.setFromAxisAngle(SPINE_X, rad * s.frac);
				_sf1.premultiply(_sf2);
				bone.parent!.getWorldQuaternion(_sf3).invert();
				bone.quaternion.copy(_sf3.multiply(_sf1));
				bone.updateWorldMatrix(false, false);
			}
		}
		if (ARM_HANG_DEG !== 0) {
			const rad = (ARM_HANG_DEG * Math.PI) / 180;
			const hang = (bone: THREE.Bone | null, sign: number) => {
				if (!bone) return;
				bone.getWorldQuaternion(_sf1);
				_sf2.setFromAxisAngle(ARM_Z, rad * sign);
				_sf1.premultiply(_sf2);
				bone.parent!.getWorldQuaternion(_sf3).invert();
				bone.quaternion.copy(_sf3.multiply(_sf1));
				bone.updateWorldMatrix(false, true);
			};
			if (!rightId) hang(upperArms.r, 1);
			if (!leftId) hang(upperArms.l, -1);
		}
		for (const f of fingerBones) {
			const holds = f.side === 'r' ? !!rightId : !!leftId;
			if (holds) f.bone.quaternion.slerp(f.grip, HAND_GRIP);
			else f.bone.quaternion.slerp(f.rest, HAND_OPEN);
		}
		pose.lookAt(lookTarget);
		pose.update(dt);

		const g = groupRef.current;
		if (g) {
			g.position.copy(motor.position);
			g.position.y += GROUND_Y;
			g.rotation.y = motor.yaw;
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
