import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

const CENTER = new THREE.Vector2(0, 0);

interface Props {
	onAim: (kind: string | null) => void;
}

export function AimReticle({ onAim }: Props) {
	const camera = useThree((s) => s.camera);
	const scene = useThree((s) => s.scene);
	const ray = useRef(new THREE.Raycaster());
	const last = useRef<string | null | undefined>(undefined);

	useFrame(() => {
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
