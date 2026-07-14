import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { useGLTF, OrbitControls } from '@react-three/drei';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTER_URL } from '../character/modelUrl';
import { useCharacterParts } from '../character/useCharacterParts';
import { useEquipmentPhysics } from '../character/equipmentPhysics';
import { pieceForMesh } from '../character/armor';
import { partLabel } from './partLabels';

// Sentinel clip: no matching GLB animation → the skeleton snaps back to its
// bind pose (T-pose) so parts can be inspected without motion.
export const REST_POSE = '__rest__';

function Model({
	clip,
	equipped,
	onHover,
	onPick,
}: {
	clip: string;
	equipped: Set<string>;
	onHover: (name: string | null) => void;
	onPick: (name: string | undefined) => void;
}) {
	const gltf = useGLTF(CHARACTER_URL);
	const scene = useMemo(() => cloneSkinned(gltf.scene), [gltf]);
	const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
	useCharacterParts(scene, equipped);

	useEffect(() => {
		mixer.stopAllAction();
		const c = gltf.animations.find((a) => a.name === clip);
		if (!c) {
			scene.traverse((o) => {
				const sk = o as THREE.SkinnedMesh;
				if (sk.isSkinnedMesh) sk.skeleton.pose();
			});
			return;
		}
		const action = mixer.clipAction(c);
		action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
		return () => {
			action.stop();
		};
	}, [clip, mixer, gltf, scene]);

	useFrame((_, dt) => {
		mixer.update(dt);
	});
	useEquipmentPhysics(scene, equipped);

	return (
		<primitive
			object={scene}
			position={[0, -0.95, 0]}
			onPointerMove={(e: ThreeEvent<PointerEvent>) => {
				e.stopPropagation();
				onHover(e.object?.name ?? null);
			}}
			onPointerOut={() => onHover(null)}
			onClick={(e: ThreeEvent<MouseEvent>) => {
				e.stopPropagation();
				onPick(e.object?.name);
			}}
		/>
	);
}

export function CodexViewer({
	clip,
	equipped,
	onToggle,
}: {
	clip: string;
	equipped: Set<string>;
	onToggle: (pieceId: string) => void;
}) {
	const [hover, setHover] = useState<string | null>(null);

	const label = partLabel(hover ?? undefined);
	const pieceId = pieceForMesh(hover ?? undefined);
	const status = pieceId
		? equipped.has(pieceId)
			? ' · ON — click to remove'
			: ' · OFF — click to add'
		: '';

	return (
		<div style={{ position: 'relative', width: '100%', height: '100%' }}>
			<Canvas
				camera={{ fov: 35, position: [0, 0.1, 2.6] }}
				style={{ imageRendering: 'pixelated', background: '#0a0a0e' }}
				gl={{ antialias: true }}>
				<ambientLight intensity={0.6} />
				<directionalLight position={[2, 4, 3]} intensity={1.4} />
				<directionalLight position={[-3, 2, -2]} intensity={0.4} />
				<Model
					clip={clip}
					equipped={equipped}
					onHover={setHover}
					onPick={(name) => {
						const pid = pieceForMesh(name);
						if (pid) onToggle(pid);
					}}
				/>
				<OrbitControls
					makeDefault
					enablePan
					target={[0, -0.1, 0]}
					minDistance={1.2}
					maxDistance={6}
					autoRotate={clip !== REST_POSE}
					autoRotateSpeed={1.5}
				/>
			</Canvas>
			{label && (
				<div
					style={{
						position: 'absolute',
						top: 12,
						left: 12,
						padding: '6px 12px',
						background: '#000000cc',
						border: `1px solid ${pieceId ? '#7ab6ff88' : '#ffffff33'}`,
						borderRadius: 6,
						color: '#e8e8ee',
						font: '13px/1 ui-monospace, monospace',
						pointerEvents: 'none',
						cursor: pieceId ? 'pointer' : 'default',
					}}>
					{label}
					{status}
				</div>
			)}
		</div>
	);
}
