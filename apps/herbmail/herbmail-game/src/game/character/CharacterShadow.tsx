import { useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { setPlayerAnchor } from '../render/playerAnchor';
import type { CharacterHandle } from './Character';

// Shadow catcher: a transparent ShadowMaterial plane parked under the character.
// The real torch point lights in LightSystem cast the character's cube-map shadow
// onto it, so the shadow direction/length derives from actual light geometry
// instead of the old fake directional-light rig.
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
		catcherRef.current.position.set(p.x, 0.02, p.z);
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
