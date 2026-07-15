import { useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { setPlayerAnchor } from '../render/playerAnchor';
import type { CharacterHandle } from './Character';

export function CharacterShadow({
	target,
}: {
	target: MutableRefObject<CharacterHandle | null>;
}) {
	const catcherRef = useRef<THREE.Mesh>(null);

	useFrame(() => {
		const h = target.current;
		if (!h || !catcherRef.current) return;
		const p = h.motor.position;
		setPlayerAnchor(p.x, p.y, p.z);
		// Ride the motor's ground height (pool basins sit below y=0) and hide
		// in water — a fixed-height catcher floats around the swimmer as a
		// phantom ring.
		catcherRef.current.visible = h.motor.mode === 'ground';
		catcherRef.current.position.set(p.x, p.y + 0.02, p.z);
	});

	return (
		<mesh
			ref={catcherRef}
			rotation-x={-Math.PI / 2}
			receiveShadow
			renderOrder={1}>
			<planeGeometry args={[6, 6]} />
			<shadowMaterial transparent opacity={0.45} depthWrite={false} />
		</mesh>
	);
}
