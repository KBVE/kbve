import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

const CENTER = new THREE.Vector2(0, 0.26);

interface Props {
	onAim: (kind: string | null) => void;
}

export function AimReticle({ onAim }: Props) {
	const camera = useThree((s) => s.camera);
	const scene = useThree((s) => s.scene);
	const ray = useRef(new THREE.Raycaster());
	const last = useRef<string | null | undefined>(undefined);
	const acc = useRef(0);

	useFrame((_, dt) => {
		// The aim label is a coarse UI cue; a full recursive scene raycast every frame
		// is wasteful. Sample at ~10 Hz.
		acc.current += dt;
		if (acc.current < 0.1) return;
		acc.current = 0;
		ray.current.setFromCamera(CENTER, camera);
		const hits = ray.current.intersectObjects(scene.children, true);
		const kind = hits.length
			? ((hits[0].object.userData.kind as string) ?? null)
			: null;
		if (kind !== last.current) {
			last.current = kind;
			onAim(kind);
		}
	});

	return null;
}
