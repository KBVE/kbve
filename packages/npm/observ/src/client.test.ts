import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Observer } from './client';

const ENDPOINT = 'https://metrics.test/api/v1/ingest/errors';

interface Posted {
	url: string;
	events: Record<string, unknown>[];
}

let posted: Posted[];

beforeEach(() => {
	posted = [];
	vi.stubGlobal('fetch', (url: string, init: { body: string }) => {
		posted.push({ url, events: JSON.parse(init.body).events });
		return Promise.resolve({ ok: true });
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function observer(overrides: Record<string, unknown> = {}) {
	return new Observer({
		endpoint: ENDPOINT,
		project: 'test',
		sessionId: 'sess-1',
		...overrides,
	});
}

const to = (lens: string) => posted.filter((p) => p.url.endsWith(`/${lens}`));

describe('flush routing', () => {
	it('posts each lens to its own endpoint', () => {
		// A product event posted to the errors route is rejected as a malformed
		// batch, taking anything batched with it.
		const o = observer();
		o.captureException(new Error('boom'));
		o.trackEvent('signup_completed');
		o.flush(false);

		expect(to('errors')).toHaveLength(1);
		expect(to('events')).toHaveLength(1);
		expect(to('errors')[0].events[0].message).toBe('boom');
		expect(to('events')[0].events[0].name).toBe('signup_completed');
	});

	it('sends nothing for an empty queue', () => {
		// Three routes now, so an unconditional flush would mean three empty
		// requests per interval per page.
		observer().flush(false);
		expect(posted).toHaveLength(0);
	});

	it('posts only the lenses that have events', () => {
		const o = observer();
		o.trackEvent('click');
		o.flush(false);
		expect(to('events')).toHaveLength(1);
		expect(to('errors')).toHaveLength(0);
		expect(to('perf')).toHaveLength(0);
	});

	it('honours explicitly configured endpoints over derivation', () => {
		const o = observer({ eventsEndpoint: 'https://elsewhere.test/e' });
		o.trackEvent('click');
		o.flush(false);
		expect(posted[0].url).toBe('https://elsewhere.test/e');
	});

	it('empties the queue so a second flush does not resend', () => {
		// Splicing rather than clearing after a successful post: a resend would
		// double every count on the product lens.
		const o = observer();
		o.trackEvent('click');
		o.flush(false);
		o.flush(false);
		expect(to('events')).toHaveLength(1);
	});
});

describe('trackEvent', () => {
	it('carries the routing fields the ingest requires', () => {
		const o = observer({
			release: '1.2.3',
			environment: 'production',
			getUserId: () => 'u-1',
		});
		o.trackEvent('purchase', { plan: 'pro' });
		o.flush(false);

		const ev = to('events')[0].events[0];
		expect(ev.project).toBe('test');
		expect(ev.session_id).toBe('sess-1');
		expect(ev.release).toBe('1.2.3');
		expect(ev.environment).toBe('production');
		expect(ev.user_id).toBe('u-1');
		expect(ev.extra).toEqual({ plan: 'pro' });
	});

	it('ignores an empty name', () => {
		// The ingest drops it anyway; not queueing it saves a round trip and
		// keeps `dropped` counting real problems.
		const o = observer();
		o.trackEvent('');
		o.flush(false);
		expect(posted).toHaveLength(0);
	});

	it('samples product events on the same population as errors', () => {
		// A funnel measured at a different rate than the errors beside it cannot
		// be compared with them.
		const o = observer({ sampleRate: 0 });
		o.trackEvent('click');
		o.captureException(new Error('boom'));
		o.flush(false);
		expect(posted).toHaveLength(0);
	});

	it('flushes once the batch is full', () => {
		const o = observer({ maxBatch: 2 });
		o.trackEvent('a');
		o.trackEvent('b');
		expect(to('events')).toHaveLength(1);
		expect(to('events')[0].events).toHaveLength(2);
	});
});
