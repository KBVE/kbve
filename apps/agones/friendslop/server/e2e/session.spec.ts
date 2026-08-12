import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

const host = process.env.FS_HOST ?? '127.0.0.1';
const port = process.env.FS_PORT ?? '7980';

function stats(): { tick: number; peers: number } {
	return JSON.parse(
		execSync(`curl -fsS http://${host}:${port}/stats`, {
			encoding: 'utf8',
		}).trim(),
	);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForPeers(want: number, timeoutMs = 10_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (stats().peers === want) return;
		await sleep(100);
	}
	expect(stats().peers).toBe(want);
}

// The protocol itself is postcard-encoded and covered by the Rust integration
// tests; this only asserts the socket lifecycle the container is responsible
// for — accept, register, and release on close.
describe('friendslop-server session lifecycle', () => {
	it('registers a peer on connect and releases it on close', async () => {
		expect(stats().peers).toBe(0);

		const ws = new WebSocket(`ws://${host}:${port}/ws`);
		await new Promise<void>((resolve, reject) => {
			ws.onopen = () => resolve();
			ws.onerror = () => reject(new Error('ws connect failed'));
		});

		await waitForPeers(1);
		ws.close();
		await waitForPeers(0);
	});

	it('accepts several peers at once', async () => {
		const sockets = await Promise.all(
			[0, 1, 2].map(
				() =>
					new Promise<WebSocket>((resolve, reject) => {
						const s = new WebSocket(`ws://${host}:${port}/ws`);
						s.onopen = () => resolve(s);
						s.onerror = () =>
							reject(new Error('ws connect failed'));
					}),
			),
		);

		await waitForPeers(3);
		sockets.forEach((s) => s.close());
		await waitForPeers(0);
	});
});
