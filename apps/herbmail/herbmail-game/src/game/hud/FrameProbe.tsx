import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { bvhStats } from '../render/bvh';
import { bakeApplyStats } from '../render/bake/bakePool';
import { geoBuildStats, geoTickStats } from '../dungeon/roomGeometry';

// Frame callbacks run in ascending priority: sim systems at 0, AOComposer at 1,
// StatsProbe at 2. Bracketing that at -1 and 3 splits a frame into the three
// places time can actually go, so a spike is attributed instead of guessed at:
//   outside - between our last callback and the next rAF: browser paint, GPU
//            fence, GC, React commits, idle callbacks, worker message handlers
//   sim     - every priority-0 subscriber
//   render  - composer.render()
interface FrameRec {
	i: number;
	total: number;
	outside: number;
	sim: number;
	render: number;
	geos: number;
	tex: number;
	progs: number;
	dGeos: number;
	dTex: number;
	dProgs: number;
	bakeApplied: number;
	bakeBatches: number;
	bakeMs: number;
	bakePending: number;
	bvhBuilt: number;
	bvhMs: number;
	bvhDepth: number;
	geoBuilds: number;
	geoTicks: number;
}

const CAP = 4096;
const recs: FrameRec[] = [];

export function FrameProbe() {
	const gl = useThree((s) => s.gl);
	const prevEnd = useRef(0);
	const t0 = useRef(0);
	const tPre = useRef(0);
	const n = useRef(0);
	const prev = useRef({
		geos: 0,
		tex: 0,
		progs: 0,
		bakeApplied: 0,
		bakeBatches: 0,
		bakeMs: 0,
		bvhBuilt: 0,
		bvhMs: 0,
		geoBuilds: 0,
		geoTicks: 0,
	});

	useFrame(() => {
		t0.current = performance.now();
	}, -1);

	useFrame(() => {
		tPre.current = performance.now();
	}, 0.5);

	useFrame(() => {
		const end = performance.now();
		const start = t0.current;
		const bake = bakeApplyStats();
		const bvh = bvhStats();
		const geo = geoBuildStats();
		const tick = geoTickStats();
		const p = prev.current;
		const mem = gl.info.memory;
		const progs = gl.info.programs?.length ?? 0;
		const rec: FrameRec = {
			i: n.current++,
			total: +(end - (prevEnd.current || start)).toFixed(2),
			outside: +(start - (prevEnd.current || start)).toFixed(2),
			sim: +(tPre.current - start).toFixed(2),
			render: +(end - tPre.current).toFixed(2),
			geos: mem.geometries,
			tex: mem.textures,
			progs,
			dGeos: mem.geometries - p.geos,
			dTex: mem.textures - p.tex,
			dProgs: progs - p.progs,
			bakeApplied: bake.applied - p.bakeApplied,
			bakeBatches: bake.batches - p.bakeBatches,
			bakeMs: +(bake.ms - p.bakeMs).toFixed(2),
			bakePending: bake.pending,
			bvhBuilt: bvh.built - p.bvhBuilt,
			bvhMs: +(bvh.ms - p.bvhMs).toFixed(2),
			bvhDepth: bvh.depth,
			geoBuilds: geo.builds - p.geoBuilds,
			geoTicks: tick.ticks - p.geoTicks,
		};
		p.geos = mem.geometries;
		p.tex = mem.textures;
		p.progs = progs;
		p.bakeApplied = bake.applied;
		p.bakeBatches = bake.batches;
		p.bakeMs = bake.ms;
		p.bvhBuilt = bvh.built;
		p.bvhMs = bvh.ms;
		p.geoBuilds = geo.builds;
		p.geoTicks = tick.ticks;
		recs.push(rec);
		if (recs.length > CAP) recs.shift();
		prevEnd.current = end;
	}, 3);

	return null;
}

function pct(sorted: number[], p: number): number {
	if (!sorted.length) return 0;
	const i = Math.min(
		sorted.length - 1,
		Math.floor((p / 100) * sorted.length),
	);
	return +sorted[i].toFixed(2);
}

function dist(values: number[]): {
	p50: number;
	p95: number;
	p99: number;
	max: number;
} {
	const s = [...values].sort((a, b) => a - b);
	return {
		p50: pct(s, 50),
		p95: pct(s, 95),
		p99: pct(s, 99),
		max: +Math.max(0, ...s).toFixed(2),
	};
}

// Frame total is hostage to vsync: a backgrounded or power-throttled window
// locks to 30Hz and every other frame carries a ~29ms gap that has nothing to
// do with this app. sim and render measure work we actually issue, so they stay
// comparable across machine states — this is the metric to track, not hot-frame
// counts.
function work(): unknown {
	const cpu = recs.map((r) => r.sim + r.render);
	return {
		frames: recs.length,
		sim: dist(recs.map((r) => r.sim)),
		render: dist(recs.map((r) => r.render)),
		cpu: dist(cpu),
		over16: cpu.filter((v) => v > 16.7).length,
	};
}

function spikes(thresholdMs: number): unknown[] {
	const out: unknown[] = [];
	for (let i = 0; i < recs.length; i++) {
		if (recs[i].total < thresholdMs) continue;
		out.push({ ctx: 'before', ...recs[i - 1] }, recs[i]);
	}
	return out;
}

if (import.meta.env?.DEV) {
	(window as unknown as Record<string, unknown>).__frames = {
		all: () => recs.slice(),
		spikes: (ms = 33) => spikes(ms),
		work: () => work(),
		reset: () => {
			recs.length = 0;
		},
		summary: (ms = 33) => {
			const hot = recs.filter((r) => r.total >= ms);
			const bucket = { outside: 0, sim: 0, render: 0 };
			for (const r of hot) {
				const worst = Math.max(r.outside, r.sim, r.render);
				if (worst === r.outside) bucket.outside++;
				else if (worst === r.sim) bucket.sim++;
				else bucket.render++;
			}
			return { frames: recs.length, hot: hot.length, blame: bucket };
		},
	};
}
