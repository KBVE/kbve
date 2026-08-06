export interface RawLogRow {
	timestamp: string;
	level?: string;
	message?: string;
	pod_name?: string;
	pod_namespace?: string;
	service?: string;
	container_name?: string;
	metadata?: string;
}

export interface LogItem {
	id: string;
	timestamp: string;
	level: string;
	message: string;
	podName: string;
	namespace: string;
	service: string;
	container: string;
	relativeTime: string;
	metadataRaw: string;
}

export interface MetaFact {
	key: string;
	value: string;
}

const META_HIDDEN_KEYS = new Set([
	'level',
	'severity',
	'msg',
	'message',
	'time',
	'ts',
	'timestamp',
	'logger',
	'logging_pod',
]);

function formatRelativeTime(ts: string): string {
	try {
		const then = new Date(ts.replace(' ', 'T') + 'Z').getTime();
		const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
		if (diffSec < 60) return `${diffSec}s ago`;
		const diffMin = Math.round(diffSec / 60);
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHr = Math.round(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h ago`;
		return `${Math.round(diffHr / 24)}d ago`;
	} catch {
		return ts;
	}
}

export function normalize(raw: RawLogRow): LogItem {
	const level = (raw.level ?? 'info').toLowerCase();
	const namespace = raw.pod_namespace ?? '';
	const podName = raw.pod_name ?? '';
	const service = raw.service ?? '';
	const container = raw.container_name ?? '';
	const message = raw.message ?? '';

	const id = `${raw.timestamp}:${namespace}:${podName}`;
	const relativeTime = formatRelativeTime(raw.timestamp);

	return {
		id,
		timestamp: raw.timestamp,
		level,
		message,
		podName,
		namespace,
		service,
		container,
		relativeTime,
		metadataRaw: raw.metadata ?? '',
	};
}

export function parseMetadataFacts(rawMeta: string): MetaFact[] {
	if (!rawMeta || rawMeta === '{}') return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawMeta);
	} catch {
		return [{ key: 'metadata', value: rawMeta }];
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
		return [];
	const out: MetaFact[] = [];
	for (const [key, value] of Object.entries(
		parsed as Record<string, unknown>,
	)) {
		if (META_HIDDEN_KEYS.has(key.toLowerCase())) continue;
		if (value === null || value === undefined || value === '') continue;
		const text =
			typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
		if (!text) continue;
		out.push({ key, value: text });
	}
	return out.sort((a, b) => a.key.localeCompare(b.key));
}
