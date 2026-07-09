import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { ARMS_URL, REST, type ViewmodelRest } from './config';
import { makePsxViewmodelMaterial } from './psxSkinnedMaterial';
import { useViewmodelMotion } from './useViewmodelMotion';
import { createFsm } from './state';
import { equipmentById } from './equipment';

useGLTF.preload(ARMS_URL);

interface Props {
	equippedId: string;
	snap: number;
	restOverride?: ViewmodelRest;
}

export function Viewmodel({ equippedId, snap, restOverride }: Props) {
	const size = useThree((s) => s.size);
	const gltf = useGLTF(ARMS_URL);

	const armRef = useRef<THREE.Mesh>(null);
	const restRef = useRef<ViewmodelRest>({ ...REST });
	const fsm = useMemo(() => createFsm(), []);
	const motion = useViewmodelMotion(armRef, restRef);
	const equip = equipmentById(equippedId);

	const armGeo = useMemo(() => {
		let g: THREE.BufferGeometry | null = null;
		gltf.scene.traverse((o) => {
			const m = o as THREE.Mesh;
			if (m.isMesh && !g) {
				g = m.geometry.index
					? m.geometry.toNonIndexed()
					: m.geometry.clone();
			}
		});
		return g as THREE.BufferGeometry | null;
	}, [gltf]);

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
		restRef.current = { ...(restOverride ?? REST) };
	}, [restOverride]);

	useEffect(() => {
		psx.setSnap(snap);
	}, [snap, psx]);

	useEffect(() => {
		psx.setRes(size.width, size.height);
	}, [size, psx]);

	useEffect(() => {
		const act = (ev: 'primary' | 'secondary' | 'reload') => {
			if (!document.pointerLockElement) return;
			if (ev === 'reload' && !equip.reload) return;
			if (!fsm.fire(ev)) return;
			if (ev === 'primary') motion.trigger(equip.primaryImpulse);
			else if (ev === 'secondary') motion.trigger(equip.secondaryImpulse);
		};
		const onDown = (e: MouseEvent) => {
			if (e.button === 0) act('primary');
			else if (e.button === 2) act('secondary');
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.code === 'KeyR') act('reload');
			else if (e.code === 'KeyE') act('secondary');
		};
		const noMenu = (e: MouseEvent) => e.preventDefault();
		window.addEventListener('mousedown', onDown);
		window.addEventListener('keydown', onKey);
		window.addEventListener('contextmenu', noMenu);
		return () => {
			window.removeEventListener('mousedown', onDown);
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('contextmenu', noMenu);
		};
	}, [equip, fsm, motion]);

	useFrame((_, dt) => {
		fsm.tick(dt);
	});

	if (!armGeo) return null;

	return (
		<>
			<mesh
				geometry={armGeo}
				material={psx.material}
				position={[10, 1.4, 10]}
				scale={0.2}
				renderOrder={10000}
				frustumCulled={false}
			/>
			<mesh
				ref={armRef}
				geometry={armGeo}
				material={psx.material}
				renderOrder={999}
				frustumCulled={false}
			/>
		</>
	);
}
