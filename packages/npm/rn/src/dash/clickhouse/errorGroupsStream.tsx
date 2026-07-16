import { createStreamSource } from '../createStreamSource';
import type { StreamParams, StreamStore, StreamLens } from '../types';
import { Surface, Stack, Text, Badge, tokens } from '../_ui';

export interface RawErrorGroup { pod_namespace?: string; service?: string; signature?: string; cnt?: number; last_seen?: string; sample?: string; }
export interface ErrorGroupItem { id: string; namespace: string; service: string; signature: string; count: number; lastSeen: string; sample: string; }

const PROXY = '/dashboard/clickhouse/proxy';

function normalize(r: RawErrorGroup): ErrorGroupItem {
	return {
		id: `${r.pod_namespace ?? ''}:${(r.signature ?? '').slice(0, 60)}`,
		namespace: r.pod_namespace ?? '',
		service: r.service ?? '',
		signature: r.signature ?? '',
		count: Number(r.cnt ?? 0),
		lastSeen: r.last_seen ?? '',
		sample: r.sample ?? '',
	};
}

export interface ErrorGroupsStreamOptions { getToken: () => Promise<string | null>; baseUrl?: string; pollMs?: number; }

export function createErrorGroupsStream(opts: ErrorGroupsStreamOptions): StreamStore<ErrorGroupItem> {
	const { getToken, baseUrl = '', pollMs = 30_000 } = opts;
	return createStreamSource<RawErrorGroup, ErrorGroupItem>({
		key: 'clickhouse:error_groups',
		pollMs,
		cacheTtlMs: 60_000,
		initialParams: { minutes: 360, limit: 25 },
		id: (it) => it.id,
		signature: (it) => `${it.signature}|${it.count}`,
		normalize,
		fetch: async ({ signal }, params: StreamParams) => {
			const token = await getToken();
			const body: Record<string, unknown> = { command: 'error_groups' };
			for (const k of ['minutes', 'limit', 'pod_namespace']) if (params[k] !== undefined && params[k] !== '') body[k] = params[k];
			const res = await fetch(`${baseUrl}${PROXY}`, {
				method: 'POST',
				headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
				body: JSON.stringify(body), signal,
			});
			if (res.status === 403) throw new Error('Access restricted');
			if (!res.ok) throw new Error(`ClickHouse API error: ${res.status}`);
			const json = (await res.json()) as { rows?: RawErrorGroup[] };
			return json?.rows ?? [];
		},
	});
}

export const errorGroupsLens: StreamLens<ErrorGroupItem> = {
	searchText: (it) => `${it.namespace} ${it.service} ${it.signature}`,
	row: (it) => (
		<Surface style={{ padding: tokens.space.md }}>
			<Stack gap="xs">
				<Stack direction="row" gap="xs" align="center">
					<Badge label={`×${it.count}`} tone="danger" />
					<Text variant="caption" tone="faint">{it.namespace}{it.service ? ` / ${it.service}` : ''}</Text>
				</Stack>
				<Text variant="caption" numberOfLines={2}>{it.signature}</Text>
			</Stack>
		</Surface>
	),
};
