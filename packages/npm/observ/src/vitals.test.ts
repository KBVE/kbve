import { describe, expect, it } from 'vitest';

import { ClsTracker, rateVital, siblingEndpoint } from './vitals';

describe('rateVital', () => {
	it('treats the good boundary as good', () => {
		// The Web Vitals buckets are inclusive at the lower edge, so an LCP of
		// exactly 2500ms is a pass. Off-by-one here would mark a passing page as
		// needing improvement on every report.
		expect(rateVital('lcp', 2500)).toBe('good');
		expect(rateVital('lcp', 2500.1)).toBe('needs-improvement');
		expect(rateVital('lcp', 4000)).toBe('needs-improvement');
		expect(rateVital('lcp', 4000.1)).toBe('poor');
	});

	it('rates every metric on its own scale', () => {
		// CLS is a unitless ratio in the hundredths; the duration metrics are
		// milliseconds in the thousands. One shared threshold would rate every
		// CLS as good and every duration as poor.
		expect(rateVital('cls', 0.05)).toBe('good');
		expect(rateVital('cls', 0.2)).toBe('needs-improvement');
		expect(rateVital('cls', 0.3)).toBe('poor');
		expect(rateVital('inp', 150)).toBe('good');
		expect(rateVital('ttfb', 900)).toBe('needs-improvement');
		expect(rateVital('fcp', 5000)).toBe('poor');
	});

	it('rates zero as good', () => {
		// A page with no layout shift reports 0, which must not fall through to
		// a worse bucket than a page that shifted slightly.
		expect(rateVital('cls', 0)).toBe('good');
		expect(rateVital('lcp', 0)).toBe('good');
	});
});

describe('siblingEndpoint', () => {
	it('swaps the last path segment', () => {
		expect(
			siblingEndpoint('https://metrics.kbve.com/api/v1/ingest/errors', 'perf'),
		).toBe('https://metrics.kbve.com/api/v1/ingest/perf');
		expect(
			siblingEndpoint('https://metrics.kbve.com/api/v1/ingest/errors', 'events'),
		).toBe('https://metrics.kbve.com/api/v1/ingest/events');
	});

	it('leaves a segment-less endpoint alone', () => {
		// Nothing sensible to derive, and guessing would post the batch to a URL
		// the caller never named.
		expect(siblingEndpoint('errors', 'perf')).toBe('errors');
	});

	it('drops a query string along with the segment it was attached to', () => {
		// The ingest takes no query parameters, so this is the harmless case --
		// but it is worth pinning, because the alternative is a derived URL that
		// silently carries someone's cache-buster to a different route.
		expect(siblingEndpoint('https://x/a/errors?k=1', 'perf')).toBe(
			'https://x/a/perf',
		);
	});
});

describe('ClsTracker', () => {
	it('sums shifts the user did not cause', () => {
		const cls = new ClsTracker();
		cls.add({ value: 0.05, hadRecentInput: false });
		cls.add({ value: 0.02, hadRecentInput: false });
		expect(cls.value).toBeCloseTo(0.07);
	});

	it('ignores shifts within the input window', () => {
		// Every menu open shifts layout. Counting those would make an
		// interactive page look broken.
		const cls = new ClsTracker();
		cls.add({ value: 0.5, hadRecentInput: true });
		expect(cls.value).toBe(0);
	});

	it('starts at zero', () => {
		expect(new ClsTracker().value).toBe(0);
	});
});
