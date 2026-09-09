import { describe, it, expect } from 'vitest';
import { outliers, summarize } from './stats';
import { FrameLog } from './frames';
import { PoseWatch, angleBetween, type Quat } from './pose';

const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

function spin(deg: number): Quat {
	const h = (deg * Math.PI) / 180 / 2;
	return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
}

describe('summarize', () => {
	it('is empty-safe', () => {
		expect(summarize([])).toEqual({
			n: 0,
			median: 0,
			p99: 0,
			max: 0,
			total: 0,
		});
	});

	it('reports order statistics regardless of input order', () => {
		const s = summarize([5, 1, 3, 2, 4]);
		expect(s.median).toBe(3);
		expect(s.max).toBe(5);
		expect(s.total).toBe(15);
	});

	it('keeps p99 inside the array for short samples', () => {
		expect(summarize([1, 2]).p99).toBe(2);
	});
});

describe('outliers', () => {
	it('finds the stall in an otherwise steady run', () => {
		const frames = [...Array(50).fill(16), 300];
		expect(outliers(frames)).toEqual([300]);
	});

	it('honours an absolute floor so a fast run does not flag noise', () => {
		const frames = [...Array(50).fill(0.1), 2];
		expect(outliers(frames, 8)).toEqual([2]);
		expect(outliers(frames, 8, 50)).toEqual([]);
	});
});

describe('angleBetween', () => {
	it('is zero for the same rotation', () => {
		expect(angleBetween(IDENTITY, IDENTITY)).toBeCloseTo(0, 6);
	});

	it('measures the shortest arc', () => {
		expect(angleBetween(IDENTITY, spin(90))).toBeCloseTo(90, 4);
	});

	it('ignores quaternion double cover', () => {
		const q = spin(90);
		const flipped: Quat = { x: -q.x, y: -q.y, z: -q.z, w: -q.w };
		expect(angleBetween(IDENTITY, flipped)).toBeCloseTo(90, 4);
	});
});

describe('PoseWatch', () => {
	it('reads a bone driven every frame as a small steady median', () => {
		const bone = { name: 'spine_01', quaternion: { ...IDENTITY } };
		const w = new PoseWatch();
		w.track([bone]);
		for (let i = 0; i < 10; i++) {
			Object.assign(bone.quaternion, spin(i % 2 ? 0.5 : 0));
			w.sample();
		}
		const [r] = w.report();
		expect(r.name).toBe('spine_01');
		expect(r.degrees.max).toBeLessThan(1);
		expect(r.jumps).toBe(0);
	});

	// The goblin bug: a procedural pass premultiplying onto a bone the mixer had
	// stopped writing produced the same delta every single frame.
	it('exposes a compounding pass as a constant per-frame delta', () => {
		const bone = { name: 'spine_01', quaternion: { ...IDENTITY } };
		const w = new PoseWatch();
		w.track([bone]);
		for (let i = 1; i <= 20; i++) {
			Object.assign(bone.quaternion, spin(i * 3.4));
			w.sample();
		}
		const [r] = w.report();
		expect(r.degrees.median).toBeCloseTo(3.4, 1);
		expect(r.degrees.p99).toBeCloseTo(3.4, 1);
	});

	it('reports nothing for a bone it never sampled twice', () => {
		const w = new PoseWatch();
		w.track([{ name: 'head', quaternion: { ...IDENTITY } }]);
		w.sample();
		expect(w.report()[0].degrees.n).toBe(0);
	});
});

describe('FrameLog', () => {
	it('flags only frames past the spike threshold and attributes them', () => {
		const log = new FrameLog(50);
		log.start(0);
		log.sample(16);
		log.add('gl.linkProgram', 120);
		log.sample(150);
		log.sample(166);
		log.stop();

		const r = log.report();
		expect(r.frames.n).toBe(3);
		expect(r.spikeCount).toBe(1);
		expect(r.spikes[0].dt).toBe(134);
		expect(r.spikes[0].attributed['gl.linkProgram']).toBe(120);
	});

	it('clears the ledger between frames so cost lands on one spike only', () => {
		const log = new FrameLog(50);
		log.start(0);
		log.add('gl.texImage2D', 90);
		log.sample(100);
		log.sample(200);
		log.stop();

		const r = log.report();
		expect(r.spikeCount).toBe(2);
		const [first, second] = r.spikes.sort((a, b) => a.t - b.t);
		expect(first.attributed['gl.texImage2D']).toBe(90);
		expect(second.attributed).toEqual({});
	});

	it('ignores samples once stopped', () => {
		const log = new FrameLog(50);
		log.start(0);
		log.sample(16);
		log.stop();
		log.sample(500);
		expect(log.report().frames.n).toBe(1);
	});
});
