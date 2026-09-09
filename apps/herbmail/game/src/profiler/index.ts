import { FrameLog, type FrameReport } from './frames';
import { GlWatch, type GlCallStats } from './gl';
import { PoseWatch, type PoseReport, type PoseTarget } from './pose';

export interface ProfilerReport {
	ms: number;
	frames: FrameReport;
	gl: GlCallStats[];
	pose: PoseReport[];
}

export interface StartOptions {
	gl?: boolean;
	spikeMs?: number;
}

interface SceneLike {
	traverse(cb: (o: { name?: string; quaternion?: unknown }) => void): void;
}

// Not gated behind import.meta.env.DEV on purpose. Every rendering bug worth
// chasing in this game so far only reproduced in a packed production build —
// constant animation tracks folded by gltfpack, meshopt decode differences —
// so a profiler that vanishes in prod is a profiler that cannot see them.
// Nothing here runs until start() is called, so shipping it costs a few kB.
class Profiler {
	private frameLog = new FrameLog();
	private glWatch = new GlWatch((k, ms) => this.frameLog.add(k, ms));
	private poseWatch = new PoseWatch();
	private startedAt = 0;
	private poseRaf = 0;

	start(opts: StartOptions = {}): string {
		if (this.frameLog.active) return 'already running';
		this.frameLog = new FrameLog(opts.spikeMs ?? 50);
		this.glWatch = new GlWatch((k, ms) => this.frameLog.add(k, ms));
		this.startedAt = performance.now();
		this.frameLog.start();
		if (opts.gl !== false) this.glWatch.start();
		return 'profiler started';
	}

	stop(): ProfilerReport {
		const out = this.report();
		this.frameLog.stop();
		this.glWatch.stop();
		if (this.poseRaf) cancelAnimationFrame(this.poseRaf);
		this.poseRaf = 0;
		return out;
	}

	report(): ProfilerReport {
		return {
			ms: Math.round(performance.now() - this.startedAt),
			frames: this.frameLog.report(),
			gl: this.glWatch.report(),
			pose: this.poseWatch.report(),
		};
	}

	reset(): void {
		this.frameLog.reset();
		this.glWatch.reset();
		this.poseWatch.reset();
		this.startedAt = performance.now();
	}

	// Bone names repeat across every rig in the scene, so `near` picks the
	// instance closest to a point (the player body, an NPC) instead of whichever
	// one traverse happens to reach first — the difference between measuring the
	// thing you meant and measuring a different character entirely.
	watchPose(
		names: string[],
		opts: {
			scene?: SceneLike;
			near?: { x: number; y: number; z: number };
		} = {},
	): string {
		const scene =
			opts.scene ??
			((globalThis as Record<string, unknown>).__vm as
				| SceneLike
				| undefined);
		const root =
			(scene as { scene?: SceneLike } | undefined)?.scene ?? scene;
		if (!root?.traverse)
			return 'no scene: pass { scene } or expose window.__vm';

		const found = new Map<string, PoseTarget[]>();
		root.traverse((o) => {
			const name = o.name;
			if (!name || !names.includes(name) || !o.quaternion) return;
			const list = found.get(name) ?? [];
			list.push(o as PoseTarget);
			found.set(name, list);
		});

		const targets: PoseTarget[] = [];
		for (const [name, list] of found) {
			let pick = list[0];
			if (opts.near && list.length > 1) {
				let best = Infinity;
				for (const o of list) {
					const m = (o as { matrixWorld?: { elements: number[] } })
						.matrixWorld;
					if (!m) continue;
					const d = Math.hypot(
						m.elements[12] - opts.near.x,
						m.elements[13] - opts.near.y,
						m.elements[14] - opts.near.z,
					);
					if (d < best) {
						best = d;
						pick = o;
					}
				}
			}
			targets.push({ name, quaternion: pick.quaternion });
		}

		this.poseWatch = new PoseWatch();
		this.poseWatch.track(targets);
		const tick = () => {
			this.poseWatch.sample();
			this.poseRaf = requestAnimationFrame(tick);
		};
		if (!this.poseRaf) this.poseRaf = requestAnimationFrame(tick);
		return `tracking ${targets.length}/${names.length} of ${[...found.values()].reduce((a, b) => a + b.length, 0)} matches`;
	}
}

export const profiler = new Profiler();

export function installProfiler(): void {
	(globalThis as Record<string, unknown>).__profiler = profiler;
}
