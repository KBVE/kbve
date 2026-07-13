import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTER_URL } from '../character/modelUrl';
import { useCharacterParts } from '../character/useCharacterParts';

function Model({ clip }: { clip: string }) {
	const gltf = useGLTF(CHARACTER_URL);
	const group = useRef<THREE.Group>(null);
	const scene = useMemo(() => cloneSkinned(gltf.scene), [gltf]);
	const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
	useCharacterParts(scene);

	useEffect(() => {
		mixer.stopAllAction();
		const c = gltf.animations.find((a) => a.name === clip);
		if (!c) return;
		const action = mixer.clipAction(c);
		action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
		return () => {
			action.stop();
		};
	}, [clip, mixer, gltf]);

	useFrame((_, dt) => {
		mixer.update(dt);
		if (group.current) group.current.rotation.y += dt * 0.5;
	});

	return (
		<group ref={group}>
			<primitive object={scene} position={[0, -0.95, 0]} />
		</group>
	);
}

export function CodexViewer({ clip }: { clip: string }) {
	return (
		<Canvas
			camera={{ fov: 35, position: [0, 0.1, 2.6] }}
			style={{ imageRendering: 'pixelated', background: '#0a0a0e' }}
			gl={{ antialias: true }}>
			<ambientLight intensity={0.6} />
			<directionalLight position={[2, 4, 3]} intensity={1.4} />
			<directionalLight position={[-3, 2, -2]} intensity={0.4} />
			<Model clip={clip} />
		</Canvas>
	);
}
