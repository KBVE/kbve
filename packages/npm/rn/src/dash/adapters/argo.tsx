import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../../ui';
import type { BadgeTone } from '../../ui';
import { createStreamSource } from '../createStreamSource';
import type { StreamLens, StreamStore } from '../types';

// Minimal shape of the ArgoCD application payload we depend on. Kept local so
// the dash library has no coupling to the astro-kbve argoService.
interface RawArgoApp {
	metadata: { name: string };
	spec: {
		project: string;
		source?: { repoURL?: string };
		destination: { namespace: string };
	};
	status: {
		sync: { status: string; revision?: string };
		health: { status: string };
		operationState?: { finishedAt?: string };
		reconciledAt?: string;
		resources?: Array<{ status?: string; health?: { status?: string } }>;
	};
}

export interface ArgoItem {
	name: string;
	project: string;
	namespace: string;
	health: string;
	sync: string;
	repo: string;
	revision: string;
	lastSync: string;
	total: number;
	healthy: number;
	degraded: number;
	outOfSync: number;
}

export interface ArgoStreamOptions {
	/** Returns a fresh bearer token (Supabase access token). */
	getToken: () => Promise<string | null>;
	/** Origin for the proxy. '' (relative) on web, absolute URL on mobile. */
	baseUrl?: string;
	pollMs?: number;
}

function normalize(raw: RawArgoApp): ArgoItem {
	const res = raw.status.resources ?? [];
	let healthy = 0;
	let degraded = 0;
	let outOfSync = 0;
	for (const r of res) {
		const h = r.health?.status;
		if (h === 'Healthy') healthy++;
		else if (h === 'Degraded' || h === 'Missing') degraded++;
		if (r.status && r.status !== 'Synced') outOfSync++;
	}
	return {
		name: raw.metadata.name,
		project: raw.spec.project,
		namespace: raw.spec.destination.namespace || '',
		health: raw.status.health.status || 'Unknown',
		sync: raw.status.sync.status || 'Unknown',
		repo: raw.spec.source?.repoURL ?? '',
		revision: (raw.status.sync.revision ?? '').slice(0, 7),
		lastSync:
			raw.status.operationState?.finishedAt ??
			raw.status.reconciledAt ??
			'',
		total: res.length,
		healthy,
		degraded,
		outOfSync,
	};
}

export function createArgoStream(
	opts: ArgoStreamOptions,
): StreamStore<ArgoItem> {
	const { getToken, baseUrl = '', pollMs = 30_000 } = opts;
	return createStreamSource<RawArgoApp, ArgoItem>({
		key: 'argo:applications',
		pollMs,
		cacheTtlMs: 60_000,
		id: (it) => it.name,
		signature: (it) =>
			`${it.sync}|${it.health}|${it.lastSync}|${it.total}|${it.degraded}|${it.outOfSync}`,
		normalize,
		fetch: async ({ signal }) => {
			const token = await getToken();
			const res = await fetch(
				`${baseUrl}/dashboard/argo/proxy/api/v1/applications`,
				{
					headers: token
						? { Authorization: `Bearer ${token}` }
						: undefined,
					signal,
				},
			);
			if (res.status === 403) throw new Error('Access restricted');
			if (!res.ok) throw new Error(`ArgoCD upstream ${res.status}`);
			const json = (await res.json()) as { items?: RawArgoApp[] };
			return json.items ?? [];
		},
	});
}

function healthTone(status: string): BadgeTone {
	if (status === 'Healthy') return 'success';
	if (status === 'Degraded' || status === 'Missing') return 'danger';
	if (status === 'Progressing') return 'warning';
	return 'neutral';
}

function syncTone(status: string): BadgeTone {
	if (status === 'Synced') return 'success';
	if (status === 'OutOfSync') return 'warning';
	return 'neutral';
}

