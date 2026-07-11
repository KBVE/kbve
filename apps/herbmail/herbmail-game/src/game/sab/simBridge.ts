import { hasSharedMemory, makeBuffer } from './isolation';
import {
	STATE_TICK,
	STATE_RUNNING,
	STATE_READY,
	STATE_BODY_COUNT,
	STATE_I32_SLOTS,
	XFORM_F32_LEN,
	PLAYER_F32_LEN,
} from './layout';

export interface SimStartOpts {
	count?: number;
	ox?: number;
	oz?: number;
}

export interface SectorColliders {
	key: string;
	tiles: Uint8Array;
	cols: number;
	rows: number;
	originCol: number;
	originRow: number;
}

// Owns the shared control + transform buffers and the sim worker. Main thread only
// ever reads transforms (zero-copy) for rendering; the worker is authoritative.
// Without cross-origin isolation there's no SharedArrayBuffer, so the physics sim
// is disabled (the rest of the game runs unchanged).
export class SimBridge {
	readonly state: Int32Array;
	readonly bodies: Float32Array;
	readonly player: Float32Array;
	readonly offThread: boolean;
	private worker: Worker | null = null;

	constructor() {
		this.state = new Int32Array(makeBuffer(STATE_I32_SLOTS * 4));
		this.bodies = new Float32Array(makeBuffer(XFORM_F32_LEN * 4));
		this.player = new Float32Array(makeBuffer(PLAYER_F32_LEN * 4));
		this.offThread = hasSharedMemory;
	}

	start(opts: SimStartOpts = {}): void {
		if (this.worker) return;
		if (!this.offThread) {
			console.warn(
				'[sab] not cross-origin isolated — physics worker disabled.',
			);
			return;
		}
		this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), {
			type: 'module',
		});
		this.worker.postMessage({
			type: 'init',
			control: this.state.buffer,
			xform: this.bodies.buffer,
			player: this.player.buffer,
			count: opts.count ?? 24,
			ox: opts.ox ?? 0,
			oz: opts.oz ?? 0,
		});
	}

	addSector(s: SectorColliders): void {
		this.worker?.postMessage({ type: 'addSector', ...s });
	}

	removeSector(key: string): void {
		this.worker?.postMessage({ type: 'removeSector', key });
	}

	shatter(x: number, y: number, z: number): void {
		this.worker?.postMessage({ type: 'shatter', x, y, z });
	}

	get tick(): number {
		return Atomics.load(this.state, STATE_TICK);
	}
	get ready(): boolean {
		return Atomics.load(this.state, STATE_READY) === 1;
	}
	get bodyCount(): number {
		return Atomics.load(this.state, STATE_BODY_COUNT);
	}

	stop(): void {
		Atomics.store(this.state, STATE_RUNNING, 0);
		if (this.worker) {
			this.worker.postMessage({ type: 'stop' });
			this.worker.terminate();
			this.worker = null;
		}
	}
}

let singleton: SimBridge | null = null;
export function getSimBridge(): SimBridge {
	if (!singleton) singleton = new SimBridge();
	return singleton;
}
