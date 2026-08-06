// CPU-side frame timings say nothing about what the GPU is doing: at 60Hz vsync
// a frame that submits in 5ms and a frame that submits in 5ms but takes 15ms on
// the GPU look identical from rAF. EXT_disjoint_timer_query_webgl2 measures the
// GPU time for the commands issued between begin() and end(), which is the only
// way to know whether there is real headroom left or the GPU is the ceiling.
//
// Results are not available the frame they are issued, so queries are pooled and
// polled a few frames later. A disjoint (GPU context switch, power state change)
// invalidates everything in flight, so those samples are dropped rather than
// reported as fast.

const MAX_IN_FLIGHT = 8;

interface Ext {
	TIME_ELAPSED_EXT: number;
	GPU_DISJOINT_EXT: number;
}

let gl: WebGL2RenderingContext | null = null;
let ext: Ext | null = null;
let active: WebGLQuery | null = null;
const inFlight: WebGLQuery[] = [];
const free: WebGLQuery[] = [];
const samples: number[] = [];
let disjoints = 0;

export function initGpuTimer(context: WebGL2RenderingContext): boolean {
	if (ext) return true;
	const e = context.getExtension('EXT_disjoint_timer_query_webgl2') as
		| (Ext | null)
		| null;
	if (!e) return false;
	gl = context;
	ext = e;
	return true;
}

export function gpuTimerAvailable(): boolean {
	return ext !== null;
}

export function beginGpuFrame(): void {
	if (!gl || !ext || active) return;
	if (inFlight.length >= MAX_IN_FLIGHT) return;
	const q = free.pop() ?? gl.createQuery();
	if (!q) return;
	gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
	active = q;
}

export function endGpuFrame(): void {
	if (!gl || !ext || !active) return;
	gl.endQuery(ext.TIME_ELAPSED_EXT);
	inFlight.push(active);
	active = null;
	poll();
}

function poll(): void {
	if (!gl || !ext) return;
	// A disjoint means every timing currently in flight is untrustworthy.
	if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
		disjoints++;
		for (const q of inFlight) free.push(q);
		inFlight.length = 0;
		return;
	}
	while (inFlight.length) {
		const q = inFlight[0];
		if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return;
		inFlight.shift();
		samples.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
		free.push(q);
	}
}

export function gpuSamples(): number[] {
	return samples;
}

export function resetGpuSamples(): void {
	samples.length = 0;
	disjoints = 0;
}

export function gpuDisjoints(): number {
	return disjoints;
}
