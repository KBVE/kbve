import { describe, it, expect, vi } from 'vitest';
import {
	createTelemetryEventsStream,
	createTelemetryGroupsStream,
	createTelemetryPerfStream,
	createTelemetryProductStream,
} from '../telemetryStreams';
import {
	normalizePerfSummary,
	normalizeProductEvent,
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

describe('perf stream', () => {
	it('reads the perf rollup and carries the filter', async () => {
		const spy = stubFetch({ perf: [] });
		const store = createTelemetryPerfStream({
			getToken: async () => 'tok',
			baseUrl: 'https://m.test',
		});
		store.setParams({ limit: 25, project: 'kbve' });
		await store.refresh();

		const [url, init] = spy.mock.calls.at(-1)!;
		expect(url).toContain('https://m.test/api/v1/perf?');
		expect(url).toContain('project=kbve');
		expect(init.headers).toMatchObject({ Authorization: 'Bearer tok' });
	});

	it('reads the envelope key the service actually sends', async () => {
		// The response is {"perf": [...]}, not {"groups": ...}: reading the wrong
		// key yields an empty list rather than an error, so the panel would render
		// "no data" against a healthy service.
		stubFetch({
			perf: [
				{
					project: 'kbve',
					metric: 'lcp',
					samples: '2',
					sessions: '2',
					p50: '1000',
					p75: '1234.5',
					p95: '1400',
					first_seen: '2026-09-12 21:00:00',
					last_seen: '2026-09-12 21:05:00',
				},
			],
		});
		const store = createTelemetryPerfStream({ getToken: async () => 't' });
		await store.refresh();
		expect(store.get().items).toHaveLength(1);
		expect(store.get().items[0].p75).toBe(1234.5);
	});

	it('surfaces the gate errors like the other streams', async () => {
		stubFetch({}, 403);
		const store = createTelemetryPerfStream({ getToken: async () => 't' });
		await store.refresh();
		expect(store.get().error ?? '').toContain('Staff access required');
	});
});

describe('product stream', () => {
	it('reads the product rollup', async () => {
		const spy = stubFetch({ product: [] });
		const store = createTelemetryProductStream({
			getToken: async () => 'tok',
			baseUrl: 'https://m.test',
		});
		store.setParams({ limit: 50, project: '  ' });
		await store.refresh();

		const [url] = spy.mock.calls.at(-1)!;
		expect(url).toContain('https://m.test/api/v1/product?');
		expect(url).toContain('limit=50');
		expect(url).not.toContain('project=');
	});
});

describe('rollup normalizers', () => {
	it('parses the stringified quantiles back to numbers', () => {
		// Every number arrives as a string so a UInt64 survives JSON; a row left
		// as strings sorts and sums as text.
		const it = normalizePerfSummary({
			project: 'kbve',
			metric: 'cls',
			samples: '10',
			p50: '0.05',
			p75: '0.12',
			p95: '0.3',
		});
		expect(it.samples).toBe(10);
		expect(it.p75).toBeCloseTo(0.12);
		expect(it.id).toBe('kbve:cls');
	});

	it('qualifies ids by project', () => {
		// Every project reports an `lcp`, and a bare metric id would collapse
		// them into a single row.
		const a = normalizePerfSummary({ project: 'a', metric: 'lcp' });
		const b = normalizePerfSummary({ project: 'b', metric: 'lcp' });
		expect(a.id).not.toBe(b.id);

		const x = normalizeProductEvent({ project: 'a', name: 'click' });
		const y = normalizeProductEvent({ project: 'b', name: 'click' });
		expect(x.id).not.toBe(y.id);
	});

	it('survives a row with every field missing', () => {
		// The service omits nothing today, but a normalizer that throws takes the
		// whole panel down rather than one row.
		expect(() => normalizePerfSummary({})).not.toThrow();
		expect(normalizeProductEvent({}).events).toBe(0);
	});
});

describe('time window', () => {
	it('omits the parameter for all-time rather than sending zero', async () => {
		// The service clamps the window to a minimum of one hour, so
		// since_hours=0 would ask for the last hour and render an empty
		// dashboard that reads as an outage rather than as "all time".
		const spy = stubFetch({ perf: [] });
		const store = createTelemetryPerfStream({ getToken: async () => 't' });
		store.setParams({ since_hours: 0 });
		await store.refresh();
		expect(spy.mock.calls.at(-1)![0]).not.toContain('since_hours');
	});

	it('sends a selected window on every rollup read', async () => {
		for (const [make, key, path] of [
			[createTelemetryPerfStream, 'perf', '/api/v1/perf'],
			[createTelemetryProductStream, 'product', '/api/v1/product'],
			[createTelemetryGroupsStream, 'groups', '/api/v1/groups'],
		] as const) {
			const spy = stubFetch({ [key]: [] });
			const store = make({ getToken: async () => 't' });
			store.setParams({ since_hours: 168 });
			await store.refresh();
			const url = spy.mock.calls.at(-1)![0] as string;
			expect(url).toContain(path);
			expect(url).toContain('since_hours=168');
		}
	});

	it('accepts the value as a string, which is what a control emits', async () => {
		const spy = stubFetch({ product: [] });
		const store = createTelemetryProductStream({ getToken: async () => 't' });
		store.setParams({ since_hours: '24' });
		await store.refresh();
		expect(spy.mock.calls.at(-1)![0]).toContain('since_hours=24');
	});

	it('ignores a value that is not a number', async () => {
		// A malformed param must not reach the query, where it would be a 400
		// for every row on the page.
		const spy = stubFetch({ perf: [] });
		const store = createTelemetryPerfStream({ getToken: async () => 't' });
		store.setParams({ since_hours: 'yesterday' });
		await store.refresh();
		expect(spy.mock.calls.at(-1)![0]).not.toContain('since_hours');
	});
});
