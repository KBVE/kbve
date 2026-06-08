import { LaserEventBus } from '../core/events';
import {
	type ClientMessage,
	type Dir,
	type Facing,
	type Input,
	type ServerEvent,
	type Snapshot,
	type Welcome,
	inputFrame,
	joinFrame,
} from './protocol';

export type GameClientEventMap = {
	open: void;
	welcome: Welcome;
	snapshot: Snapshot;
	reject: string;
	close: void;
	error: string;
};

export interface GameClientOptions {
	url: string;
	jwt: string;
	kbveUsername: string;
}

export class GameClient {
	private ws: WebSocket | null = null;
	private clientTick = 0;
	private readonly bus = new LaserEventBus<GameClientEventMap>();
	private readonly opts: GameClientOptions;

	constructor(opts: GameClientOptions) {
		this.opts = opts;
	}

	on<K extends keyof GameClientEventMap>(
		event: K,
		handler: (data: GameClientEventMap[K]) => void,
	): () => void {
		return this.bus.on(event, handler);
	}

	connect(): void {
		if (this.ws) return;
		const ws = new WebSocket(this.opts.url);
		this.ws = ws;

		ws.addEventListener('open', () => {
			this.send(joinFrame(this.opts.jwt, this.opts.kbveUsername));
			this.bus.emit('open', undefined);
		});
		ws.addEventListener('message', (ev: MessageEvent) => {
			let msg: ServerEvent;
			try {
				msg = JSON.parse(
					typeof ev.data === 'string' ? ev.data : String(ev.data),
				);
			} catch {
				return;
			}
			if ('Welcome' in msg) this.bus.emit('welcome', msg.Welcome);
			else if ('Snapshot' in msg) this.bus.emit('snapshot', msg.Snapshot);
			else if ('Reject' in msg)
				this.bus.emit('reject', msg.Reject.reason);
		});
		ws.addEventListener('error', () =>
			this.bus.emit('error', 'socket error'),
		);
		ws.addEventListener('close', () => {
			this.ws = null;
			this.bus.emit('close', undefined);
		});
	}

	private send(msg: ClientMessage): void {
		this.ws?.send(JSON.stringify(msg));
	}

	sendInputs(inputs: Input[]): void {
		if (
			!this.ws ||
			this.ws.readyState !== WebSocket.OPEN ||
			inputs.length === 0
		)
			return;
		this.clientTick += 1;
		this.send(inputFrame(this.clientTick, inputs));
	}

	step(dir: Dir): void {
		this.sendInputs([{ Step: { dir } }]);
	}

	face(facing: Facing): void {
		this.sendInputs([{ Face: { facing } }]);
	}

	close(): void {
		if (!this.ws) return;
		this.sendInputs(['Leave']);
		this.ws.close();
		this.ws = null;
	}
}
