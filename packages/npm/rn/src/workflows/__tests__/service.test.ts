import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invokeNode, listWindmillScripts } from '../workflowsService';

const cfg = { baseUrl: '', getToken: async () => 'tok' };

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('workflowsService', () => {
	it('invokes an edge function via the edge proxy', async () => {
		const spy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
		const r = await invokeNode('edge', 'health', cfg);
		expect(r.ok).toBe(true);
		expect(spy.mock.calls[0][0]).toBe('/dashboard/edge/proxy/health');
	});

	it('invokes a firecracker job via the firecracker proxy', async () => {
		const spy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response('ok', { status: 200 }));
		const r = await invokeNode('firecracker', 'build', cfg);
		expect(r.ok).toBe(true);
		expect(spy.mock.calls[0][0]).toBe('/dashboard/firecracker/proxy/build');
	});

	it('runs a windmill script then polls for the result', async () => {
		const spy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(new Response('job-123', { status: 200 }))
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({ completed: true, result: { done: 1 } }),
					{ status: 200 },
				),
			);
		const r = await invokeNode('windmill', 'u/me/f', cfg);
		expect(r.ok).toBe(true);
		expect(spy.mock.calls[0][0]).toBe(
			'/dashboard/workflows/proxy/api/w/kbve/jobs/run/p/u/me/f',
		);
		expect(spy.mock.calls[1][0]).toBe(
			'/dashboard/workflows/proxy/api/w/kbve/jobs_u/completed/get_result_maybe/job-123',
		);
	});

	it('lists windmill scripts as paths', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify([{ path: 'u/a/one' }, { path: 'u/b/two' }]),
				{ status: 200 },
			),
		);
		const paths = await listWindmillScripts(cfg);
		expect(paths).toEqual(['u/a/one', 'u/b/two']);
	});
});
