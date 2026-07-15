import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { POOL_ACTIVE_RADIUS, POOL_VISIBLE_RADIUS } from './constants';
import { PoolInstance } from './PoolInstance';
import {
	usePools,
	poolAt,
	setCameraSubmerged,
	useCameraSubmerged,
	type PoolDef,
} from './pools';
import { loadWaterAssets, type WaterAssets } from './assets';

// Beyond-demo underwater feel: fullscreen grade while the camera itself is
// under a pool's surface (the demo conveys it only via the below-sheet).
function SubmergeSensor() {
	const camera = useThree((s) => s.camera);
	useFrame(() => {
		const p = poolAt(camera.position.x, camera.position.z);
		setCameraSubmerged(!!p && camera.position.y < p.surfaceY);
	});
	return null;
}

export function UnderwaterTint() {
	const on = useCameraSubmerged();
	if (!on) return null;
	return (
		<div
			style={{
				position: 'fixed',
				inset: 0,
				pointerEvents: 'none',
				background:
					'radial-gradient(ellipse at 50% 40%, rgba(40,120,140,0.28), rgba(10,50,70,0.5))',
				mixBlendMode: 'multiply',
			}}
		/>
	);
}

function WaterPool({ def, assets }: { def: PoolDef; assets: WaterAssets }) {
	const gl = useThree((s) => s.gl);
	const scene = useThree((s) => s.scene);
	const camera = useThree((s) => s.camera);
	// Imperative spawn-in-effect (PropRenderer pattern): StrictMode's fake
	// unmount/remount disposes and recreates cleanly, and no setState-in-effect
	// cascade. The instance never flows through React state.
	const instRef = useRef<PoolInstance | null>(null);
	const active = useRef(false);

	useEffect(() => {
		const i = new PoolInstance(gl, def, assets.tileTexture, assets.cubemap);
		instRef.current = i;
		scene.add(i.group);
		// Prime immediately: a mounted-but-inactive pool must never draw with
		// null water/caustic samplers (Safari flags the mismatched bind).
		i.prepare(camera);
		return () => {
			instRef.current = null;
			i.dispose();
		};
	}, [gl, scene, camera, def, assets]);

	useFrame(() => {
		const inst = instRef.current;
		if (!inst) return;
		const d = Math.hypot(
			camera.position.x - def.cx,
			camera.position.z - def.cz,
		);
		inst.setVisible(d < POOL_VISIBLE_RADIUS, camera.position.y);
		const on = d < POOL_ACTIVE_RADIUS;
		if (on) {
			inst.update(camera);
		} else if (active.current !== on) {
			// Freeze: rebind uniforms once so the frozen textures stay valid.
			inst.prepare(camera);
		}
		active.current = on;
	});

	return null;
}

export function Pools() {
	const pools = usePools();
	if (import.meta.env.DEV)
		(globalThis as unknown as Record<string, unknown>).__poolsMounted =
			pools.length;
	const [assets, setAssets] = useState<WaterAssets | null>(null);
	useEffect(() => {
		let live = true;
		void loadWaterAssets().then((a) => {
			if (live) setAssets(a);
		});
		return () => {
			live = false;
		};
	}, []);
	if (!pools.length || !assets) return null;
	return (
		<>
			<SubmergeSensor />
			{pools.map((p) => (
				<WaterPool key={p.id} def={p} assets={assets} />
			))}
		</>
	);
}
