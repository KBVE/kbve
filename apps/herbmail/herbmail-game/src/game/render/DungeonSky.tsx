import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { WALL_H } from '../config';
import { loadWaterAssets } from '../water/assets';

// Sky rendered as a plane just above the ceiling, NOT as scene.background — a
// background fills every empty pixel (down corridors, through un-streamed walls)
// and leaks sky into the enclosed dungeon. This plane sits above WALL_H so the
// opaque ceiling occludes it by depth everywhere except the oasis openings,
// where the ceiling is missing and the sky shows through. It follows the camera
// in XZ so the opening always looks onto sky. Fragment samples the skybox cube
// by view direction, so it reads as a real sky through the hole.
const vertex = /* glsl */ `
	varying vec3 vWorld;
	void main() {
		vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;
const fragment = /* glsl */ `
	uniform samplerCube uSky;
	varying vec3 vWorld;
	void main() {
		vec3 dir = normalize(vWorld - cameraPosition);
		gl_FragColor = textureCube(uSky, dir);
	}
`;

export function DungeonSky() {
	const ref = useRef<THREE.Mesh>(null);
	const mat = useMemo(
		() =>
			new THREE.ShaderMaterial({
				uniforms: { uSky: { value: null } },
				vertexShader: vertex,
				fragmentShader: fragment,
				side: THREE.DoubleSide,
				depthWrite: false,
				fog: false,
			}),
		[],
	);

	useEffect(() => {
		let alive = true;
		loadWaterAssets().then((a) => {
			if (alive) mat.uniforms.uSky.value = a.cubemap;
		});
		return () => {
			alive = false;
			mat.dispose();
		};
	}, [mat]);

	useFrame((state) => {
		const m = ref.current;
		if (!m) return;
		m.position.set(state.camera.position.x, WALL_H + 0.5, state.camera.position.z);
	});

	return (
		<mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={-1}>
			<planeGeometry args={[400, 400]} />
		</mesh>
	);
}
