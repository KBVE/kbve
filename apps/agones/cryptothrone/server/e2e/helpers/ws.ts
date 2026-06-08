export function wsUrl(): string {
	const host = process.env.CT_HOST ?? '127.0.0.1';
	const port = process.env.CT_PORT ?? '7979';
	return `ws://${host}:${port}/ws`;
}

export interface JoinResult {
	welcome: { protocol: number; your_slot: number; seed: number };
	snapshot: {
		tick: number;
		entities: Array<{
			kind: number;
			owner: number;
			tile: { x: number; y: number };
		}>;
	};
}

export function joinAndAwaitSnapshot(timeoutMs = 15_000): Promise<JoinResult> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(wsUrl());
		let welcome: JoinResult['welcome'] | null = null;
		const timer = setTimeout(() => {
			ws.close();
			reject(new Error('timed out waiting for welcome + snapshot'));
		}, timeoutMs);

		ws.addEventListener('open', () => {
			ws.send(
				JSON.stringify({
					JoinMatch: { protocol: 1, jwt: '', kbve_username: 'e2e' },
				}),
			);
		});
		ws.addEventListener('message', (ev: MessageEvent) => {
			let msg: Record<string, any>;
			try {
				msg = JSON.parse(
					typeof ev.data === 'string' ? ev.data : String(ev.data),
				);
			} catch {
				return;
			}
			if (msg.Welcome) {
				welcome = msg.Welcome;
			} else if (msg.Snapshot && welcome) {
				clearTimeout(timer);
				ws.close();
				resolve({ welcome, snapshot: msg.Snapshot });
			} else if (msg.Reject) {
				clearTimeout(timer);
				ws.close();
				reject(new Error(`join rejected: ${msg.Reject.reason}`));
			}
		});
		ws.addEventListener('error', () => {
			clearTimeout(timer);
			reject(new Error('websocket error'));
		});
	});
}
