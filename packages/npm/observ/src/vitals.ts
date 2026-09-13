/// Web Vitals collection with no dependency on the `web-vitals` package.
///
/// The metrics the ingest accepts are a fixed allow-list, so the value of
/// pulling in a library here would be its edge-case handling, not its API --
/// and its edge cases are mostly about attribution and bfcache restores, which
/// this pipeline does not record. What it does need is the number, the rating
/// and the navigation type, all of which the platform reports directly.

export type VitalName = 'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb';

export interface Vital {
	metric: VitalName;
	value: number;
	rating: 'good' | 'needs-improvement' | 'poor';
	navigation_type?: string;
}

/// Good / poor boundaries per the Web Vitals thresholds. A value equal to the
/// good boundary is good: the spec's buckets are inclusive at the lower edge.
const THRESHOLDS: Record<VitalName, [number, number]> = {
	lcp: [2500, 4000],
	inp: [200, 500],
	cls: [0.1, 0.25],
	fcp: [1800, 3000],
	ttfb: [800, 1800],
};

export function rateVital(metric: VitalName, value: number): Vital['rating'] {
	const [good, poor] = THRESHOLDS[metric];
	if (value <= good) return 'good';
	if (value <= poor) return 'needs-improvement';
	return 'poor';
}

/// The ingest routes are siblings under one prefix, so a caller that already
/// configured the errors endpoint has said where the others are. Swapping the
/// last path segment rather than asking for three URLs keeps the existing
/// single-endpoint config working untouched.
export function siblingEndpoint(endpoint: string, lens: string): string {
	const cut = endpoint.lastIndexOf('/');
	return cut === -1 ? endpoint : `${endpoint.slice(0, cut)}/${lens}`;
}

/// Cumulative Layout Shift, summed over the session rather than over the worst
/// 1-second window. The windowed definition exists to stop a long-lived SPA
/// from accumulating an ever-worsening score; this pipeline reports at page
/// hide, so the two agree for ordinary page lifetimes and the simpler one has
/// no bookkeeping to get wrong.
export class ClsTracker {
	private total = 0;

	add(entry: { value: number; hadRecentInput: boolean }): void {
		// A shift within 500ms of an interaction is the user's doing, and the
		// spec excludes it. Including it would make every menu open look like a
		// layout bug.
		if (entry.hadRecentInput) return;
		this.total += entry.value;
	}

	get value(): number {
		return this.total;
	}
}

type ObserverEntry = PerformanceEntry & {
	value?: number;
	hadRecentInput?: boolean;
	duration?: number;
	startTime: number;
};

function observe(
	type: string,
	buffered: boolean,
	cb: (entries: ObserverEntry[]) => void,
): PerformanceObserver | null {
	try {
		// An entry type the browser does not know throws on observe() in some
		// engines and silently no-ops in others; either way the other vitals
		// must still be collected.
		const po = new PerformanceObserver((list) =>
			cb(list.getEntries() as ObserverEntry[]),
		);
		po.observe({ type, buffered });
		return po;
	} catch {
		return null;
	}
}

function navigationType(): string | undefined {
	const nav = performance.getEntriesByType?.('navigation')?.[0] as
		(PerformanceEntry & { type?: string }) | undefined;
	return nav?.type;
}

/// Wire up collection. `report` is called once per metric, at the point the
/// value is final: TTFB and FCP as soon as they are known, LCP/CLS/INP when the
/// page is hidden, since all three can still change until then.
export function collectVitals(report: (v: Vital) => void): () => void {
	if (typeof PerformanceObserver === 'undefined') return () => {};

	const nav = navigationType();
	const emit = (metric: VitalName, value: number) =>
		report({
			metric,
			value,
			rating: rateVital(metric, value),
			navigation_type: nav,
		});

	const observers: PerformanceObserver[] = [];
	const push = (po: PerformanceObserver | null) => po && observers.push(po);

	const navEntry = performance.getEntriesByType?.('navigation')?.[0] as
		(PerformanceEntry & { responseStart?: number }) | undefined;
	if (
		typeof navEntry?.responseStart === 'number' &&
		navEntry.responseStart > 0
	) {
		emit('ttfb', navEntry.responseStart);
	}

	push(
		observe('paint', true, (entries) => {
			for (const e of entries) {
				if (e.name === 'first-contentful-paint')
					emit('fcp', e.startTime);
			}
		}),
	);

	let lcp = 0;
	push(
		observe('largest-contentful-paint', true, (entries) => {
			// Every entry supersedes the last; the final one before the page is
			// hidden is the LCP.
			const last = entries[entries.length - 1];
			if (last) lcp = last.startTime;
		}),
	);

	const cls = new ClsTracker();
	push(
		observe('layout-shift', true, (entries) => {
			for (const e of entries) {
				cls.add({
					value: e.value ?? 0,
					hadRecentInput: e.hadRecentInput ?? false,
				});
			}
		}),
	);

	let inp = 0;
	push(
		observe('event', true, (entries) => {
			for (const e of entries) {
				// The real INP is a high percentile of interaction latencies; the
				// worst one is an upper bound on it and needs no per-interaction
				// bookkeeping. Recorded as an approximation on purpose.
				if ((e.duration ?? 0) > inp) inp = e.duration ?? 0;
			}
		}),
	);

	let finalized = false;
	const finalize = () => {
		if (finalized) return;
		finalized = true;
		if (lcp > 0) emit('lcp', lcp);
		if (cls.value > 0) emit('cls', cls.value);
		if (inp > 0) emit('inp', inp);
		for (const po of observers) po.disconnect();
	};

	const onHidden = () => {
		if (document.visibilityState === 'hidden') finalize();
	};
	document.addEventListener('visibilitychange', onHidden);
	// pagehide as well as visibilitychange: a bfcache navigation on iOS Safari
	// fires only the former, and a page that never reports is indistinguishable
	// from a page that was never visited.
	window.addEventListener('pagehide', finalize);

	return () => {
		document.removeEventListener('visibilitychange', onHidden);
		window.removeEventListener('pagehide', finalize);
		finalize();
	};
}
