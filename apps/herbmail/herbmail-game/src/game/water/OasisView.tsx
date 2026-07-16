import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OASIS_ACTIVE_RADIUS, OASIS_VISIBLE_RADIUS } from './constants';
import { OasisInstance } from './OasisInstance';
import {
	useOases,
	oasisAt,
	setCameraSubmerged,
	useCameraSubmerged,
	type OasisDef,
} from './oasis';
import { loadWaterAssets, type WaterAssets } from './assets';

function SubmergeSensor() {
	const camera = useThree((s) => s.camera);
	useFrame(() => {
		const p = oasisAt(camera.position.x, camera.position.z);
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

function WaterOasis({ def, assets }: { def: OasisDef; assets: WaterAssets }) {
	const gl = useThree((s) => s.gl);
	const scene = useThree((s) => s.scene);
	const camera = useThree((s) => s.camera);
	const instRef = useRef<OasisInstance | null>(null);
	const active = useRef(false);

	useEffect(() => {
		const i = new OasisInstance(
			gl,
			def,
			assets.tileTexture,
			assets.cubemap,
		);
		instRef.current = i;
		scene.add(i.group);
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
		inst.setVisible(d < OASIS_VISIBLE_RADIUS, camera.position.y);
		const on = d < OASIS_ACTIVE_RADIUS;
		if (on) {
			inst.update(camera);
		} else if (active.current !== on) {
			inst.prepare(camera);
		}
		active.current = on;
	});

	return null;
}

export function Oases() {
	const oases = useOases();
	if (import.meta.env.DEV)
		(globalThis as unknown as Record<string, unknown>).__oasesMounted =
			oases.length;
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
	if (!oases.length || !assets) return null;
	return (
		<>
			<SubmergeSensor />
			{oases.map((p) => (
				<WaterOasis key={p.id} def={p} assets={assets} />
			))}
		</>
	);
}
