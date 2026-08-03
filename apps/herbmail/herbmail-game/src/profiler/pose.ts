import { roundSeries, summarize, type Series } from './stats';

export interface Quat {
	x: number;
	y: number;
	z: number;
	w: number;
}

export interface PoseTarget {
	name: string;
	quaternion: Quat;
}

export interface PoseReport {
	name: string;
	degrees: Series;
	jumps: number;
}

export function angleBetween(a: Quat, b: Quat): number {
	const dot = Math.min(
		1,
		Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w),
	);
	return (2 * Math.acos(dot) * 180) / Math.PI;
}

// Per-frame LOCAL rotation delta per bone. World-space motion is useless for
// animation bugs on anything that moves under its own power — a wandering NPC
// swamps the pose signal — whereas local rotation is the pose and nothing else.
// A track that drives a bone every frame reads as a small steady median; a
// constant per-frame delta means something is compounding onto the bone
// instead of riding on top of the clip.
export class PoseWatch {
	private readonly prev = new Map<string, Quat>();
	private readonly deltas = new Map<string, number[]>();
	private targets: PoseTarget[] = [];

	constructor(private readonly jumpDeg = 20) {}

	track(targets: PoseTarget[]): void {
		this.targets = targets;
		for (const t of targets)
			if (!this.deltas.has(t.name)) this.deltas.set(t.name, []);
	}

	sample(): void {
		for (const t of this.targets) {
			const q = t.quaternion;
			const p = this.prev.get(t.name);
			if (p) this.deltas.get(t.name)?.push(angleBetween(p, q));
			this.prev.set(t.name, { x: q.x, y: q.y, z: q.z, w: q.w });
		}
	}

	report(): PoseReport[] {
		return [...this.deltas].map(([name, v]) => ({
			name,
			degrees: roundSeries(summarize(v)),
			jumps: v.filter((d) => d > this.jumpDeg).length,
		}));
	}

	reset(): void {
		this.prev.clear();
		for (const v of this.deltas.values()) v.length = 0;
	}
}
