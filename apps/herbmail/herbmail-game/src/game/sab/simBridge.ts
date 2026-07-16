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

const PLAYER_F32_LEN = 4;

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
		this.player = new Float32Array(makeBuffer(PLAYER_F32_LEN * 4));
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

	stop(): void {
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
