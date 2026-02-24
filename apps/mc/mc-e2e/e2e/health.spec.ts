import { describe, it, expect } from 'vitest';
import * as net from 'node:net';

const MC_HOST = process.env['MC_HOST'] ?? '127.0.0.1';
const MC_PORT = Number(process.env['MC_PORT'] ?? 25565);

function waitForPort(
	host: string,
	port: number,
	timeoutMs = 20_000,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const deadline = Date.now() + timeoutMs;

		function attempt() {
			const socket = net.createConnection({ host, port }, () => {
				socket.destroy();
				resolve();
			});
			socket.on('error', () => {
				socket.destroy();
				if (Date.now() > deadline) {
					reject(
						new Error(
							`Timed out waiting for ${host}:${port} after ${timeoutMs}ms`,
						),
					);
				} else {
					setTimeout(attempt, 500);
				}
			});
		}

		attempt();
	});
}

describe('MC Server Health', () => {
	it('should accept TCP connections on port 25565', async () => {
		await waitForPort(MC_HOST, MC_PORT);

		const connected = await new Promise<boolean>((resolve) => {
			const socket = net.createConnection(
				{ host: MC_HOST, port: MC_PORT },
				() => {
					socket.destroy();
					resolve(true);
				},
			);
			socket.on('error', () => {
				socket.destroy();
				resolve(false);
			});
		});

		expect(connected).toBe(true);
	});
});
