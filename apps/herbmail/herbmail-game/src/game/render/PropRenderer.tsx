import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { getDungeon, getMountedEids, usePropGen } from '../dungeon/store';
import { useOcclusionField } from '../dungeon/occlusion';
import {
	MODEL_URLS,
	MODEL_TORCH,
	MODEL_CRATE,
	PROP_CRATE,
	PROP_STONE,
} from '../prop/kinds';
import { Prop } from '../mecs/props';
import { MeshPool, torchConfig, crateConfig, stoneConfig } from './MeshPool';
import { FlamePool } from './FlamePool';
import { FireflyPool } from './FireflyPool';
import { FireflySystem } from '../prop/firefly';
import { LightSystem } from './LightSystem';
import { getDebrisPool } from './DebrisPool';
import { applyCrateDamage } from './crateDecal';
import { applyStoneMine } from './stoneMine';
import { burnTick } from '../prop/burn';
import { npcSystem } from '../npc/goblinSim';
import { castSystem } from '../combat/castSystem';
import { isEagle } from '../menu/eagleStore';

const TORCH_URL = MODEL_URLS[MODEL_TORCH];
const CRATE_URL = MODEL_URLS[MODEL_CRATE];
useGLTF.preload(TORCH_URL);
useGLTF.preload(CRATE_URL);

// Single imperative entry point for all room props: owns the mesh/flame pools and
// the light system, reconciles the pools whenever the ECS prop set changes, and
// ticks the per-frame systems. Replaces WallTorches + TorchLighting.
export function PropRenderer({ ambient = 0.16 }: { ambient?: number }) {
	const gen = usePropGen();
	const torchGltf = useGLTF(TORCH_URL);
	const crateGltf = useGLTF(CRATE_URL);
	const occ = useOcclusionField();
	const occRef = useRef(occ);
	useEffect(() => {
		occRef.current = occ;
	}, [occ]);

	const meshPool = useMemo(
		() =>
			new MeshPool([
				torchConfig(torchGltf.scene),
				crateConfig(crateGltf.scene),
				stoneConfig(),
			]),
		[torchGltf.scene, crateGltf.scene],
	);
	const debrisPool = useMemo(() => getDebrisPool(), []);
	const flamePool = useMemo(() => new FlamePool(), []);
	const fireflyPool = useMemo(() => new FireflyPool(), []);
	const fireflySystem = useMemo(() => new FireflySystem(), []);
	const lightSystem = useMemo(() => new LightSystem(), []);

	useEffect(() => {
		const world = getDungeon().world;
		meshPool.reconcile(world);
		flamePool.reconcile(world);
		fireflyPool.reconcile(world);
	}, [gen, meshPool, flamePool, fireflyPool]);

	useEffect(() => () => meshPool.dispose(), [meshPool]);
	useEffect(() => () => flamePool.dispose(), [flamePool]);
	useEffect(() => () => fireflyPool.dispose(), [fireflyPool]);
	useEffect(() => () => lightSystem.dispose(), [lightSystem]);

	useFrame((state, delta) => {
		// Eagle snapshot freezes the whole sim (flames, goblins, lights, pools)
		// so the captured draw set stays static while the inspection camera flies.
		if (isEagle()) return;
		const world = getDungeon().world;
		const cdt = Math.min(delta, 0.05);
		npcSystem(world, state.clock.elapsedTime, cdt);
		castSystem(world, cdt);
		const mounted = getMountedEids();
		fireflySystem.tick(world, mounted, state.clock.elapsedTime, delta);
		lightSystem.tick(
			world,
			mounted,
			state.camera,
			state.clock.elapsedTime,
			occRef.current,
			ambient,
		);
		// Burn DoT ages active fires (spawning/ despawning FlameFx victims); reconcile
		// the flame pool only when that set actually changed.
		if (burnTick(delta)) flamePool.reconcile(world);
		flamePool.tick(state.clock.elapsedTime, state.camera);
		fireflyPool.tick(state.clock.elapsedTime);
		debrisPool.tick(delta);
		// One pass over pooled meshes, dispatched by prop kind (crate crack decal /
		// stone shrink) instead of two full walks.
		for (const [eid, group] of meshPool.entries()) {
			const kind = Prop.kind[eid];
			if (kind === PROP_CRATE) applyCrateDamage(eid, group);
			else if (kind === PROP_STONE) applyStoneMine(eid, group);
		}
	});

	return (
		<>
			<primitive object={meshPool.root} />
			<primitive object={debrisPool.root} />
			<primitive object={flamePool.root} />
			<primitive object={fireflyPool.root} />
			<primitive object={lightSystem.root} />
		</>
	);
}