function healthDotColor(status: string): string {
	if (status === 'Healthy') return tokens.color.success;
	if (status === 'Degraded' || status === 'Missing')
		return tokens.color.danger;
	if (status === 'Progressing') return tokens.color.warning;
	return tokens.color.textFaint;
}

/** The Argo lens (t): projects an ArgoItem into row/card/detail/stat models. */
export const argoLens: StreamLens<ArgoItem> = {
	searchText: (it) => `${it.name} ${it.namespace} ${it.project}`,
	group: (it) => it.project,
	filters: [
		{
			id: 'degraded',
			label: 'Degraded',
			tone: 'danger',
			predicate: (it) =>
				it.health === 'Degraded' || it.health === 'Missing',
		},
		{
			id: 'outofsync',
			label: 'OutOfSync',
			tone: 'warning',
			predicate: (it) => it.sync === 'OutOfSync',
		},
	],
	stats: (items) => [
		{ id: 'total', label: 'Applications', value: items.length },
		{
			id: 'healthy',
			label: 'Healthy',
			tone: 'success',
			value: items.filter((i) => i.health === 'Healthy').length,
		},
		{
			id: 'synced',
			label: 'Synced',
			tone: 'success',
			value: items.filter((i) => i.sync === 'Synced').length,
		},
		{
			id: 'degraded',
			label: 'Degraded',
			tone: 'danger',
			value: items.filter(
				(i) => i.health === 'Degraded' || i.health === 'Missing',
			).length,
		},
		{
			id: 'outofsync',
			label: 'OutOfSync',
			tone: 'warning',
			value: items.filter((i) => i.sync === 'OutOfSync').length,
		},
	],
	row: (it) => (
		<Surface padded={false} style={styles.row}>
			<View
				style={[
					styles.dot,
					{ backgroundColor: healthDotColor(it.health) },
				]}
			/>
			<Text variant="label" numberOfLines={1} style={styles.name}>
				{it.name}
			</Text>
			<Text variant="caption" tone="muted" numberOfLines={1}>
				{it.project}
			</Text>
			<View style={styles.spacer} />
			<Badge label={it.sync} tone={syncTone(it.sync)} />
			<Badge label={it.health} tone={healthTone(it.health)} />
		</Surface>
	),
	card: (it) => (
		<Surface style={styles.card}>
			<Stack gap="sm">
				<Stack direction="row" align="center" gap="sm">
					<View
						style={[
							styles.dot,
							{ backgroundColor: healthDotColor(it.health) },
						]}
					/>
					<Text variant="label" numberOfLines={1} style={styles.name}>
						{it.name}
					</Text>
				</Stack>
				<Text variant="caption" tone="muted" numberOfLines={1}>
					{it.namespace || '—'} · {it.project}
				</Text>
				<Stack direction="row" gap="sm" wrap>
					<Badge label={it.sync} tone={syncTone(it.sync)} />
					<Badge label={it.health} tone={healthTone(it.health)} />
				</Stack>
			</Stack>
		</Surface>
	),
	detail: (it) => (
		<Stack gap="xs">
			<Fact label="Repo" value={it.repo || '—'} />
			<Fact label="Revision" value={it.revision || '—'} />
			<Fact label="Last sync" value={it.lastSync || '—'} />
			<Fact
				label="Resources"
				value={`${it.total} total · ${it.degraded} degraded · ${it.outOfSync} out-of-sync`}
			/>
		</Stack>
	),
};

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<Stack direction="row" gap="sm" justify="space-between">
			<Text variant="caption" tone="muted">
				{label}
			</Text>
			<Text variant="caption" numberOfLines={1} style={styles.factValue}>
				{value}
			</Text>
		</Stack>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		paddingHorizontal: tokens.space.md,
		paddingVertical: tokens.space.sm,
	},
	card: { padding: tokens.space.md },
	dot: { width: 9, height: 9, borderRadius: 5 },
	name: { flexShrink: 1 },
	spacer: { flexGrow: 1 },
	factValue: { flexShrink: 1, textAlign: 'right' },
});
