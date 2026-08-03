export interface Series {
	n: number;
	median: number;
	p99: number;
	max: number;
	total: number;
}

export function summarize(values: readonly number[]): Series {
	if (values.length === 0)
		return { n: 0, median: 0, p99: 0, max: 0, total: 0 };
	const sorted = [...values].sort((a, b) => a - b);
	let total = 0;
	for (const v of sorted) total += v;
	return {
		n: sorted.length,
		median: sorted[Math.floor(sorted.length / 2)],
		p99: sorted[
			Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))
		],
		max: sorted[sorted.length - 1],
		total,
	};
}

export function round(v: number, places = 3): number {
	const f = 10 ** places;
	return Math.round(v * f) / f;
}

export function roundSeries(s: Series, places = 3): Series {
	return {
		n: s.n,
		median: round(s.median, places),
		p99: round(s.p99, places),
		max: round(s.max, places),
		total: round(s.total, places),
	};
}

// A stall is only interesting relative to how the run normally behaves: a 16ms
// frame is fine at 30fps and terrible at 240. Callers that know their budget
// pass an absolute floor; the multiple catches the rest.
export function outliers(
	values: readonly number[],
	multiple = 8,
	floor = 0,
): number[] {
	const { median } = summarize(values);
	const bar = Math.max(median * multiple, floor);
	return values.filter((v) => v > bar);
}
