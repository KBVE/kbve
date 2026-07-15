import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { onContact } from './melee';

export function TargetDummy({
	position = [9.9, 1.3, 8.3],
}: {
	position?: [number, number, number];
}) {
	return (
		<mesh position={position} userData={{ hitbox: true }}>
			<boxGeometry args={[0.5, 1.6, 0.5]} />
			<meshStandardMaterial color="#4a6a8a" />
		</mesh>
	);
}

export function MeleeSpark() {
	const ref = useRef<THREE.Mesh>(null);
	const life = useRef(0);

	useEffect(
		() =>
			onContact((c) => {
				const m = ref.current;
				if (!m) return;
				m.position.set(c.point[0], c.point[1], c.point[2]);
				(m.material as THREE.MeshBasicMaterial).color.set(
					c.kind === 'target' ? '#ff5533' : '#ffdd55',
				);
				life.current = 0.18;
				console.info(
					'[melee] contact',
					c.kind,
					c.point.map((n) => +n.toFixed(2)),
				);
			}),
		[],
	);

	useFrame((_, dt) => {
		const m = ref.current;
		if (!m) return;
		life.current = Math.max(0, life.current - dt);
		const s = life.current * 6;
		m.visible = s > 0.01;
		m.scale.setScalar(0.05 + s * 0.12);
	});

	return (
		<mesh ref={ref} visible={false} renderOrder={1000}>
			<sphereGeometry args={[1, 8, 8]} />
			<meshBasicMaterial
				color="#ffdd55"
				depthTest={false}
				toneMapped={false}
			/>
		</mesh>
	);
}
