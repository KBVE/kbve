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
import { ProceduralPlume } from './ProceduralPlume';
import { WEAPON_GRIP } from './weaponGrip';
import { useCharacterParts } from './useCharacterParts';
import { useBodySkinMorph } from './body';
import { makeFlameMaterial } from '../render/flameMaterial';
import { setHeldLight, clearHeldLight } from '../render/heldLight';
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

useGLTF.preload(SWORD_URL);
useGLTF.preload(TORCH_URL);

const HELD_FLAME_SCALE = 0.24;
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
	return { flame, mats };
}

const UPPER_BONE =
	/spine|neck|head|clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky|prop/i;

function isUpperBone(name: string): boolean {
	return UPPER_BONE.test(name);
}

export interface CharacterHandle {
	motor: CharacterMotor;
	animator: CharacterAnimator;
	pose: ProceduralPose;
	attack: () => Promise<void>;
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
	onReady?: (h: CharacterHandle) => void;
	drive?: (motor: CharacterMotor, t: number) => void;
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
	const heldLightCfg = useRef<{
		intensity: number;
		color: [number, number, number];
	} | null>(null);
	const groupRef = useRef<THREE.Group>(null);
	const tRef = useRef(0);
	const jumpRef = useRef({ wasGrounded: true, landUntil: 0, recover: false });

	const scene = useMemo(() => {
		const s = cloneSkinned(gltf.scene);
		s.traverse((o) => {
			if ((o as THREE.Mesh).isMesh) o.castShadow = true;
		});
		return s;
	}, [gltf]);
	useCharacterParts(scene);
	useBodySkinMorph(scene);

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
				const built = buildFlame(cfg.scale);
				flame = built.flame;
				mats = built.mats;
				anchor.add(flame);
			}

			hand.add(pivot);
			if (anchor || cfg.light) {
				heldAnchor.current = anchor;
				heldFlame.current = flame;
				heldMats.current = mats;
				heldLightCfg.current = cfg.light ?? null;
			}

			cleanups.push(() => {
				hand.remove(pivot);
				if (mats) for (const m of mats) m.dispose();
			});
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
			clearHeldLight();
		};
	}, [scene, rightId, leftId, sword, torch]);

	const rig = useMemo(() => {
		const animator = new CharacterAnimator(scene, gltf.animations);
		const motor = new CharacterMotor(motorConfig);
		const pose = new ProceduralPose(scene);
		const plume = new ProceduralPlume(scene);
		motor.position.set(position[0], position[1], position[2]);
		return { animator, motor, pose, plume };
	}, [scene, gltf]);

	useEffect(() => {
		const { animator, motor, pose } = rig;
		if (animator.has('Idle_Loop')) animator.play('Idle_Loop', { fade: 0 });
		const attackClip = animator.has('Sword_Attack')
			? 'Sword_Attack'
			: 'Punch_Cross';
		const hasUpper = animator.registerMasked(
			'Attack_Upper',
			attackClip,
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
		};
		onReady?.(handle);
		return () => animator.dispose();
	}, [rig]);

	useFrame((_, dtRaw) => {
		const dt = Math.min(dtRaw, 0.05);
		const { animator, motor, pose, plume } = rig;
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
			const holding = !!(rightId || leftId);
			const idle =
				holding && animator.has(WEAPON_GRIP.idleClip)
					? WEAPON_GRIP.idleClip
					: 'Idle_Loop';
			// Snap out of the landing pose fast; the drawn-out default
			// crossfade is what read as a laggy tail.
			animator.play(idle, j.recover ? { fade: 0.14 } : {});
			j.recover = false;
		} else if (motor.runBlend <= 0.001) {
			animator.play('Walk_Loop');
		} else {
			animator.blend('Walk_Loop', 'Jog_Fwd_Loop', motor.runBlend);
		}

		animator.update(dt);
		pose.lookAt(lookTarget);
		pose.update(dt);

		const g = groupRef.current;
		if (g) {
			g.position.copy(motor.position);
			g.position.y += GROUND_Y;
			g.rotation.y = motor.yaw;
			g.updateMatrixWorld(true);
		}
		plume.update(dt);

		// Held torch: advance the flame and drive the light from the head anchor's
		// world position (matrices are up to date after updateMatrixWorld above).
		const mats = heldMats.current;
		if (mats) for (const m of mats) m.uniforms.uTime.value = tRef.current;
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
			// Keep the flame world-upright (fire rises up) regardless of torch tilt.
			const fl = heldFlame.current;
			if (fl) {
				anchor.getWorldQuaternion(heldQuat.current);
				fl.quaternion.copy(heldQuat.current.invert());
			}
		}
	});

	return (
		<group ref={groupRef} name="characterRoot" scale={scale}>
			<primitive object={scene} />
		</group>
	);
}
