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
	onReady?: (h: CharacterHandle) => void;
	drive?: (motor: CharacterMotor, t: number) => void;
}

export function Character({
	url,
	position = [0, 0, 0],
	scale = 1,
	motorConfig = DEFAULT_MOTOR,
	lookTarget = null,
	onReady,
	drive,
}: Props) {
	const gltf = useGLTF(url);
	const groupRef = useRef<THREE.Group>(null);
	const tRef = useRef(0);

	const scene = useMemo(() => cloneSkinned(gltf.scene), [gltf]);

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
		const handle: CharacterHandle = {
			motor,
			animator,
			pose,
			attack: () =>
				animator.playOnce(
					animator.has('Sword_Attack')
						? 'Sword_Attack'
						: 'Punch_Cross',
				),
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
		if (gait === 'idle') {
			animator.play('Idle_Loop');
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
