import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { getDungeon, usePropGen } from '../dungeon/store';
import { useOcclusionField } from '../dungeon/occlusion';
import { MODEL_URLS } from '../prop/kinds';
import { MeshPool } from './MeshPool';
import { FlamePool } from './FlamePool';
import { LightSystem } from './LightSystem';

const TORCH_URL = MODEL_URLS[0];
useGLTF.preload(TORCH_URL);

// Single imperative entry point for all room props: owns the mesh/flame pools and
// the light system, reconciles the pools whenever the ECS prop set changes, and
// ticks the per-frame systems. Replaces WallTorches + TorchLighting.
export function PropRenderer({ ambient = 0.16 }: { ambient?: number }) {
	const gen = usePropGen();
	const gltf = useGLTF(TORCH_URL);
	const occ = useOcclusionField();
	const occRef = useRef(occ);
	useEffect(() => {
		occRef.current = occ;
	}, [occ]);

	const meshPool = useMemo(() => new MeshPool([gltf.scene]), [gltf.scene]);
	const flamePool = useMemo(() => new FlamePool(), []);
	const lightSystem = useMemo(() => new LightSystem(), []);

	useEffect(() => {
		const world = getDungeon().world;
		meshPool.reconcile(world);
		flamePool.reconcile(world);
	}, [gen, meshPool, flamePool]);

	useEffect(() => () => meshPool.dispose(), [meshPool]);
	useEffect(() => () => flamePool.dispose(), [flamePool]);
	useEffect(() => () => lightSystem.dispose(), [lightSystem]);

	useFrame((state) => {
		const world = getDungeon().world;
		lightSystem.tick(
			world,
			state.scene,
			state.camera,
			state.clock.elapsedTime,
			occRef.current,
			ambient,
		);
		flamePool.tick(state.clock.elapsedTime, state.camera);
	});

	return (
		<>
			<primitive object={meshPool.root} />
			<primitive object={flamePool.root} />
			<primitive object={lightSystem.root} />
		</>
	);
}
