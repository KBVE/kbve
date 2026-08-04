/**
 * Build-time Grand Exchange price snapshot.
 *
 * Every OSRS item page ships a client-side price widget, but the widget only
 * hydrates in a browser — the served HTML carries "Loading prices..." and
 * nothing else. Crawlers that skip or defer JS therefore never see the market
 * data that makes these pages worth indexing.
 *
 * This module fetches the wiki's bulk `latest` endpoint exactly once per build
 * (~340KB, ~4.5k items, one request) and hands each page a seed price so the
 * numbers are present in the static HTML. The island still hydrates and
 * refreshes to live data for real visitors.
 *
 * Failure is non-fatal: an unreachable API yields an empty snapshot and pages
 * fall back to the previous loading-state behaviour rather than failing the
 * build.
 */
const LATEST_ENDPOINT = 'https://prices.runescape.wiki/api/v1/osrs/latest';
const USER_AGENT = 'KBVE item_tracker - @h0lybyte on Discord';

// The wiki reports untraded items as int32 max rather than omitting them.
const UNTRADED_SENTINEL = 2147483647;

export interface OSRSPricePoint {
	high: number | null;
	low: number | null;
	highTime: number | null;
	lowTime: number | null;
}

export interface OSRSPriceSnapshot {
	prices: Map<number, OSRSPricePoint>;
	fetchedAt: Date | null;
}

interface LatestResponse {
	data?: Record<
		string,
		{
			high?: number | null;
			low?: number | null;
			highTime?: number | null;
			lowTime?: number | null;
		}
	>;
}

const EMPTY: OSRSPriceSnapshot = { prices: new Map(), fetchedAt: null };

let snapshotPromise: Promise<OSRSPriceSnapshot> | null = null;

function sanitize(value: number | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	if (!Number.isFinite(value)) return null;
	if (value <= 0 || value >= UNTRADED_SENTINEL) return null;
	return value;
}

async function fetchSnapshot(): Promise<OSRSPriceSnapshot> {
	try {
		const response = await fetch(LATEST_ENDPOINT, {
			headers: { 'User-Agent': USER_AGENT },
		});

		if (!response.ok) {
			console.warn(
				`[osrs/prices] latest endpoint returned ${response.status}; pages will fall back to client-side pricing`,
			);
			return EMPTY;
		}

		const json = (await response.json()) as LatestResponse;
		const entries = json.data ?? {};
		const prices = new Map<number, OSRSPricePoint>();

		for (const [rawId, point] of Object.entries(entries)) {
			const id = Number(rawId);
			if (!Number.isInteger(id)) continue;

			const high = sanitize(point?.high);
			const low = sanitize(point?.low);
			if (high === null && low === null) continue;

			prices.set(id, {
				high,
				low,
				highTime: point?.highTime ?? null,
				lowTime: point?.lowTime ?? null,
			});
		}

		console.info(`[osrs/prices] baked ${prices.size} item prices`);
		return { prices, fetchedAt: new Date() };
	} catch (error) {
		console.warn(
			'[osrs/prices] snapshot fetch failed; pages will fall back to client-side pricing',
			error,
		);
		return EMPTY;
	}
}

export function getPriceSnapshot(): Promise<OSRSPriceSnapshot> {
	snapshotPromise ??= fetchSnapshot();
	return snapshotPromise;
}

export async function getPrice(id: number): Promise<OSRSPricePoint | null> {
	const { prices } = await getPriceSnapshot();
	return prices.get(id) ?? null;
}

export function averageOf(point: OSRSPricePoint | null): number | null {
	if (!point) return null;
	if (point.high !== null && point.low !== null) {
		return Math.floor((point.high + point.low) / 2);
	}
	return point.high ?? point.low ?? null;
}
