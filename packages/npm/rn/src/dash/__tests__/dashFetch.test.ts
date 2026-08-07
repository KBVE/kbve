import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dashFetch, dashJson, dashHttpError } from '../dashFetch';

describe('dashFetch', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	it('returns the response on success', async () => {
		const res = new Response('{}', { status: 200 });
		global.fetch = vi.fn().mockResolvedValue(res);
		await expect(
			dashFetch('/dashboard/storage/proxy/volumes'),
		).resolves.toBe(res);
	});

	it('wraps network errors with method, path, and error name', async () => {
		const boom = new Error('The string did not match the expected pattern.');
		boom.name = 'SyntaxError';
		global.fetch = vi.fn().mockRejectedValue(boom);
		await expect(
			dashFetch('https://kbve.com/dashboard/storage/proxy/volumes', {
				label: 'longhorn:volumes',
			}),
		).rejects.toThrow(
			'longhorn:volumes (GET /dashboard/storage/proxy/volumes) failed: SyntaxError: The string did not match the expected pattern.',
		);
		expect(console.error).toHaveBeenCalled();
	});

	it('lets AbortError pass through untouched', async () => {
		const abort = new Error('Aborted');
		abort.name = 'AbortError';
		global.fetch = vi.fn().mockRejectedValue(abort);
		await expect(dashFetch('/x')).rejects.toBe(abort);
	});
});

describe('dashJson', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	it('parses valid JSON', async () => {
		const res = new Response('{"data":[1]}', { status: 200 });
		await expect(dashJson<{ data: number[] }>(res)).resolves.toEqual({
			data: [1],
		});
	});

	it('adds context to parse failures', async () => {
		const res = new Response('<html>upstream 502</html>', { status: 200 });
		await expect(dashJson(res, 'longhorn:volumes')).rejects.toThrow(
			/longhorn:volumes returned invalid JSON: /,
		);
	});
});

describe('dashHttpError', () => {
	it('includes status, label, and hint', () => {
		const res = new Response('nope', { status: 403, statusText: 'Forbidden' });
		const err = dashHttpError(res, 'longhorn:volumes', 'Access restricted');
		expect(err.message).toBe(
			'longhorn:volumes → HTTP 403 Forbidden — Access restricted',
		);
	});

	it('works without label or hint', () => {
		const res = new Response('nope', { status: 502 });
		expect(dashHttpError(res).message).toContain('HTTP 502');
	});
});
