import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useEagle } from '../menu/eagleStore';
import { playerAnchor } from './playerAnchor';
import { psxMaterialRegistry } from './PsxMaterial';

const EAGLE_HEIGHT = 34;
const EAGLE_BACK = 0.001;
const EAGLE_AMBIENT = 3.0;

const _proj = new THREE.Matrix4();
const _frustum = new THREE.Frustum();

interface Saved {
	visible: boolean;
	culled: boolean;
}

export function EagleEye() {
	const active = useEagle();
	const camRef = useRef<THREE.PerspectiveCamera>(null);
	const ctlRef = useRef<OrbitControlsImpl>(null);
	const gl = useThree((s) => s.gl);
	const scene = useThree((s) => s.scene);
	const saved = useRef<Map<THREE.Mesh, Saved>>(new Map());

	useEffect(() => {
		if (!active) return;
		if (document.pointerLockElement) document.exitPointerLock();

		// Snapshot the player-view draw set: cull once against the game camera's
		// last frustum, hide everything outside it, and disable per-object culling
		// so exactly that set renders from any eagle angle. Triangle count then
		// stays fixed as the camera orbits instead of pulling in fresh geometry.
		const gameCam = (
			window as unknown as { __vm?: { camera?: THREE.Camera } }
		).__vm?.camera;
		const store = saved.current;
		store.clear();
		if (gameCam) {
			scene.updateMatrixWorld(true);
			gameCam.updateMatrixWorld();
			_proj.multiplyMatrices(
				gameCam.projectionMatrix,
				gameCam.matrixWorldInverse,
			);
			_frustum.setFromProjectionMatrix(_proj);
			scene.traverse((o) => {
				const m = o as THREE.Mesh;
				if (!m.isMesh) return;
				store.set(m, { visible: m.visible, culled: m.frustumCulled });
				const shown = m.visible && _frustum.intersectsObject(m);
				m.frustumCulled = false;
				m.visible = shown;
			});
		}

		// LightSystem is frozen, so push fullbright straight onto the PSX
		// materials (they ignore scene lights) and restore on exit.
		const ambientRestore: Array<[{ value: number }, number]> = [];
		for (const mat of psxMaterialRegistry) {
			const u = (
				mat as unknown as {
					uniforms: Record<string, { value: number }>;
				}
			).uniforms;
			if (!u.uAmbient) continue;
			ambientRestore.push([u.uAmbient, u.uAmbient.value]);
			u.uAmbient.value = EAGLE_AMBIENT;
		}

		const p = playerAnchor.pos;
		const cam = camRef.current;
		const ctl = ctlRef.current;
		if (cam) cam.position.set(p.x, p.y + EAGLE_HEIGHT, p.z + EAGLE_BACK);
		if (ctl) {
			ctl.target.set(p.x, p.y, p.z);
			ctl.update();
		}

		return () => {
			for (const [m, s] of store) {
				m.visible = s.visible;
				m.frustumCulled = s.culled;
			}
			store.clear();
			for (const [u, v] of ambientRestore) u.value = v;
		};
	}, [active, scene]);

	if (!active) return null;

	return (
		<>
			<PerspectiveCamera
				ref={camRef}
				makeDefault
				fov={55}
				near={0.1}
				far={800}
			/>
			<OrbitControls
				ref={ctlRef}
				makeDefault
				domElement={gl.domElement}
				enableDamping
				dampingFactor={0.12}
				maxDistance={400}
			/>
			<ambientLight intensity={2.2} />
			<hemisphereLight args={[0xffffff, 0x404050, 1.4]} />
		</>
	);
}
