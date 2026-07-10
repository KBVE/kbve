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
import { WEAPON_GRIP } from './weaponGrip';
import { useCharacterParts } from './useCharacterParts';

const SWORD_URL = '/models/sword.glb';
useGLTF.preload(SWORD_URL);

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
	onReady,
	drive,
}: Props) {
	const gltf = useGLTF(url);
	const sword = useGLTF(SWORD_URL);
	const groupRef = useRef<THREE.Group>(null);
	const tRef = useRef(0);
	const jumpRef = useRef({ wasGrounded: true, landUntil: 0 });

	const scene = useMemo(() => cloneSkinned(gltf.scene), [gltf]);
	useCharacterParts(scene);

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

	const rig = useMemo(() => {
		const animator = new CharacterAnimator(scene, gltf.animations);
		const motor = new CharacterMotor(motorConfig);
		const pose = new ProceduralPose(scene);
		motor.position.set(position[0], position[1], position[2]);
		return { animator, motor, pose };
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
		const { animator, motor, pose } = rig;
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
		}
	});

	return (
		<group ref={groupRef} scale={scale}>
			<primitive object={scene} />
		</group>
	);
}
