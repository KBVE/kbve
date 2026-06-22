/**
 * Drive the arpg-server JSON wire from Node. Opens a socket, sends a JoinMatch as
 * the first frame, and resolves the server's first reply (Welcome on success,
 * Reject on a refused join) or the close code if the socket dies first.
 *
 * Mirrors `joinFrame` in @kbve/laser protocol.ts — kept inline so the e2e package
 * stays dependency-free (Node 20+ ships a global WebSocket).
 */

import { PROTOCOL_VERSION, SERVER_WS } from './env';

export interface JoinResult {
	welcome?: { protocol: number; your_slot: number; seed: number };
	reject?: { reason: string };
	closeCode?: number;
}

export interface JoinOpts {
	jwt?: string;
	username?: string;
	protocol?: number;
	timeoutMs?: number;
}

export function joinMatch(opts: JoinOpts = {}): Promise<JoinResult> {
	const {
		jwt = '',
		username = 'e2e_player',
		protocol = PROTOCOL_VERSION,
		timeoutMs = 8000,
	} = opts;

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

		ws.onopen = () => {
			ws.send(
				JSON.stringify({
					JoinMatch: { protocol, jwt, kbve_username: username },
				}),
			);
		};

		ws.onmessage = (ev) => {
			let msg: unknown;
			try {
				msg = JSON.parse(String(ev.data));
			} catch {
				return;
			}
			const m = msg as Record<string, unknown>;
			if (m.Welcome) {
				done({
					welcome: m.Welcome as JoinResult['welcome'],
				});
			} else if (m.Reject) {
				done({ reject: m.Reject as JoinResult['reject'] });
			}
		};

		ws.onclose = (ev) => done({ closeCode: ev.code });
		ws.onerror = () => {
			/* close handler resolves */
		};
	});
}
