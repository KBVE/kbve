import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { psxMaterialRegistry } from '../render/PsxMaterial';
import { usePsx } from '../menu/settingsStore';
import { getDungeon } from '../dungeon/store';
import { qualityTier } from '../render/qualityStore';
import { SECTOR_TILES } from '../dungeon/generate';
import { SOLID, DOORWAY, PILLAR, PIT } from '../geometry/grid';
import { doorClosedAt } from '../door/doors';
import { TILE } from '../config';

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
	camDX: number;
	camDZ: number;
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
	camDX: 0,
	camDZ: -1,
};

export function StatsProbe() {
	const gl = useThree((s) => s.gl);
	const acc = useRef(0);
	const worst = useRef(0);
	const peakTris = useRef(0);
	const peakCalls = useRef(0);
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
		if (ms > worst.current) worst.current = ms;
		if (snapshot.triangles > peakTris.current)
			peakTris.current = snapshot.triangles;
		if (snapshot.calls > peakCalls.current)
			peakCalls.current = snapshot.calls;
		acc.current += delta;
		if (acc.current >= 1) {
			acc.current = 0;
			const s = snapshot;
			console.warn(
				`PERF fps=${s.fps.toFixed(0)} avgMs=${s.ms.toFixed(1)} worstMs=${worst.current.toFixed(1)} calls=${s.calls} peakCalls=${peakCalls.current} tris=${s.triangles} peakTris=${peakTris.current} geos=${s.geometries} tex=${s.textures} progs=${s.programs} psxMats=${s.psxMats} lights=${s.lights} tier=${qualityTier()} sector=${Math.floor(s.camX / SPAN)},${Math.floor(s.camZ / SPAN)}`,
			);
			worst.current = 0;
			peakTris.current = 0;
			peakCalls.current = 0;
		}
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
		const e = state.camera.matrixWorld.elements;
		snapshot.camDX = -e[8];
		snapshot.camDZ = -e[10];
		gl.info.reset();
	}, 2);
	return null;
}

const MAP_PX = 192;
const SPAN = SECTOR_TILES * TILE;

// Top-down tile map of the current sector: walls grey, floor dark, arches
// amber (red while locked), pillars dotted, player as a facing wedge. Redrawn
// on the same 250ms cadence as the stat rows — debug aid, not a HUD feature.
function DebugMinimap() {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const px = MAP_PX / SECTOR_TILES;
		const id = setInterval(() => {
			const ctx = ref.current?.getContext('2d');
			if (!ctx) return;
			const sx = Math.floor(snapshot.camX / SPAN);
			const sy = Math.floor(snapshot.camZ / SPAN);
			const dw = getDungeon();
			const eid = dw.sectorEidAt(sx, sy);
			const desc = eid === undefined ? undefined : dw.desc(eid);
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, MAP_PX, MAP_PX);
			if (desc) {
				for (let r = 0; r < desc.rows; r++) {
					for (let c = 0; c < desc.cols; c++) {
						const t = desc.tiles[r * desc.cols + c];
						if (t & DOORWAY) {
							ctx.fillStyle = doorClosedAt(
								desc.originCol + c,
								desc.originRow + r,
							)
								? '#c0392b'
								: '#d98e2b';
						} else if (t & PIT) {
							ctx.fillStyle = '#1d4e6b';
						} else if (t & SOLID && !(t & PILLAR)) {
							ctx.fillStyle = '#3a3a44';
						} else if (t & PILLAR) {
							ctx.fillStyle = '#6a6a7a';
						} else {
							ctx.fillStyle = '#14141c';
						}
						ctx.fillRect(c * px, r * px, px, px);
					}
				}
			}
			const mx = ((snapshot.camX - sx * SPAN) / SPAN) * MAP_PX;
			const mz = ((snapshot.camZ - sy * SPAN) / SPAN) * MAP_PX;
			const a = Math.atan2(snapshot.camDX, -snapshot.camDZ);
			ctx.save();
			ctx.translate(mx, mz);
			ctx.rotate(a);
			ctx.fillStyle = '#7ab6ff';
			ctx.beginPath();
			ctx.moveTo(0, -6);
			ctx.lineTo(4, 4);
			ctx.lineTo(-4, 4);
			ctx.closePath();
			ctx.fill();
			ctx.restore();
			ctx.fillStyle = '#c9c9d6';
			ctx.font = '9px monospace';
			ctx.fillText(`sector ${sx},${sy}`, 4, MAP_PX - 4);
		}, 250);
		return () => clearInterval(id);
	}, []);
	return (
		<canvas
			ref={ref}
			width={MAP_PX}
			height={MAP_PX}
			style={{
				display: 'block',
				marginTop: 8,
				border: '1px solid #333',
				borderRadius: 4,
				width: MAP_PX,
				height: MAP_PX,
			}}
		/>
	);
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
			<DebugMinimap />
		</div>
	);
}
