import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { createSocket } from 'dgram';
import { dockerRunning } from './helpers/docker';

const host = process.env.FS_HOST ?? '127.0.0.1';
const port = process.env.FS_PORT ?? '7980';

const base = `http://${host}:${port}`;

function get(path: string): string {
	return execSync(`curl -fsS ${base}${path}`, { encoding: 'utf8' }).trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('friendslop-server boot smoke', () => {
	it('container is still running', () => {
		expect(dockerRunning()).toBe(true);
	});

	it('healthz returns ok', () => {
		expect(JSON.parse(get('/healthz')).status).toBe('ok');
	});

	// The only path a deployed host exposes besides the socket, so it is the only
	// place a client can find out whether it is allowed to join before it tries.
	it('healthz publishes the protocol it will accept', () => {
		const protocol = JSON.parse(get('/healthz')).protocol;
		expect(Number.isInteger(protocol)).toBe(true);
		expect(protocol).toBeGreaterThan(0);
	});

	// The sim runs on its own thread; a served /healthz proves only that axum
	// is alive, so the tick counter is what actually rules out a wedged sim.
	it('the sim thread is advancing', async () => {
		const before = JSON.parse(get('/stats')).tick;
		await sleep(1000);
		const after = JSON.parse(get('/stats')).tick;
		expect(after).toBeGreaterThan(before);
	});

	it('the datagram lane is bound', () => {
		const stats = JSON.parse(get('/stats'));
		expect(stats.udp_port).toBe(7981);
		expect(stats.udp_bound).toBe(0);
		expect(stats.udp_oversize).toBe(0);
	});

	// The protocol needs postcard framing, which is covered by the Rust tests.
	// What is only testable here is that the published UDP port actually
	// reaches the recv loop and that garbage on it does not take the server
	// down — an unauthenticated port is reachable by anyone.
	it('survives unauthenticated garbage on the udp port', async () => {
		const socket = createSocket('udp4');
		await new Promise<void>((resolve, reject) => {
			socket.send(
				Buffer.from([0xde, 0xad, 0xbe, 0xef]),
				7981,
				host,
				(err) => (err ? reject(err) : resolve()),
			);
		});
		socket.close();

		await sleep(500);
		expect(dockerRunning()).toBe(true);
		const stats = JSON.parse(get('/stats'));
		expect(stats.udp_bound).toBe(0);
		expect(stats.tick).toBeGreaterThan(0);
	});
});
