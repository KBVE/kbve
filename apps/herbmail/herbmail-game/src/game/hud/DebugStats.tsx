import { useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { psxMaterialRegistry } from '../render/PsxMaterial';
import { usePsx } from '../menu/settingsStore';

interface StatsSnapshot {
	fps: number;
	ms: number;
	calls: number;
	triangles: number;
	geometries: number;
	textures: number;
	programs: number;
	psxMats: number;
	lights: number;
	pomScale: number;
	pomMax: number;
	camX: number;
	camY: number;
	camZ: number;
}

const snapshot: StatsSnapshot = {
	fps: 0,
	ms: 0,
	calls: 0,
	triangles: 0,
	geometries: 0,
	textures: 0,
	programs: 0,
	psxMats: 0,
	lights: 0,
	pomScale: 0,
	pomMax: 0,
	camX: 0,
	camY: 0,
	camZ: 0,
};

export function StatsProbe() {
	const gl = useThree((s) => s.gl);
	useEffect(() => {
		gl.info.autoReset = false;
		return () => {
			gl.info.autoReset = true;
		};
	}, [gl]);
	useFrame((state, delta) => {
		const ms = delta * 1000;
		snapshot.ms += (ms - snapshot.ms) * 0.1;
		snapshot.fps = snapshot.ms > 0 ? 1000 / snapshot.ms : 0;
		snapshot.calls = gl.info.render.calls;
		snapshot.triangles = gl.info.render.triangles;
		snapshot.geometries = gl.info.memory.geometries;
		snapshot.textures = gl.info.memory.textures;
		snapshot.programs = gl.info.programs?.length ?? 0;
		snapshot.psxMats = psxMaterialRegistry.size;
		const first = psxMaterialRegistry.values().next().value;
		if (first) {
			snapshot.lights = first.uniforms.uLightCount.value as number;
			snapshot.pomScale = first.uniforms.uPomScale.value as number;
			snapshot.pomMax = first.uniforms.uPomMax.value as number;
		}
		const p = state.camera.position;
		snapshot.camX = p.x;
		snapshot.camY = p.y;
		snapshot.camZ = p.z;
		gl.info.reset();
	}, 2);
	return null;
}

const fmt = (n: number) =>
	n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));

export function DebugStats() {
	const psx = usePsx();
	const [, tick] = useState(0);
	useEffect(() => {
		const id = setInterval(() => tick((t) => t + 1), 250);
		return () => clearInterval(id);
	}, []);

	const s = snapshot;
	const rows: Array<[string, string]> = [
		['fps', `${s.fps.toFixed(0)} (${s.ms.toFixed(1)}ms)`],
		['draw calls', fmt(s.calls)],
		['triangles', fmt(s.triangles)],
		['geometries', fmt(s.geometries)],
		['textures', fmt(s.textures)],
		['programs', String(s.programs)],
		['psx materials', String(s.psxMats)],
		['lights', String(s.lights)],
		['pom scale/max', `${s.pomScale.toFixed(3)} / ${s.pomMax}`],
		[
			'camera',
			`${s.camX.toFixed(1)} ${s.camY.toFixed(1)} ${s.camZ.toFixed(1)}`,
		],
		['dpr/snap', `${psx.dpr} / ${psx.snap}`],
		['affine/fov', `${psx.affine} / ${psx.fov}`],
	];

	return (
		<div
			style={{
				position: 'fixed',
				top: 76,
				left: 12,
				width: 210,
				padding: '10px 12px',
				background: 'rgba(10,10,14,0.85)',
				border: '1px solid #333',
				borderRadius: 6,
				color: '#c9c9d6',
				font: '11px monospace',
				pointerEvents: 'none',
				userSelect: 'none',
			}}>
			<div style={{ marginBottom: 6, opacity: 0.7 }}>debug stats</div>
			{rows.map(([label, value]) => (
				<div
					key={label}
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						gap: 8,
					}}>
					<span style={{ opacity: 0.65 }}>{label}</span>
					<span>{value}</span>
				</div>
			))}
		</div>
	);
}
