export interface InterpSample {
	t: number;
	x: number;
	y: number;
}

export interface InterpBuffer {
	buf: InterpSample[];
}

export const INTERP_DELAY_MS = 200;
const BUF_MAX = 6;

export function newInterp(t: number, x: number, y: number): InterpBuffer {
	return { buf: [{ t, x, y }] };
}

export function pushSample(b: InterpBuffer, t: number, x: number, y: number) {
	const last = b.buf[b.buf.length - 1];
	if (last && last.x === x && last.y === y) return;
	b.buf.push({ t, x, y });
	if (b.buf.length > BUF_MAX) b.buf.shift();
}

export function resetInterp(b: InterpBuffer, t: number, x: number, y: number) {
	b.buf.length = 0;
	b.buf.push({ t, x, y });
}

function catmull(
	p0: number,
	p1: number,
	p2: number,
	p3: number,
	t: number,
): number {
	const t2 = t * t;
	const t3 = t2 * t;
	return (
		0.5 *
		(2 * p1 +
			(-p0 + p2) * t +
			(2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
			(-p0 + 3 * p1 - 3 * p2 + p3) * t3)
	);
}

export interface InterpResult {
	x: number;
	y: number;
	vx: number;
	vy: number;
	moving: boolean;
}

export function sampleAt(
	b: InterpBuffer,
	renderTime: number,
): InterpResult | null {
	const buf = b.buf;
	const n = buf.length;
	if (n === 0) return null;
	const last = buf[n - 1];
	if (n === 1 || renderTime >= last.t) {
		return { x: last.x, y: last.y, vx: 0, vy: 0, moving: false };
	}
	if (renderTime <= buf[0].t) {
		return { x: buf[0].x, y: buf[0].y, vx: 0, vy: 0, moving: true };
	}
	let i = 0;
	while (i < n - 1 && buf[i + 1].t < renderTime) i++;
	const p1 = buf[i];
	const p2 = buf[i + 1];
	const p0 = buf[i - 1] ?? p1;
	const p3 = buf[i + 2] ?? p2;
	const span = p2.t - p1.t || 1;
	const tt = Math.min(1, Math.max(0, (renderTime - p1.t) / span));
	const x = catmull(p0.x, p1.x, p2.x, p3.x, tt);
	const y = catmull(p0.y, p1.y, p2.y, p3.y, tt);
	const e = Math.min(1, tt + 0.06);
	const xe = catmull(p0.x, p1.x, p2.x, p3.x, e);
	const ye = catmull(p0.y, p1.y, p2.y, p3.y, e);
	return { x, y, vx: xe - x, vy: ye - y, moving: true };
}
