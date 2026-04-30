import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createSiteGraphWorker,
	setSiteGraphWorker,
	getSiteGraphWorkerPort,
	clearSiteGraphWorker,
	fetchViaWorker,
} from './worker-client';

describe('worker-client', () => {
	beforeEach(() => {
		clearSiteGraphWorker();
		setSiteGraphWorker(null);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		clearSiteGraphWorker();
	});

	it('returns null from fetchViaWorker when no port is registered', () => {
		expect(fetchViaWorker('/api/sitegraph.json')).toBeNull();
	});

	it('createSiteGraphWorker returns null when SharedWorker is unavailable', () => {
		const original = (globalThis as any).SharedWorker;
		// @ts-expect-error — temporarily strip SharedWorker
		delete (globalThis as any).SharedWorker;
		expect(createSiteGraphWorker()).toBeNull();
		(globalThis as any).SharedWorker = original;
	});

	it('round-trips a request through a registered MessagePort', async () => {
		const channel = new MessageChannel();
		setSiteGraphWorker(channel.port1);

		channel.port2.onmessage = (e) => {
			const { type, requestId, endpoint } = e.data ?? {};
			if (type !== 'get') return;
			channel.port2.postMessage({
				type: 'data',
				requestId,
				data: { mockedFor: endpoint },
			});
		};
		channel.port2.start();

		const result = await fetchViaWorker('/api/sitegraph.json');
		expect(result).toEqual({ mockedFor: '/api/sitegraph.json' });

		channel.port1.close();
		channel.port2.close();
	});

	it('rejects when the worker reports an error message', async () => {
		const channel = new MessageChannel();
		setSiteGraphWorker(channel.port1);

		channel.port2.onmessage = (e) => {
			const { requestId } = e.data ?? {};
			channel.port2.postMessage({
				type: 'error',
				requestId,
				message: 'boom',
			});
		};
		channel.port2.start();

		await expect(fetchViaWorker('/api/sitegraph.json')).rejects.toThrow(
			'boom',
		);

		channel.port1.close();
		channel.port2.close();
	});

	it('setSiteGraphWorker(null) disconnects', () => {
		const channel = new MessageChannel();
		setSiteGraphWorker(channel.port1);
		expect(getSiteGraphWorkerPort()).toBe(channel.port1);
		setSiteGraphWorker(null);
		expect(getSiteGraphWorkerPort()).toBeNull();
		channel.port1.close();
		channel.port2.close();
	});
});
