/**
 * Client error telemetry from metrics.kbve.com — NOT the ROWS request-rate
 * telemetry that `dash/adapters/rows.tsx` covers. The two are unrelated and only
 * share the word.
 *
 * The shapes are declared here rather than imported from `@kbve/devops`: that
 * package ships a prebuilt bundle pulling in jsdom and dompurify, neither of
 * which is safe on Hermes, and `@kbve/rn` does not depend on it.
 */

/** A group row exactly as `error_groups` returns it — every field a string,
 *  because the service stringifies the UInt64 counts and DateTimes on the way
 *  out so they survive JSON without precision loss. */
export interface RawTelemetryGroup {
	project?: string;
	fingerprint?: string;
	error_type?: string;
	sample_message?: string;
	events?: string;
	sessions?: string;
	first_seen?: string;
	last_seen?: string;
}

export interface TelemetryGroupItem {
	id: string;
	project: string;
	fingerprint: string;
	errorType: string;
	sampleMessage: string;
	events: number;
	sessions: number;
	firstSeen: string;
	lastSeen: string;
}

export interface RawTelemetryEvent {
	timestamp?: string;
	project?: string;
	platform?: string;
	release?: string;
	environment?: string;
	error_type?: string;
	message?: string;
	stack?: string;
	url?: string;
	user_id?: string;
	session_id?: string;
	handled?: string | number;
	extra?: string;
}

export interface TelemetryEventItem {
	id: string;
	timestamp: string;
	project: string;
	platform: string;
	release: string;
	environment: string;
	errorType: string;
	message: string;
	stack: string;
	url: string;
	sessionId: string;
	handled: boolean;
	extra: Record<string, string>;
}

function toNumber(v: string | undefined): number {
	const n = Number(v ?? 0);
	return Number.isFinite(n) ? n : 0;
}

export function normalizeTelemetryGroup(
	r: RawTelemetryGroup,
): TelemetryGroupItem {
	const fingerprint = r.fingerprint ?? '';
	return {
		// Project-qualified: the same fingerprint can legitimately appear under
		// two projects, and a bare fingerprint id would collapse them into one row.
		id: `${r.project ?? ''}:${fingerprint}`,
		project: r.project ?? '',
		fingerprint,
		errorType: r.error_type ?? '',
		sampleMessage: r.sample_message ?? '',
		events: toNumber(r.events),
		sessions: toNumber(r.sessions),
		firstSeen: r.first_seen ?? '',
		lastSeen: r.last_seen ?? '',
	};
}

/** `extra` arrives as a JSON *string* — the column is String, not a Map — so a
 *  malformed or truncated value must not take the whole row down with it. */
function parseExtra(raw: string | undefined): Record<string, string> {
	if (!raw) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
			return {};
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
			out[k] = typeof v === 'string' ? v : JSON.stringify(v);
		}
		return out;
	} catch {
		return {};
	}
}

export function normalizeTelemetryEvent(
	r: RawTelemetryEvent,
): TelemetryEventItem {
	return {
		// Events carry no key of their own. Timestamp alone collides — a burst
		// writes several inside one millisecond — so the session and a slice of
		// the message disambiguate without needing the row's position, which the
		// normalize contract does not supply.
		id: `${r.timestamp ?? ''}|${r.session_id ?? ''}|${(r.message ?? '').slice(0, 48)}`,
		timestamp: r.timestamp ?? '',
		project: r.project ?? '',
		platform: r.platform ?? '',
		release: r.release ?? '',
		environment: r.environment ?? '',
		errorType: r.error_type ?? '',
		message: r.message ?? '',
		stack: r.stack ?? '',
		url: r.url ?? '',
		sessionId: r.session_id ?? '',
		handled: String(r.handled ?? '0') === '1',
		extra: parseExtra(r.extra),
	};
}

/** A `perf_summary` row. Quantiles arrive stringified alongside the counts --
 *  the service wraps every number so a UInt64 past 2^53 survives JSON, and a
 *  quantile the client re-renders is one it can round differently than the
 *  service did. */
export interface RawPerfSummary {
	project?: string;
	metric?: string;
	samples?: string;
	sessions?: string;
	p50?: string;
	p75?: string;
	p95?: string;
	first_seen?: string;
	last_seen?: string;
}

export interface PerfSummaryItem {
	id: string;
	project: string;
	metric: string;
	samples: number;
	sessions: number;
	p50: number;
	p75: number;
	p95: number;
	firstSeen: string;
	lastSeen: string;
}

export interface RawEventCount {
	project?: string;
	name?: string;
	events?: string;
	sessions?: string;
	users?: string;
	first_seen?: string;
	last_seen?: string;
}

export interface ProductEventItem {
	id: string;
	project: string;
	name: string;
	events: number;
	sessions: number;
	users: number;
	firstSeen: string;
	lastSeen: string;
}

export function normalizePerfSummary(r: RawPerfSummary): PerfSummaryItem {
	return {
		// Project-qualified for the same reason the group id is: one metric name
		// appears under every project, and a bare `lcp` would collapse them.
		id: `${r.project ?? ''}:${r.metric ?? ''}`,
		project: r.project ?? '',
		metric: r.metric ?? '',
		samples: toNumber(r.samples),
		sessions: toNumber(r.sessions),
		p50: toNumber(r.p50),
		p75: toNumber(r.p75),
		p95: toNumber(r.p95),
		firstSeen: r.first_seen ?? '',
		lastSeen: r.last_seen ?? '',
	};
}

export function normalizeProductEvent(r: RawEventCount): ProductEventItem {
	return {
		id: `${r.project ?? ''}:${r.name ?? ''}`,
		project: r.project ?? '',
		name: r.name ?? '',
		events: toNumber(r.events),
		sessions: toNumber(r.sessions),
		users: toNumber(r.users),
		firstSeen: r.first_seen ?? '',
		lastSeen: r.last_seen ?? '',
	};
}
