import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRconExec } from '../rconExec';

const token = async () => 'tok';

describe('createRconExec', () => {
	beforeEach(() => {
		global.fetch = vi.fn();
	});

	it('posts command to the exec endpoint with bearer token', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			text: async () =>
				JSON.stringify({ ok: true, output: 'done', latency_ms: 12 }),
		});
		const exec = createRconExec({ getToken: token, baseUrl: 'https://x' });
		const res = await exec('survival', { command: 'list', args: [] });
		expect(res).toEqual({ ok: true, output: 'done', latency_ms: 12 });
		const [url, init] = (global.fetch as any).mock.calls[0];
		expect(url).toBe('https://x/api/v1/rcon/mc/survival/exec');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toBe('Bearer tok');
		expect(JSON.parse(init.body)).toEqual({ command: 'list', args: [] });
	});

	it('missing token resolves as failed entry', async () => {
		const exec = createRconExec({ getToken: async () => null });
		const res = await exec('lobby', { command: 'list' });
		expect(res.ok).toBe(false);
		expect(res.error).toBe('Not signed in');
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('non-OK JSON error body surfaces its error', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 403,
			text: async () => JSON.stringify({ ok: false, output: '', latency_ms: 0, error: 'staff only' }),
		});
		const exec = createRconExec({ getToken: token });
		const res = await exec('survival', { command: 'ban', args: ['bob', 'grief'] });
		expect(res.ok).toBe(false);
		expect(res.error).toBe('staff only');
	});

	it('non-OK non-JSON body falls back to text then status', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 502,
			text: async () => 'bad gateway',
		});
		const exec = createRconExec({ getToken: token });
		expect((await exec('lobby', { command: 'list' })).error).toBe('bad gateway');

		(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 500,
			text: async () => '',
		});
		expect((await exec('lobby', { command: 'list' })).error).toBe('HTTP 500');
	});

	it('network throw resolves as failed entry', async () => {
		(global.fetch as any).mockRejectedValue(new Error('offline'));
		const exec = createRconExec({ getToken: token });
		const res = await exec('lobby', { command: 'list' });
		expect(res).toEqual({ ok: false, output: '', latency_ms: 0, error: 'offline' });
	});
});
