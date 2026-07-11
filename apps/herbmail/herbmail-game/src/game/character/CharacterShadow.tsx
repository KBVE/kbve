import { useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { LightEmitter, query, Transform3 } from '@kbve/laser/ecs';
import { getDungeon } from '../dungeon/store';
import type { CharacterHandle } from './Character';

const HEAD_REACH = 1.122;
const HEAD_OFFSET = 0.28;

// Real silhouette shadow: a shadow-only directional light sits on the nearest
// torch's side and follows the character, casting the actual (equipment-accurate)
// mesh onto a transparent ShadowMaterial catcher on the floor. No added light, no
// disc — the catcher only darkens where the character occludes, so it self-hides
// on unlit floor and shows the true silhouette where a torch lights the ground.
export function CharacterShadow({
	target,
}: {
	target: MutableRefObject<CharacterHandle | null>;
}) {
	const lightRef = useRef<THREE.DirectionalLight>(null);
	const catcherRef = useRef<THREE.Mesh>(null);
	const lookTarget = useMemo(() => new THREE.Object3D(), []);

	useFrame(() => {
		const h = target.current;
		const dl = lightRef.current;
		if (!h || !dl) return;
		const p = h.motor.position;

		const world = getDungeon().world;
		let bx = p.x;
		let bz = p.z - 1;
		let best = Infinity;
		for (const eid of query(world, [LightEmitter, Transform3])) {
			const dx = Transform3.dx[eid];
			const dy = Transform3.dy[eid];
			const dz = Transform3.dz[eid];
			const len = Math.hypot(dx, dy, dz) || 1;
			const hx = Transform3.px[eid] + (dx / len) * HEAD_REACH;
			const hz = Transform3.pz[eid] + (dz / len) * HEAD_REACH;
			const ddx = hx - p.x;
			const ddz = hz - p.z;
			const d2 = ddx * ddx + ddz * ddz;
			if (d2 < best) {
				best = d2;
				bx = hx;
				bz = hz;
			}
		}

		// Light on the torch side, raised, so the shadow falls away from the flame.
		const ux = bx - p.x;
		const uz = bz - p.z;
		const l = Math.hypot(ux, uz) || 1;
		dl.position.set(p.x + (ux / l) * 3, p.y + 4.5, p.z + (uz / l) * 3);
		lookTarget.position.set(p.x, p.y + 0.1, p.z);
		lookTarget.updateMatrixWorld();

		if (catcherRef.current) catcherRef.current.position.set(p.x, 0.02, p.z);
	});

	return (
		<>
			<directionalLight
				ref={lightRef}
				castShadow
				intensity={0}
				target={lookTarget}
				shadow-mapSize-width={1024}
				shadow-mapSize-height={1024}
				shadow-camera-near={0.1}
				shadow-camera-far={12}
				shadow-camera-left={-2.4}
				shadow-camera-right={2.4}
				shadow-camera-top={2.4}
				shadow-camera-bottom={-2.4}
				shadow-bias={-0.0009}
			/>
			<primitive object={lookTarget} />
			<mesh
				ref={catcherRef}
				rotation-x={-Math.PI / 2}
				receiveShadow
				renderOrder={1}>
				<planeGeometry args={[6, 6]} />
				<shadowMaterial transparent opacity={0.6} depthWrite={false} />
			</mesh>
		</>
	);
}
