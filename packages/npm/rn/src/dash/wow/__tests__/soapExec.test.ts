import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSoapExec } from '../soapExec';

const token = async () => 'tok';

describe('createSoapExec', () => {
	beforeEach(() => {
		global.fetch = vi.fn();
	});

	it('posts to the wow soap exec endpoint with bearer token', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			text: async () =>
				JSON.stringify({ ok: true, output: 'AC rev', latency_ms: 9 }),
		});
		const exec = createSoapExec({ getToken: token, baseUrl: 'https://x' });
		const res = await exec('Azeroth', { command: 'server_info', args: [] });
		expect(res).toEqual({ ok: true, output: 'AC rev', latency_ms: 9 });
		const [url, init] = (global.fetch as any).mock.calls[0];
		expect(url).toBe('https://x/api/v1/wow/soap/Azeroth/exec');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toBe('Bearer tok');
		expect(JSON.parse(init.body)).toEqual({
			command: 'server_info',
			args: [],
		});
	});

	it('missing token resolves as a failed entry', async () => {
		const exec = createSoapExec({ getToken: async () => null });
		const res = await exec('Azeroth', { command: 'gm_list' });
		expect(res).toEqual({
			ok: false,
			output: '',
			latency_ms: 0,
			error: 'Not signed in',
		});
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('a throwing token provider fails instead of rejecting', async () => {
		const exec = createSoapExec({
			getToken: async () => {
				throw new Error('nope');
			},
		});
		expect((await exec('Azeroth', { command: 'gm_list' })).error).toBe(
			'Not signed in',
		);
	});

	it('non-OK JSON error body surfaces its error', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 403,
			text: async () =>
				JSON.stringify({
					ok: false,
					output: '',
					latency_ms: 0,
					error: 'staff only',
				}),
		});
		const exec = createSoapExec({ getToken: token });
		const res = await exec('Azeroth', {
			command: 'server_shutdown',
			args: ['60'],
		});
		expect(res.ok).toBe(false);
		expect(res.error).toBe('staff only');
	});

	it('non-OK non-JSON body falls back to text then status', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 502,
			text: async () => 'bad gateway',
		});
		const exec = createSoapExec({ getToken: token });
		expect((await exec('Azeroth', { command: 'gm_list' })).error).toBe(
			'bad gateway',
		);

		(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 500,
			text: async () => '',
		});
		expect((await exec('Azeroth', { command: 'gm_list' })).error).toBe(
			'HTTP 500',
		);
	});

	it('an OK but empty body is reported, not thrown', async () => {
		(global.fetch as any).mockResolvedValue({ ok: true, text: async () => '' });
		const exec = createSoapExec({ getToken: token });
		expect((await exec('Azeroth', { command: 'gm_list' })).error).toBe(
			'empty response',
		);
	});

	it('network throw resolves as a failed entry', async () => {
		(global.fetch as any).mockRejectedValue(new Error('offline'));
		const exec = createSoapExec({ getToken: token });
		const res = await exec('Azeroth', { command: 'gm_list' });
		expect(res.ok).toBe(false);
		expect(res.error).toBe(
			'wow:soap (POST /api/v1/wow/soap/Azeroth/exec) failed: offline',
		);
	});
});
