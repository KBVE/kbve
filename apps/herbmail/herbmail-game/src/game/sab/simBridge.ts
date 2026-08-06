import { hasSharedMemory, makeBuffer } from './isolation';
import {
	gameWorldBytes,
	instanceBytes,
	createGameWorld,
	createInstanceView,
	type GameWorld,
	type InstanceView,
} from '../mecs/schema';
import { getPropsBuffer } from '../mecs/props';
import { inputLag, PC, PLAYER_SLOTS, poseDrift } from './playerChannel';

export interface SimStartOpts {
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

// Owns the shared mecs world + instance + player buffers and the sim worker. The
// worker is the authoritative structural writer; the main thread attaches a reader
// view over the SAME buffers (zero-copy) for rendering + queries. Without
// cross-origin isolation there's no SharedArrayBuffer, so the physics worker is
// disabled and the rest of the game runs unchanged.
export class SimBridge {
	readonly world: GameWorld;
	readonly instance: InstanceView;
	readonly player: Float32Array;
	readonly offThread: boolean;
	private ecsBuf: ArrayBufferLike;
	private instBuf: ArrayBufferLike;
	private worker: Worker | null = null;

	constructor() {
		this.ecsBuf = makeBuffer(gameWorldBytes());
		this.instBuf = makeBuffer(instanceBytes());
		this.player = new Float32Array(makeBuffer(PLAYER_SLOTS * 4));
		this.world = createGameWorld(this.ecsBuf);
		this.instance = createInstanceView(this.instBuf);
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
			ecs: this.ecsBuf,
			inst: this.instBuf,
			player: this.player.buffer,
			props: getPropsBuffer(),
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
		return this.world.tick();
	}

	/** How far the authoritative simulation has drifted from the main thread's
	 * own result, and how many inputs behind it is. */
	get drift(): { meters: number; lag: number } {
		return { meters: poseDrift(this.player), lag: inputLag(this.player) };
	}

	stop(): void {
		if (this.worker) {
			this.worker.postMessage({ type: 'stop' });
			this.worker.terminate();
			this.worker = null;
		}
	}
}

if (import.meta.env?.DEV && typeof window !== 'undefined') {
	(window as unknown as Record<string, unknown>).__drift = () => {
		const c = getSimBridge().player;
		const r = (n: number) => +n.toFixed(2);
		return {
			...getSimBridge().drift,
			auth: [r(c[PC.POSE_X]), r(c[PC.POSE_Y]), r(c[PC.POSE_Z])],
			local: [r(c[PC.LOCAL_X]), r(c[PC.LOCAL_Y]), r(c[PC.LOCAL_Z])],
			intent: [r(c[PC.INTENT_X]), r(c[PC.INTENT_Z])],
		};
	};
}

let singleton: SimBridge | null = null;
export function getSimBridge(): SimBridge {
	if (!singleton) singleton = new SimBridge();
	return singleton;
}
