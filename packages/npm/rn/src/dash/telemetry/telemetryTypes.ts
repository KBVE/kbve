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
