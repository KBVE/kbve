import { roundSeries, summarize, type Series } from './stats';

export interface Spike {
	t: number;
	dt: number;
	attributed: Record<string, number>;
}

export interface FrameReport {
	frames: Series;
	spikes: Spike[];
	spikeCount: number;
}

// Frame clock plus a per-frame scratch ledger other collectors write into, so a
// stall can be split into "who spent this" instead of just "something did".
export class FrameLog {
	private readonly deltas: number[] = [];
	private readonly spikes: Spike[] = [];
	private ledger = new Map<string, number>();
	private last = 0;
	private t0 = 0;
	private raf = 0;
	private running = false;

	constructor(
		private readonly spikeMs = 50,
		private readonly maxSpikes = 200,
	) {}

	add(key: string, ms: number): void {
		if (!this.running) return;
		this.ledger.set(key, (this.ledger.get(key) ?? 0) + ms);
	}

	// Self-drives on rAF in a browser; where there is none (tests, workers) the
	// caller drives sample() directly and everything else behaves the same.
	start(now = performance.now()): void {
		if (this.running) return;
		this.running = true;
		this.t0 = now;
		this.last = now;
		if (typeof requestAnimationFrame !== 'function') return;
		const tick = () => {
			if (!this.running) return;
			this.sample();
			this.raf = requestAnimationFrame(tick);
		};
		this.raf = requestAnimationFrame(tick);
	}

	// Split out so tests can drive frames without a browser clock.
	sample(now = performance.now()): void {
		if (!this.running) return;
		const dt = now - this.last;
		this.last = now;
		this.deltas.push(dt);
		if (dt >= this.spikeMs && this.spikes.length < this.maxSpikes) {
			const attributed: Record<string, number> = {};
			for (const [k, v] of this.ledger) if (v > 0.5) attributed[k] = v;
			this.spikes.push({ t: now - this.t0, dt, attributed });
		}
		this.ledger = new Map();
	}

	stop(): void {
		this.running = false;
		if (this.raf && typeof cancelAnimationFrame === 'function')
			cancelAnimationFrame(this.raf);
		this.raf = 0;
	}

	get active(): boolean {
		return this.running;
	}

	report(): FrameReport {
		return {
			frames: roundSeries(summarize(this.deltas)),
			spikes: this.spikes
				.slice()
				.sort((a, b) => b.dt - a.dt)
				.slice(0, 20),
			spikeCount: this.spikes.length,
		};
	}

	reset(): void {
		this.deltas.length = 0;
		this.spikes.length = 0;
		this.ledger = new Map();
	}
}
