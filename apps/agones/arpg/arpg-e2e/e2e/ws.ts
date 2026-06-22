/**
 * Drive the arpg-server JSON wire from Node. Two helpers:
 *
 *   joinMatch()  — one-shot: send a JoinMatch, resolve the first reply (Welcome /
 *                  Reject) or the close code. For handshake assertions.
 *   GameSession  — a live socket: join, then collect Snapshots / send Inputs, for
 *                  sim-level assertions (movement, roster, spawned entities).
 *
 * Mirrors `joinFrame` / `inputFrame` in @kbve/laser protocol.ts — kept inline so
 * the e2e package stays dependency-free (Node 20+ ships a global WebSocket).
 */

import { PROTOCOL_VERSION, SERVER_WS } from './env';

export interface Welcome {
	protocol: number;
	your_slot: number;
	seed: number;
	registry: Array<{ kind: number; ref: string; cat: number }>;
}

export interface PlayerView {
	slot: number;
	kbve_username: string;
	connected: boolean;
}

export interface EntityDelta {
	eid: number;
	kind: number;
	owner: number;
	tile: { x: number; y: number };
	hp: number;
	max_hp: number;
	destroyed: boolean;
}

export interface Snapshot {
	tick: number;
	input_ack: number;
	players: PlayerView[];
	entities: EntityDelta[];
	keyframe: boolean;
}

export interface JoinResult {
	welcome?: Welcome;
	reject?: { reason: string };
	closeCode?: number;
}

export interface JoinOpts {
	jwt?: string;
	username?: string;
	protocol?: number;
	timeoutMs?: number;
}

export type Dir = 'Up' | 'Down' | 'Left' | 'Right';

function joinPayload(opts: JoinOpts): string {
	return JSON.stringify({
		JoinMatch: {
			protocol: opts.protocol ?? PROTOCOL_VERSION,
			jwt: opts.jwt ?? '',
			kbve_username: opts.username ?? 'e2e_player',
		},
	});
}

export function joinMatch(opts: JoinOpts = {}): Promise<JoinResult> {
	const timeoutMs = opts.timeoutMs ?? 8000;

	return new Promise<JoinResult>((resolve) => {
		const ws = new WebSocket(SERVER_WS);
		let settled = false;

		const done = (r: JoinResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			try {
				ws.close();
			} catch {
				/* already closing */
			}
			resolve(r);
		};

		const timer = setTimeout(
			() => done({ closeCode: undefined }),
			timeoutMs,
		);

		ws.onopen = () => ws.send(joinPayload(opts));
		ws.onmessage = (ev) => {
			const m = parse(ev.data);
			if (!m) return;
			if (m.Welcome) done({ welcome: m.Welcome as Welcome });
			else if (m.Reject) done({ reject: m.Reject as { reason: string } });
		};
		ws.onclose = (ev) => done({ closeCode: ev.code });
		ws.onerror = () => {
			/* close handler resolves */
		};
	});
}

function parse(data: unknown): Record<string, unknown> | null {
	try {
		return JSON.parse(String(data)) as Record<string, unknown>;
	} catch {
		return null;
	}
}

/**
 * A live game session: opens a socket, joins, and exposes the Welcome plus
 * helpers to send inputs and await snapshots. Callers MUST `close()` when done so
 * the server frees the roster slot (newest-wins eviction otherwise lingers).
 */
export class GameSession {
	private ws: WebSocket | null = null;
	private snapshots: Snapshot[] = [];
	private waiters: Array<(s: Snapshot) => void> = [];
	welcome: Welcome | null = null;
	reject: string | null = null;
	closeCode: number | null = null;

	static async open(opts: JoinOpts = {}): Promise<GameSession> {
		const s = new GameSession();
		await s.connect(opts);
		return s;
	}

	private connect(opts: JoinOpts): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const ws = new WebSocket(SERVER_WS);
			this.ws = ws;
			const timer = setTimeout(
				() => reject(new Error('join timeout')),
				opts.timeoutMs ?? 8000,
			);

			ws.onopen = () => ws.send(joinPayload(opts));
			ws.onmessage = (ev) => {
				const m = parse(ev.data);
				if (!m) return;
				if (m.Welcome && !this.welcome) {
					this.welcome = m.Welcome as Welcome;
					clearTimeout(timer);
					resolve();
				} else if (m.Reject) {
					this.reject = (m.Reject as { reason: string }).reason;
					clearTimeout(timer);
					reject(new Error(`join rejected: ${this.reject}`));
				} else if (m.Snapshot) {
					const snap = m.Snapshot as Snapshot;
					this.snapshots.push(snap);
					const w = this.waiters.shift();
					if (w) w(snap);
				}
			};
			ws.onclose = (ev) => {
				this.closeCode = ev.code;
			};
			ws.onerror = () => {
				/* close handler records */
			};
		});
	}

	private send(msg: unknown): void {
		this.ws?.send(JSON.stringify(msg));
	}

	step(dir: Dir, clientTick = 1): void {
		this.send({
			Frame: { client_tick: clientTick, inputs: [{ Step: { dir } }] },
		});
	}

	moveTo(x: number, y: number, clientTick = 1): void {
		this.send({
			Frame: {
				client_tick: clientTick,
				inputs: [{ MoveTo: { tile: { x, y } } }],
			},
		});
	}

	heartbeat(clientTick = 1): void {
		this.send({
			Frame: {
				client_tick: clientTick,
				inputs: [{ Heartbeat: { client_tick: clientTick } }],
			},
		});
	}

	/** Resolve on the next snapshot received after this call. */
	nextSnapshot(timeoutMs = 5000): Promise<Snapshot> {
		return new Promise<Snapshot>((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error('snapshot timeout')),
				timeoutMs,
			);
			this.waiters.push((s) => {
				clearTimeout(timer);
				resolve(s);
			});
		});
	}

	/** Await a snapshot whose predicate holds, or throw after a budget of frames. */
	async waitFor(
		pred: (s: Snapshot) => boolean,
		opts: { frames?: number; timeoutMs?: number } = {},
	): Promise<Snapshot> {
		const frames = opts.frames ?? 120;
		for (let i = 0; i < frames; i++) {
			const s = await this.nextSnapshot(opts.timeoutMs ?? 5000);
			if (pred(s)) return s;
		}
		throw new Error('predicate never held within frame budget');
	}

	close(): void {
		try {
			this.ws?.close();
		} catch {
			/* already closing */
		}
		this.ws = null;
	}
}
