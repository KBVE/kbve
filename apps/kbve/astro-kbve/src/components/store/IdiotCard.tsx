import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox, Text } from '@react-three/drei';
import type { Group } from 'three';

function CardMesh() {
	const group = useRef<Group>(null);
	useFrame((_, delta) => {
		if (group.current) group.current.rotation.y += delta * 0.6;
	});
	return (
		<group ref={group}>
			<RoundedBox args={[2.3, 3.3, 0.12]} radius={0.14} smoothness={6}>
				<meshStandardMaterial
					color="#7c3aed"
					metalness={0.35}
					roughness={0.35}
				/>
			</RoundedBox>
			<Text
				position={[0, 0.9, 0.08]}
				fontSize={0.34}
				color="#fde68a"
				anchorX="center"
				anchorY="middle"
				maxWidth={2}
				textAlign="center">
				I AM AN
			</Text>
			<Text
				position={[0, 0.3, 0.08]}
				fontSize={0.62}
				color="#fef3c7"
				anchorX="center"
				anchorY="middle"
				maxWidth={2}
				textAlign="center">
				IDIOT
			</Text>
			<Text
				position={[0, -1.2, 0.08]}
				fontSize={0.16}
				color="#e9d5ff"
				anchorX="center"
				anchorY="middle">
				· KBVE COLLECTIBLE ·
			</Text>
		</group>
	);
}

export function IdiotCard({ revealed }: { revealed: boolean }) {
	return (
		<div
			className="kbve-store-card__stage"
			data-revealed={revealed ? 'true' : 'false'}
			aria-hidden={!revealed}>
			<Canvas camera={{ position: [0, 0, 6], fov: 42 }} dpr={[1, 2]}>
				<ambientLight intensity={0.7} />
				<directionalLight position={[3, 4, 5]} intensity={1.1} />
				<Suspense fallback={null}>
					<CardMesh />
				</Suspense>
			</Canvas>
			{!revealed && (
				<div className="kbve-store-card__lock" aria-hidden="true">
					<svg
						width="34"
						height="34"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round">
						<rect x="3" y="11" width="18" height="11" rx="2" />
						<path d="M7 11V7a5 5 0 0 1 10 0v4" />
					</svg>
				</div>
			)}
		</div>
	);
}

export default IdiotCard;
