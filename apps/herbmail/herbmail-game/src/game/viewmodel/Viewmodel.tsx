import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { ARMS_URL, REST, type ViewmodelRest } from './config';
import { makePsxViewmodelMaterial } from './psxSkinnedMaterial';
import { useViewmodelMotion } from './useViewmodelMotion';
import { useArmIk } from './useArmIk';

useGLTF.preload(ARMS_URL);

interface Props {
	equippedId: string;
	snap: number;
	restOverride?: ViewmodelRest;
}

export function Viewmodel({ snap, restOverride }: Props) {
	const size = useThree((s) => s.size);
	const gltf = useGLTF(ARMS_URL);

	const groupRef = useRef<THREE.Group>(null);
	const clearedFrame = useRef(-1);
	const restRef = useRef<ViewmodelRest>({ ...REST });
	useViewmodelMotion(groupRef, restRef);
	const { actions, mixer } = useAnimations(gltf.animations, groupRef);
	const sceneRootRef = useRef<THREE.Object3D | null>(null);
	useArmIk(groupRef, sceneRootRef);

	const psx = useMemo(() => {
		let map: THREE.Texture | null = null;
		gltf.scene.traverse((o) => {
			const mesh = o as THREE.Mesh;
			if (mesh.isMesh && !map) {
				const m = mesh.material as THREE.MeshStandardMaterial;
				map = m.map ?? null;
			}
		});
		return makePsxViewmodelMaterial(map, snap);
	}, [gltf]);

	useEffect(() => {
		gltf.scene.traverse((o) => {
			const mesh = o as THREE.Mesh;
			if (mesh.isMesh) {
				mesh.material = psx.material;
				mesh.frustumCulled = false;
				mesh.renderOrder = 999;
				mesh.raycast = () => undefined;
				mesh.onBeforeRender = (renderer) => {
					const f = renderer.info.render.frame;
					if (f !== clearedFrame.current) {
						clearedFrame.current = f;
						renderer.clearDepth();
					}
				};
			}
		});
	}, [gltf, psx]);

	useEffect(() => {
		restRef.current = { ...(restOverride ?? REST) };
	}, [restOverride]);

	useEffect(() => {
		psx.setSnap(snap);
	}, [snap, psx]);

	useEffect(() => {
		psx.setRes(size.width, size.height);
	}, [size, psx]);

	useEffect(() => {
		const idle = actions['idle'];
		if (!idle) return;
		idle.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.3).play();
		return () => {
			idle.fadeOut(0.2);
		};
	}, [actions]);

	useEffect(() => {
		const idle = actions['idle'];
		const wave = actions['wave'];
		if (!wave) return;

		const play = (force = false) => {
			if (!force && !document.pointerLockElement) return;
			wave.reset();
			wave.setLoop(THREE.LoopOnce, 1);
			wave.clampWhenFinished = false;
			if (idle) wave.crossFadeFrom(idle, 0.15, false);
			wave.play();
		};
		const forcePlay = () => play(true);
		window.addEventListener('vmwave', forcePlay);
		const onFinished = () => {
			if (idle) idle.reset().fadeIn(0.2).play();
		};
		const onDown = (e: MouseEvent) => {
			if (e.button === 0) play();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.code === 'KeyV') play();
		};

		mixer.addEventListener('finished', onFinished);
		window.addEventListener('mousedown', onDown);
		window.addEventListener('keydown', onKey);
		return () => {
			mixer.removeEventListener('finished', onFinished);
			window.removeEventListener('mousedown', onDown);
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('vmwave', forcePlay);
		};
	}, [actions, mixer]);

	return (
		<group ref={groupRef}>
			<primitive object={gltf.scene} />
		</group>
	);
}
