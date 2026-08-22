import { describe, it, expect, vi } from 'vitest';
import {
	createTelemetryEventsStream,
	createTelemetryGroupsStream,
} from '../telemetryStreams';
import {
	normalizeTelemetryEvent,
	normalizeTelemetryGroup,
} from '../telemetryTypes';

function stubFetch(payload: unknown, status = 200) {
	const spy = vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		statusText: '',
		url: '',
		json: async () => payload,
	});
	global.fetch = spy as unknown as typeof fetch;
	return spy;
}

const settle = async () => {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
};

describe('telemetry groups stream', () => {
	it('sends the bearer and omits an empty project', async () => {
		const spy = stubFetch({ groups: [] });
		const store = createTelemetryGroupsStream({
			getToken: async () => 'tok',
			baseUrl: 'https://m.test',
		});
		store.setParams({ limit: 25, project: '   ' });
		await store.refresh();

		const [url, init] = spy.mock.calls.at(-1)!;
		expect(url).toContain('https://m.test/api/v1/groups?');
		expect(url).toContain('limit=25');
		// A blank filter must not become `project=`, which would ask the service
		// for the project literally named empty string and always return nothing.
		expect(url).not.toContain('project=');
		expect(init.headers).toMatchObject({ Authorization: 'Bearer tok' });
	});

	it('re-reads the token on every fetch', async () => {
		stubFetch({ groups: [] });
		const getToken = vi.fn(async () => 'tok');
		const store = createTelemetryGroupsStream({ getToken });
		await store.refresh();
		await store.refresh();
		// The dashboard this replaces captured the token once at init, so an
		// expired session rendered a permanent 401 until the page was reloaded.
		expect(getToken.mock.calls.length).toBeGreaterThan(1);
	});

	it('names a lapsed session and a forbidden account differently', async () => {
		stubFetch({}, 401);
		const store = createTelemetryGroupsStream({ getToken: async () => 't' });
		await store.refresh();
		expect(store.get().error ?? '').toContain('Session expired');

		stubFetch({}, 403);
		await store.refresh();
		expect(store.get().error ?? '').toContain('Staff access required');
	});
});

describe('telemetry events stream', () => {
	it('asks for nothing until a fingerprint is chosen', async () => {
		const spy = stubFetch({ events: [] });
		const store = createTelemetryEventsStream({ getToken: async () => 't' });
		await store.refresh();
		// The service 400s a non-hex fingerprint, so requesting before a selection
		// would put a spurious failure on screen every time the drawer closes.
		expect(spy).not.toHaveBeenCalled();
		expect(store.get().items).toEqual([]);

		store.setParams({ fingerprint: 'abc123' });
		await store.refresh();
		expect(spy.mock.calls.at(-1)![0]).toContain('fingerprint=abc123');
	});
});

describe('normalizers', () => {
	it('coerces the stringified counts the service sends', () => {
		const g = normalizeTelemetryGroup({
			project: 'friendslop',
			fingerprint: 'ab12',
			events: '42',
			sessions: '7',
		});
		expect(g.events).toBe(42);
		expect(g.sessions).toBe(7);
		expect(g.id).toBe('friendslop:ab12');
	});

	it('survives missing fields and unparseable extra', () => {
		const g = normalizeTelemetryGroup({});
		expect(g.events).toBe(0);

		const e = normalizeTelemetryEvent({ extra: 'not json{' });
		// A truncated `extra` must not take the whole row down: the column is a
		// String, so anything at all can arrive in it.
		expect(e.extra).toEqual({});
		expect(e.handled).toBe(false);
	});

	it('reads the device context the client attaches', () => {
		const e = normalizeTelemetryEvent({
			handled: '1',
			extra: '{"os":"Windows","adapter":"RTX 4070"}',
		});
		expect(e.handled).toBe(true);
		expect(e.extra['os']).toBe('Windows');
	});
});
