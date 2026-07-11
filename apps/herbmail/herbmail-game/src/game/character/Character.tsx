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
import { collectLegs, lowestAnkleY, groundLeg } from './footIK';
import { makeFlameMaterial } from '../render/flameMaterial';
import { setHeldLight, clearHeldLight } from '../render/heldLight';

const SWORD_URL = '/models/sword.glb';
const TORCH_URL = '/models/torch.glb';
useGLTF.preload(SWORD_URL);
useGLTF.preload(TORCH_URL);

const HELD_INTENSITY = 5;
const HELD_FLAME_SCALE = 0.11;
const flameGeo = new THREE.PlaneGeometry(0.66, 1);

const ANKLE_HEIGHT = 0.049;
const FOOT_BLEND_FULL = 0.09;
const FOOT_BLEND_FADE = 0.22;

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
	heldId?: string;
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
	heldId = 'empty',
	onReady,
	drive,
}: Props) {
	const gltf = useGLTF(url);
	const sword = useGLTF(SWORD_URL);
	const torch = useGLTF(TORCH_URL);
	const heldAnchor = useRef<THREE.Object3D | null>(null);
	const heldMats = useRef<THREE.ShaderMaterial[] | null>(null);
	const heldPos = useRef(new THREE.Vector3());
	const groupRef = useRef<THREE.Group>(null);
	const tRef = useRef(0);
	const jumpRef = useRef({ wasGrounded: true, landUntil: 0 });
	const groundRef = useRef({ shift: 0 });
	const forwardRef = useRef(new THREE.Vector3());

	const scene = useMemo(() => {
		const s = cloneSkinned(gltf.scene);
		s.traverse((o) => {
			if ((o as THREE.Mesh).isMesh) o.castShadow = true;
		});
		return s;
	}, [gltf]);
	useCharacterParts(scene);
	useBodySkinMorph(scene);

	useEffect(() => {
		if (!armed) return;
		const hand = scene.getObjectByName(WEAPON_GRIP.handBone);
		if (!hand) return;
		const g = WEAPON_GRIP.sword;
		const inner = cloneSkinned(sword.scene);
		inner.position.y = -g.gripY; // handle -> pivot origin
		const pivot = new THREE.Group();
		pivot.name = 'weaponPivot';
		pivot.add(inner);
		pivot.position.fromArray(g.pos);
		pivot.rotation.set(g.rot[0], g.rot[1], g.rot[2]);
		pivot.scale.setScalar(g.scale);
		pivot.userData.weapon = true;
		hand.add(pivot);
		return () => {
			hand.remove(pivot);
		};
	}, [scene, sword, armed]);

	// Torch held in hand: attach the torch model + a flame at its head, and expose
	// the head anchor so the frame loop can drive the held light from it.
	useEffect(() => {
		if (heldId !== 'torch') return;
		const grip = WEAPON_GRIP.torch;
		const hand = scene.getObjectByName(WEAPON_GRIP.handBone);
		if (!hand) return;

		const inner = cloneSkinned(torch.scene);
		inner.traverse((o) => {
			const mesh = o as THREE.Mesh;
			if (!mesh.isMesh) return;
			const src = mesh.material as THREE.MeshStandardMaterial;
			if (src.map) {
				src.map.magFilter = THREE.NearestFilter;
				src.map.minFilter = THREE.NearestMipmapNearestFilter;
				src.map.needsUpdate = true;
			}
			mesh.castShadow = true;
		});

		const pivot = new THREE.Group();
		pivot.name = 'torchPivot';
		pivot.add(inner);
		pivot.position.fromArray(grip.pos);
		pivot.rotation.set(grip.rot[0], grip.rot[1], grip.rot[2]);
		pivot.scale.setScalar(grip.scale);

		// Head anchor at the torch's +z tip (HEAD_LOCAL), where the flame sits.
		const box = new THREE.Box3().setFromObject(inner);
		const anchor = new THREE.Object3D();
		anchor.position.set(
			(box.min.x + box.max.x) / 2,
			(box.min.y + box.max.y) / 2,
			box.max.z,
		);
		pivot.add(anchor);

		const mats: THREE.ShaderMaterial[] = [];
		const flame = new THREE.Group();
		flame.scale.setScalar(HELD_FLAME_SCALE / grip.scale);
		for (let i = 0; i < 3; i++) {
			const mat = makeFlameMaterial(i * 3.713, 12);
			mats.push(mat);
			const mesh = new THREE.Mesh(flameGeo, mat);
			mesh.rotation.y = (i / 3) * Math.PI;
			mesh.position.y = flameGeo.parameters.height * 0.5;
			mesh.renderOrder = 10;
			flame.add(mesh);
		}
		anchor.add(flame);

		hand.add(pivot);
		heldAnchor.current = anchor;
		heldMats.current = mats;

		return () => {
			hand.remove(pivot);
			heldAnchor.current = null;
			heldMats.current = null;
			for (const m of mats) m.dispose();
			clearHeldLight();
		};
	}, [scene, torch, heldId]);

	const rig = useMemo(() => {
		const animator = new CharacterAnimator(scene, gltf.animations);
		const motor = new CharacterMotor(motorConfig);
		const pose = new ProceduralPose(scene);
		const plume = new ProceduralPlume(scene);
		motor.position.set(position[0], position[1], position[2]);
		const legs = collectLegs(scene);
		return { animator, motor, pose, plume, legs };
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
		const { animator, motor, pose, plume, legs } = rig;
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
					? tRef.current + animator.duration('Jump_Land') * 0.8
					: 0;
		}
		// Hold the landing recovery briefly before locomotion resumes.
		if (!jumping && tRef.current < j.landUntil) {
			animator.play('Jump_Land', { loop: false });
			jumping = true;
		}

		if (jumping) {
			// jump state already selected
		} else if (gait === 'idle') {
			const idle =
				armed && animator.has(WEAPON_GRIP.idleClip)
					? WEAPON_GRIP.idleClip
					: 'Idle_Loop';
			animator.play(idle);
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
			g.rotation.y = motor.yaw;
			g.updateMatrixWorld(true);
			const gr = groundRef.current;
			if (legs.length && !motor.airborne) {
				const target =
					motor.position.y + ANKLE_HEIGHT - lowestAnkleY(legs);
				gr.shift += (target - gr.shift) * (1 - Math.exp(-14 * dt));
				g.position.y = motor.position.y + gr.shift;
				g.updateMatrixWorld(true);
				forwardRef.current.set(
					Math.sin(motor.yaw),
					0,
					Math.cos(motor.yaw),
				);
				for (const leg of legs)
					groundLeg(leg, {
						floorY: motor.position.y,
						ankleHeight: ANKLE_HEIGHT,
						blendFull: FOOT_BLEND_FULL,
						blendFade: FOOT_BLEND_FADE,
						forward: forwardRef.current,
					});
			} else {
				g.position.y = motor.position.y + gr.shift;
				g.updateMatrixWorld(true);
			}
		}
		plume.update(dt);

		// Held torch: advance the flame and drive the light from the head anchor's
		// world position (matrices are up to date after updateMatrixWorld above).
		const mats = heldMats.current;
		if (mats) for (const m of mats) m.uniforms.uTime.value = tRef.current;
		const anchor = heldAnchor.current;
		if (anchor) {
			anchor.getWorldPosition(heldPos.current);
			setHeldLight(
				heldPos.current.x,
				heldPos.current.y,
				heldPos.current.z,
				HELD_INTENSITY,
			);
		}
	});

	return (
		<group ref={groupRef} scale={scale}>
			<primitive object={scene} />
		</group>
	);
}
