import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getTarget, isHardLock } from './targeting';
import { Transform3, Targetable } from '../mecs/props';

const BOB_HZ = 2.2;
const HEAD_Y = 1.9;

// Floating diamond over the locked target; amber soft lock, red hard lock.
export function TargetMarker() {
	const ref = useRef<THREE.Mesh>(null);

	useFrame((state) => {
		const m = ref.current;
		if (!m) return;
		const eid = getTarget();
		if (eid === null) {
			m.visible = false;
			return;
		}
		const y = Targetable.radius[eid] + HEAD_Y;
		m.visible = true;
		m.position.set(
			Transform3.px[eid],
			Transform3.py[eid] +
				y +
				Math.sin(state.clock.elapsedTime * BOB_HZ * Math.PI) * 0.08,
			Transform3.pz[eid],
		);
		m.rotation.y = state.clock.elapsedTime * 1.5;
		(m.material as THREE.MeshBasicMaterial).color.set(
			isHardLock() ? '#ff4433' : '#ffb84d',
		);
	});

	return (
		<mesh ref={ref} visible={false} renderOrder={999}>
			<octahedronGeometry args={[0.14]} />
			<meshBasicMaterial
				color="#ffb84d"
				depthTest={false}
				toneMapped={false}
				transparent
				opacity={0.9}
			/>
		</mesh>
	);
}
