import { describe, it, expect, vi } from 'vitest';
import { createErrorGroupsStream } from '../errorGroupsStream';

describe('errorGroupsStream', () => {
	it('posts command error_groups with params', async () => {
		const getToken = vi.fn(async () => 'tok');
		const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ rows: [] }) });
		global.fetch = fetchSpy;
		const store = createErrorGroupsStream({ getToken });
		store.setParams({ minutes: 1440, pod_namespace: 'kbve' });
		await Promise.resolve(); await Promise.resolve();
		const body = JSON.parse(fetchSpy.mock.calls.at(-1)![1].body);
		expect(body).toMatchObject({ command: 'error_groups', minutes: 1440, pod_namespace: 'kbve' });
	});
});
