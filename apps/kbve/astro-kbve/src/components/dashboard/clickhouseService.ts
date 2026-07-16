import type { LogRow, QueryData } from '@/data/schema';

export type { LogRow };

const PROXY_BASE = '/dashboard/clickhouse/proxy';

export interface IndexedLogQuery {
	namespace?: string;
	podName?: string;
	service?: string;
	level?: string;
	search?: string;
	minutes?: number;
	limit?: number;
}

export async function fetchIndexedLogs(
	token: string,
	query: IndexedLogQuery,
): Promise<LogRow[]> {
	const body: Record<string, unknown> = {
		command: 'query',
		minutes: query.minutes ?? 60,
		limit: query.limit ?? 200,
	};
	if (query.namespace) body.pod_namespace = query.namespace;
	if (query.podName) body.pod_name = query.podName;
	if (query.service) body.service = query.service;
	if (query.level) body.level = query.level;
	if (query.search) body.search = query.search;

	const resp = await fetch(PROXY_BASE, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(15000),
	});

	if (resp.status === 403)
		throw new Error('Access restricted to indexed logs');
	if (!resp.ok) throw new Error(`ClickHouse logs API error: ${resp.status}`);

	const data: QueryData = await resp.json();
	return Array.isArray(data?.rows) ? (data.rows as LogRow[]) : [];
}
