import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { psxMaterialRegistry } from '../render/PsxMaterial';
import { qualityTier } from '../render/qualityStore';

const HISTORY = 180;

interface Sample {
	t: number;
	fps: number;
	calls: number;
	tris: number;
	geos: number;
	tex: number;
	progs: number;
	psxMats: number;
	tier: number;
	dpr: number;
	w: number;
	h: number;
	heapMb: number;
}

const history: Sample[] = [];
let start = 0;

function heapMb(): number {
	const perf = performance as Performance & {
		memory?: { usedJSHeapSize: number };
	};
	return perf.memory ? +(perf.memory.usedJSHeapSize / 1048576).toFixed(1) : 0;
}

function table(): string {
	const head =
		't       fps  calls  tris    geos  tex  progs psx  tier dpr   size        heapMB';
	const rows = history.map(
		(s) =>
			`${s.t.toFixed(0).padStart(6)}  ${s.fps.toFixed(0).padStart(3)}  ${String(
				s.calls,
			).padStart(5)}  ${String(s.tris).padStart(6)}  ${String(
				s.geos,
			).padStart(4)}  ${String(s.tex).padStart(3)}  ${String(
				s.progs,
			).padStart(
				5,
			)} ${String(s.psxMats).padStart(4)} ${String(s.tier).padStart(4)} ${String(
				s.dpr,
			).padStart(
				5,
			)} ${`${s.w}x${s.h}`.padStart(11)} ${String(s.heapMb).padStart(6)}`,
	);
	return [head, ...rows].join('\n');
}

interface CtxState {
	lost: boolean;
	losses: number;
	at: number;
	detail: string;
}

let ctxState: CtxState = { lost: false, losses: 0, at: 0, detail: '' };
const ctxListeners = new Set<() => void>();

function setCtxState(next: CtxState): void {
	ctxState = next;
	for (const l of ctxListeners) l();
}

export function useContextState(): CtxState {
	return useSyncExternalStore(
		(cb) => {
			ctxListeners.add(cb);
			return () => ctxListeners.delete(cb);
		},
		() => ctxState,
		() => ctxState,
	);
}

export function ContextLostToast() {
	const s = useContextState();
	if (!s.losses) return null;
	return (
		<div
			role="status"
			style={{
				position: 'fixed',
				top: 12,
				left: '50%',
				transform: 'translateX(-50%)',
				zIndex: 60,
				padding: '10px 16px',
				borderRadius: 6,
				border: `1px solid ${s.lost ? '#e07a5f' : '#7ac77a'}`,
				background: 'rgba(10,10,14,0.92)',
				color: s.lost ? '#ffb4a0' : '#b8e6b8',
				font: '12px monospace',
				pointerEvents: 'none',
				textAlign: 'center',
			}}>
			<div>
				{s.lost
					? 'WebGL context LOST — GPU reset. Rendering stopped.'
					: 'WebGL context restored.'}
			</div>
			<div style={{ opacity: 0.6, marginTop: 4 }}>
				{`loss #${s.losses} at ${(s.at / 1000).toFixed(1)}s · ${s.detail} · console has CTX dump`}
			</div>
		</div>
	);
}

export function ContextWatch() {
	const gl = useThree((s) => s.gl);
	const acc = useRef(0);
	const ms = useRef(16.7);

	useEffect(() => {
		const canvas = gl.domElement;
		const dump = (label: string) => {
			const ctx = gl.getContext() as WebGL2RenderingContext;
			const detail = `geos=${gl.info.memory.geometries} tex=${gl.info.memory.textures} progs=${gl.info.programs?.length ?? 0} tier=${qualityTier()} dpr=${gl.getPixelRatio()} heap=${heapMb()}MB`;
			if (label === 'LOST' || label === 'RESTORED') {
				setCtxState({
					lost: label === 'LOST',
					losses:
						label === 'LOST'
							? ctxState.losses + 1
							: Math.max(ctxState.losses, 1),
					at: performance.now() - start,
					detail,
				});
			}
			console.error(
				`CTX ${label} at t=${((performance.now() - start) / 1000).toFixed(1)}s ` +
					`isContextLost=${ctx.isContextLost()} ` +
					`drawingBuffer=${ctx.drawingBufferWidth}x${ctx.drawingBufferHeight} ` +
					`geos=${gl.info.memory.geometries} tex=${gl.info.memory.textures} ` +
					`progs=${gl.info.programs?.length ?? 0} psxMats=${psxMaterialRegistry.size} ` +
					`tier=${qualityTier()} dpr=${gl.getPixelRatio()} heapMB=${heapMb()}\n` +
					table(),
			);
		};
		const onLost = (e: Event) => {
			e.preventDefault();
			dump('LOST');
		};
		const onRestored = () => dump('RESTORED');
		canvas.addEventListener('webglcontextlost', onLost, false);
		canvas.addEventListener('webglcontextrestored', onRestored, false);
		(window as unknown as Record<string, unknown>).__ctxdump = () =>
			dump('MANUAL');
		start = performance.now();
		return () => {
			canvas.removeEventListener('webglcontextlost', onLost);
			canvas.removeEventListener('webglcontextrestored', onRestored);
		};
	}, [gl]);

	useFrame((_, delta) => {
		ms.current += (delta * 1000 - ms.current) * 0.1;
		acc.current += delta;
		if (acc.current < 1) return;
		acc.current = 0;
		const buf = gl.getContext() as WebGL2RenderingContext;
		history.push({
			t: (performance.now() - start) / 1000,
			fps: 1000 / ms.current,
			calls: gl.info.render.calls,
			tris: gl.info.render.triangles,
			geos: gl.info.memory.geometries,
			tex: gl.info.memory.textures,
			progs: gl.info.programs?.length ?? 0,
			psxMats: psxMaterialRegistry.size,
			tier: qualityTier(),
			dpr: gl.getPixelRatio(),
			w: buf.drawingBufferWidth,
			h: buf.drawingBufferHeight,
			heapMb: heapMb(),
		});
		if (history.length > HISTORY) history.shift();
	}, 1.5);

	return null;
}
