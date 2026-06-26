import { useState, useEffect } from 'react';
import { StyleSheet, View, Pressable, ActivityIndicator } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../../ui';
import type { BadgeTone } from '../../ui';
import { createStreamSource } from '../createStreamSource';
import type { StreamAction, StreamLens, StreamStore } from '../types';

// Minimal shape of the ArgoCD application payload we depend on. Kept local so
// the dash library has no coupling to the astro-kbve argoService.
interface RawArgoApp {
	metadata: { name: string; creationTimestamp?: string };
	spec: {
		project: string;
		source?: { repoURL?: string };
		destination: { namespace: string };
	};
	status: {
		sync: { status: string; revision?: string; startedAt?: string };
		health: { status: string };
		operationState?: {
			finishedAt?: string;
			startedAt?: string;
			phase?: string;
		};
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
	progressing: number;
	missing: number;
	suspended: number;
	outOfSync: number;
	stalled: boolean;
	stallReason: string;
	stallAgeMs: number;
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
	let progressing = 0;
	let missing = 0;
	let suspended = 0;
	let outOfSync = 0;

	for (const r of res) {
		const h = r.health?.status;
		if (h === 'Healthy') healthy++;
		else if (h === 'Degraded') degraded++;
		else if (h === 'Progressing') progressing++;
		else if (h === 'Missing') missing++;
		else if (h === 'Suspended') suspended++;
		if (r.status && r.status !== 'Synced') outOfSync++;
	}

	const health = raw.status.health.status || 'Unknown';
	const sync = raw.status.sync.status || 'Unknown';

	// Stall detection (mirrors argoService.ts detectAppStall)
	const now = Date.now();
	let stalled = false;
	let stallReason = '';
	let stallAgeMs = 0;

	// Check if sync operation is running
	const opStarted = raw.status.operationState?.startedAt;
	const opFinished = raw.status.operationState?.finishedAt;
	const opPhase = raw.status.operationState?.phase;
	if (opStarted && !opFinished && opPhase === 'Running') {
		const age = now - new Date(opStarted).getTime();
		if (age > 5 * 60 * 1000) {
			// >5 minutes
			stalled = true;
			stallReason = 'Sync running';
			stallAgeMs = age;
		}
	}

	// Check if health is stuck in Progressing
	if (!stalled && health === 'Progressing') {
		const reconciledAt = raw.status.reconciledAt;
		if (reconciledAt) {
			const age = now - new Date(reconciledAt).getTime();
			if (age > 5 * 60 * 1000) {
				// >5 minutes
				stalled = true;
				stallReason = 'Health Progressing';
				stallAgeMs = age;
			}
		}
	}

	// Check if OutOfSync for too long
	if (!stalled && sync === 'OutOfSync') {
		const lastSyncTime =
			raw.status.operationState?.finishedAt ?? raw.status.reconciledAt;
		if (lastSyncTime) {
			const age = now - new Date(lastSyncTime).getTime();
			if (age > 30 * 60 * 1000) {
				// >30 minutes
				stalled = true;
				stallReason = 'OutOfSync';
				stallAgeMs = age;
			}
		}
	}

	return {
		name: raw.metadata.name,
		project: raw.spec.project,
		namespace: raw.spec.destination.namespace || '',
		health,
		sync,
		repo: raw.spec.source?.repoURL ?? '',
		revision: (raw.status.sync.revision ?? '').slice(0, 7),
		lastSync:
			raw.status.operationState?.finishedAt ??
			raw.status.reconciledAt ??
			'',
		total: res.length,
		healthy,
		degraded,
		progressing,
		missing,
		suspended,
		outOfSync,
		stalled,
		stallReason,
		stallAgeMs,
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
			`${it.sync}|${it.health}|${it.lastSync}|${it.total}|${it.degraded}|${it.outOfSync}|${it.stalled}`,
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

async function argoMutate(
	opts: ArgoStreamOptions,
	path: string,
	method: 'POST' | 'GET',
): Promise<void> {
	const token = await opts.getToken();
	const headers: Record<string, string> = {};
	if (token) headers['Authorization'] = `Bearer ${token}`;
	if (method === 'POST') headers['Content-Type'] = 'application/json';
	const res = await fetch(
		`${opts.baseUrl ?? ''}/dashboard/argo/proxy${path}`,
		{
			method,
			headers,
			body: method === 'POST' ? '{}' : undefined,
		},
	);
	if (res.status === 403) throw new Error('Manage permission required');
	if (!res.ok) throw new Error(`ArgoCD ${method} ${res.status}`);
}

/** Argo mutations bound to a token/baseUrl. Require DASHBOARD_MANAGE. */
export function argoActions(opts: ArgoStreamOptions): StreamAction<ArgoItem>[] {
	const app = (it: ArgoItem) => encodeURIComponent(it.name);
	return [
		{
			id: 'sync',
			label: 'Sync',
			run: (it) =>
				argoMutate(
					opts,
					`/api/v1/applications/${app(it)}/sync`,
					'POST',
				),
		},
		{
			id: 'refresh',
			label: 'Hard Refresh',
			run: (it) =>
				argoMutate(
					opts,
					`/api/v1/applications/${app(it)}?refresh=hard`,
					'GET',
				),
		},
	];
}

// ---------------------------------------------------------------------------
// Additional ArgoCD API types for detail panels
// ---------------------------------------------------------------------------

interface ResourceNode {
	group?: string;
	version?: string;
	kind: string;
	namespace?: string;
	name: string;
	uid?: string;
	health?: { status?: string; message?: string };
	networkingInfo?: { ingress?: Array<{ hostname?: string }> };
	images?: string[];
	createdAt?: string;
}

interface ResourceTree {
	nodes?: ResourceNode[];
}

interface AppEvent {
	type?: string;
	reason?: string;
	message?: string;
	count?: number;
	firstTimestamp?: string;
	lastTimestamp?: string;
	metadata?: { name?: string; namespace?: string; uid?: string };
}

interface ManagedResource {
	kind: string;
	name: string;
	namespace?: string;
	group?: string;
	version?: string;
	liveState?: string; // JSON string
	targetState?: string; // JSON string
	diff?: string;
	hook?: boolean;
	requiresPruning?: boolean;
}

interface LogLine {
	content?: string;
	podName?: string;
	containerName?: string;
	timeStamp?: string;
}

interface PodLogOptions {
	namespace: string;
	podName: string;
	container?: string;
	tailLines?: number;
	sinceSeconds?: number;
}

interface IndexedLogQuery {
	namespace?: string;
	podName?: string;
	service?: string;
	level?: string;
	search?: string;
	minutes?: number;
	limit?: number;
}

interface IndexedLogRow {
	timestamp: string;
	level?: string;
	message?: string;
	pod_name?: string;
	pod_namespace?: string;
	service?: string;
	container_name?: string;
}

/** Fetch resource tree (K8s resource hierarchy for an app). */
export async function fetchResourceTree(
	opts: ArgoStreamOptions,
	appName: string,
): Promise<ResourceTree> {
	const token = await opts.getToken();
	const res = await fetch(
		`${opts.baseUrl ?? ''}/dashboard/argo/proxy/api/v1/applications/${encodeURIComponent(appName)}/resource-tree`,
		{ headers: token ? { Authorization: `Bearer ${token}` } : undefined },
	);
	if (!res.ok)
		throw new Error(`Failed to fetch resource tree: ${res.status}`);
	return res.json();
}

/** Fetch events for an application or specific resource. */
export async function fetchAppEvents(
	opts: ArgoStreamOptions,
	appName: string,
): Promise<AppEvent[]> {
	const token = await opts.getToken();
	const res = await fetch(
		`${opts.baseUrl ?? ''}/dashboard/argo/proxy/api/v1/applications/${encodeURIComponent(appName)}/events`,
		{ headers: token ? { Authorization: `Bearer ${token}` } : undefined },
	);
	if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
	const json = (await res.json()) as { items?: AppEvent[] };
	return json.items ?? [];
}

/** Fetch managed resources (diff state for out-of-sync resources). */
export async function fetchManagedResources(
	opts: ArgoStreamOptions,
	appName: string,
): Promise<ManagedResource[]> {
	const token = await opts.getToken();
	const res = await fetch(
		`${opts.baseUrl ?? ''}/dashboard/argo/proxy/api/v1/applications/${encodeURIComponent(appName)}/managed-resources`,
		{ headers: token ? { Authorization: `Bearer ${token}` } : undefined },
	);
	if (!res.ok)
		throw new Error(`Failed to fetch managed resources: ${res.status}`);
	const json = (await res.json()) as { items?: ManagedResource[] };
	return json.items ?? [];
}

/** Fetch pod logs from ArgoCD. */
export async function fetchPodLogs(
	opts: ArgoStreamOptions,
	appName: string,
	logOpts: PodLogOptions,
): Promise<LogLine[]> {
	const token = await opts.getToken();
	const params = new URLSearchParams({
		container: logOpts.container ?? '',
		namespace: logOpts.namespace,
		podName: logOpts.podName,
		tailLines: String(logOpts.tailLines ?? 200),
		follow: 'false',
	});
	if (logOpts.sinceSeconds) {
		params.set('sinceSeconds', String(logOpts.sinceSeconds));
	}

	const res = await fetch(
		`${opts.baseUrl ?? ''}/dashboard/argo/proxy/api/v1/applications/${encodeURIComponent(appName)}/pods/${encodeURIComponent(logOpts.podName)}/logs?${params}`,
		{ headers: token ? { Authorization: `Bearer ${token}` } : undefined },
	);
	if (res.status === 404) throw new Error('Pod not found');
	if (!res.ok) throw new Error(`Failed to fetch pod logs: ${res.status}`);

	const text = await res.text();
	const lines: LogLine[] = [];
	for (const raw of text.split('\n')) {
		if (!raw.trim()) continue;
		try {
			const parsed = JSON.parse(raw);
			if (parsed?.result) lines.push(parsed.result as LogLine);
		} catch {
			lines.push({ content: raw });
		}
	}
	return lines;
}

/** Fetch indexed logs from ClickHouse. */
export async function fetchIndexedLogs(
	opts: ArgoStreamOptions,
	query: IndexedLogQuery,
): Promise<IndexedLogRow[]> {
	const token = await opts.getToken();
	const body: Record<string, unknown> = {
		command: 'query',
		minutes: query.minutes ?? 60,
		limit: query.limit ?? 200,
	};
	if (query.namespace) body['pod_namespace'] = query.namespace;
	if (query.podName) body['pod_name'] = query.podName;
	if (query.service) body['service'] = query.service;
	if (query.level) body['level'] = query.level;
	if (query.search) body['search'] = query.search;

	const res = await fetch(
		`${opts.baseUrl ?? ''}/dashboard/clickhouse/proxy`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		},
	);

	if (res.status === 403)
		throw new Error('Access restricted to indexed logs');
	if (!res.ok) throw new Error(`ClickHouse logs error: ${res.status}`);

	const data = (await res.json()) as { rows?: IndexedLogRow[] };
	return Array.isArray(data?.rows) ? data.rows : [];
}

// ---------------------------------------------------------------------------
// Enhanced detail component with tabs
// ---------------------------------------------------------------------------

type DetailTab = 'summary' | 'resources' | 'events' | 'diff' | 'logs';

function ArgoDetailPanel({
	item,
	opts,
}: {
	item: ArgoItem;
	opts: ArgoStreamOptions;
}) {
	const [tab, setTab] = useState<DetailTab>('summary');
	const [resources, setResources] = useState<ResourceNode[] | null>(null);
	const [events, setEvents] = useState<AppEvent[] | null>(null);
	const [managedRes, setManagedRes] = useState<ManagedResource[] | null>(
		null,
	);
	const [logs, setLogs] = useState<IndexedLogRow[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (tab === 'summary') return;

		let cancelled = false;
		setLoading(true);
		setError(null);

		const load = async () => {
			try {
				if (tab === 'resources') {
					const tree = await fetchResourceTree(opts, item.name);
					if (!cancelled) setResources(tree.nodes ?? []);
				} else if (tab === 'events') {
					const evts = await fetchAppEvents(opts, item.name);
					if (!cancelled) setEvents(evts);
				} else if (tab === 'diff') {
					const managed = await fetchManagedResources(
						opts,
						item.name,
					);
					if (!cancelled) setManagedRes(managed);
				} else if (tab === 'logs') {
					const indexed = await fetchIndexedLogs(opts, {
						namespace: item.namespace,
						minutes: 60,
						limit: 100,
					});
					if (!cancelled) setLogs(indexed);
				}
			} catch (e) {
				if (!cancelled)
					setError(e instanceof Error ? e.message : 'Failed to load');
			} finally {
				if (!cancelled) setLoading(false);
			}
		};

		void load();
		return () => {
			cancelled = true;
		};
	}, [tab, item.name, item.namespace, opts]);

	const tabs: { id: DetailTab; label: string }[] = [
		{ id: 'summary', label: 'Summary' },
		{ id: 'resources', label: 'Resources' },
		{ id: 'events', label: 'Events' },
		{ id: 'diff', label: 'Diff' },
		{ id: 'logs', label: 'Logs' },
	];

	return (
		<Stack gap="sm">
			{/* Tab bar */}
			<Stack direction="row" gap="xs" style={styles.tabBar}>
				{tabs.map((t) => (
					<Pressable
						key={t.id}
						onPress={() => setTab(t.id)}
						style={[
							styles.tab,
							tab === t.id ? styles.tabActive : null,
						]}>
						<Text
							variant="caption"
							weight="medium"
							style={{
								color:
									tab === t.id
										? tokens.color.primary
										: tokens.color.textMuted,
							}}>
							{t.label}
						</Text>
					</Pressable>
				))}
			</Stack>

			{/* Tab content */}
			{tab === 'summary' && <SummaryTab item={item} />}
			{tab === 'resources' &&
				(loading ? (
					<LoadingIndicator />
				) : error ? (
					<ErrorText message={error} />
				) : (
					<ResourcesTab resources={resources ?? []} />
				))}
			{tab === 'events' &&
				(loading ? (
					<LoadingIndicator />
				) : error ? (
					<ErrorText message={error} />
				) : (
					<EventsTab events={events ?? []} />
				))}
			{tab === 'diff' &&
				(loading ? (
					<LoadingIndicator />
				) : error ? (
					<ErrorText message={error} />
				) : (
					<DiffTab managed={managedRes ?? []} />
				))}
			{tab === 'logs' &&
				(loading ? (
					<LoadingIndicator />
				) : error ? (
					<ErrorText message={error} />
				) : (
					<LogsTab logs={logs ?? []} />
				))}
		</Stack>
	);
}

function SummaryTab({ item }: { item: ArgoItem }) {
	return (
		<Stack gap="xs">
			<Fact label="Repo" value={item.repo || '—'} />
			<Fact label="Revision" value={item.revision || '—'} />
			<Fact label="Last sync" value={item.lastSync || '—'} />
			{item.stalled && (
				<Fact
					label="Stalled"
					value={`${item.stallReason} for ${formatAge(item.stallAgeMs)}`}
				/>
			)}
			<Fact
				label="Resources"
				value={`${item.total} total · ${item.healthy} healthy · ${item.degraded} degraded · ${item.progressing} progressing`}
			/>
			<ResourceBar it={item} />
		</Stack>
	);
}

function ResourcesTab({ resources }: { resources: ResourceNode[] }) {
	if (resources.length === 0) {
		return (
			<Text variant="caption" tone="muted">
				No resources found
			</Text>
		);
	}

	return (
		<Stack gap="xs">
			{resources.map((r, i) => {
				const healthStatus = r.health?.status ?? 'Unknown';
				const healthColor =
					healthStatus === 'Healthy'
						? tokens.color.success
						: healthStatus === 'Degraded'
							? tokens.color.danger
							: healthStatus === 'Progressing'
								? tokens.color.warning
								: tokens.color.textFaint;

				return (
					<Surface key={i} style={styles.resourceItem}>
						<Stack gap="xs">
							<Stack direction="row" align="center" gap="xs">
								<View
									style={[
										styles.resourceDot,
										{ backgroundColor: healthColor },
									]}
								/>
								<Text
									variant="label"
									numberOfLines={1}
									style={{ flexShrink: 1 }}>
									{r.kind}
								</Text>
								<Badge
									label={healthStatus}
									tone={
										healthStatus === 'Healthy'
											? 'success'
											: healthStatus === 'Degraded'
												? 'danger'
												: healthStatus === 'Progressing'
													? 'warning'
													: 'neutral'
									}
								/>
							</Stack>
							<Text
								variant="caption"
								tone="muted"
								numberOfLines={1}>
								{r.namespace ? `${r.namespace}/` : ''}
								{r.name}
							</Text>
						</Stack>
					</Surface>
				);
			})}
		</Stack>
	);
}

function EventsTab({ events }: { events: AppEvent[] }) {
	if (events.length === 0) {
		return (
			<Text variant="caption" tone="muted">
				No events recorded
			</Text>
		);
	}

	const sorted = [...events].sort((a, b) => {
		const ta = new Date(a.lastTimestamp ?? a.firstTimestamp ?? 0).getTime();
		const tb = new Date(b.lastTimestamp ?? b.firstTimestamp ?? 0).getTime();
		return tb - ta;
	});

	return (
		<Stack gap="xs">
			{sorted.slice(0, 20).map((e, i) => {
				const isWarning = e.type === 'Warning';
				const ts = e.lastTimestamp ?? e.firstTimestamp ?? '';
				return (
					<Surface
						key={i}
						style={[
							styles.eventItem,
							{
								borderColor: isWarning
									? tokens.color.warning
									: tokens.color.success,
							},
						]}>
						<Stack gap="xs">
							<Stack
								direction="row"
								align="center"
								justify="space-between">
								<Text
									variant="caption"
									weight="medium"
									style={{
										color: isWarning
											? tokens.color.warning
											: tokens.color.success,
									}}>
									{e.reason ?? 'Event'}
								</Text>
								{e.count && e.count > 1 && (
									<Text variant="caption" tone="muted">
										×{e.count}
									</Text>
								)}
							</Stack>
							<Text variant="caption" tone="muted">
								{e.message ?? ''}
							</Text>
							{ts && (
								<Text variant="caption" tone="faint">
									{new Date(ts).toLocaleString()}
								</Text>
							)}
						</Stack>
					</Surface>
				);
			})}
		</Stack>
	);
}

function DiffTab({ managed }: { managed: ManagedResource[] }) {
	const outOfSync = managed.filter((m) => m.liveState && m.targetState);

	if (outOfSync.length === 0) {
		return (
			<Text variant="caption" tone="muted">
				All resources in sync
			</Text>
		);
	}

	return (
		<Stack gap="xs">
			<Text variant="caption" tone="warning" weight="medium">
				{outOfSync.length} resource{outOfSync.length > 1 ? 's' : ''} out
				of sync
			</Text>
			{outOfSync.slice(0, 10).map((m, i) => (
				<Surface key={i} style={styles.diffItem}>
					<Stack gap="xs">
						<Text variant="label">{m.kind}</Text>
						<Text variant="caption" tone="muted">
							{m.namespace ? `${m.namespace}/` : ''}
							{m.name}
						</Text>
						{m.requiresPruning && (
							<Badge label="Requires pruning" tone="warning" />
						)}
					</Stack>
				</Surface>
			))}
		</Stack>
	);
}

function LogsTab({ logs }: { logs: IndexedLogRow[] }) {
	if (logs.length === 0) {
		return (
			<Text variant="caption" tone="muted">
				No logs found in the last hour
			</Text>
		);
	}

	return (
		<Stack gap="xs">
			<Text variant="caption" tone="muted" weight="medium">
				Showing {logs.length} log entries from ClickHouse (last 60 min)
			</Text>
			{logs.map((log, i) => {
				const level = log.level?.toLowerCase() ?? 'info';
				const levelColor =
					level === 'error'
						? tokens.color.danger
						: level === 'warn' || level === 'warning'
							? tokens.color.warning
							: level === 'debug'
								? tokens.color.textFaint
								: tokens.color.textMuted;

				return (
					<Surface key={i} style={styles.logItem}>
						<Stack gap="xs">
							<Stack direction="row" align="center" gap="xs">
								<Text
									variant="caption"
									weight="medium"
									style={{ color: levelColor }}>
									{log.level ?? 'INFO'}
								</Text>
								{log.pod_name && (
									<Text variant="caption" tone="faint">
										{log.pod_name}
									</Text>
								)}
								{log.container_name && (
									<Text variant="caption" tone="faint">
										/{log.container_name}
									</Text>
								)}
							</Stack>
							<Text variant="caption" tone="muted">
								{log.message ?? ''}
							</Text>
							{log.timestamp && (
								<Text variant="caption" tone="faint">
									{new Date(log.timestamp).toLocaleString()}
								</Text>
							)}
						</Stack>
					</Surface>
				);
			})}
		</Stack>
	);
}

function LoadingIndicator() {
	return (
		<View style={{ padding: tokens.space.md, alignItems: 'center' }}>
			<ActivityIndicator size="small" color={tokens.color.primary} />
		</View>
	);
}

function ErrorText({ message }: { message: string }) {
	return (
		<Text
			variant="caption"
			tone="danger"
			style={{ padding: tokens.space.sm }}>
			{message}
		</Text>
	);
}

/** Full Argo lens with token-bound actions (preferred over the view-only `argoLens`). */
export function createArgoLens(opts: ArgoStreamOptions): StreamLens<ArgoItem> {
	return {
		...argoLens,
		actions: argoActions(opts),
		detail: (item) => <ArgoDetailPanel item={item} opts={opts} />,
	};
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

function formatAge(ms: number): string {
	const min = Math.floor(ms / 60000);
	if (min < 60) return `${min}m`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h`;
	return `${Math.floor(hr / 24)}d`;
}

/** Resource health bar showing healthy/degraded/progressing/suspended resources */
function ResourceBar({ it }: { it: ArgoItem }) {
	const { total, healthy, degraded, missing, progressing, suspended } = it;
	if (!total) {
		return (
			<Text variant="caption" tone="muted">
				no tracked resources
			</Text>
		);
	}

	const bad = degraded + missing;
	const healthyPct = (healthy / total) * 100;
	const progressingPct = (progressing / total) * 100;
	const badPct = (bad / total) * 100;
	const suspendedPct = (suspended / total) * 100;

	return (
		<Stack gap="xs">
			<View style={styles.resourceBar}>
				{healthy > 0 && (
					<View
						style={[
							styles.resourceSegment,
							{
								width: `${healthyPct}%`,
								backgroundColor: tokens.color.success,
							},
						]}
					/>
				)}
				{progressing > 0 && (
					<View
						style={[
							styles.resourceSegment,
							{
								width: `${progressingPct}%`,
								backgroundColor: tokens.color.warning,
							},
						]}
					/>
				)}
				{bad > 0 && (
					<View
						style={[
							styles.resourceSegment,
							{
								width: `${badPct}%`,
								backgroundColor: tokens.color.danger,
							},
						]}
					/>
				)}
				{suspended > 0 && (
					<View
						style={[
							styles.resourceSegment,
							{
								width: `${suspendedPct}%`,
								backgroundColor: tokens.color.textFaint,
							},
						]}
					/>
				)}
			</View>
			<Stack direction="row" gap="xs" align="center">
				<Text variant="caption" tone="muted">
					{total} res
				</Text>
				{bad > 0 && (
					<Text variant="caption" tone="danger">
						{bad} unhealthy
					</Text>
				)}
				{progressing > 0 && (
					<Text variant="caption" tone="warning">
						{progressing} progressing
					</Text>
				)}
			</Stack>
		</Stack>
	);
}

/** Grouping modes for ArgoCD apps. */
export type ArgoGroupMode = 'project' | 'namespace' | 'none';

/** Helper to create a group function based on mode. */
export function argoGroupFn(
	mode: ArgoGroupMode,
): ((it: ArgoItem) => string) | undefined {
	if (mode === 'none') return undefined;
	if (mode === 'project') return (it) => it.project;
	if (mode === 'namespace') return (it) => it.namespace || '(cluster)';
	return undefined;
}

/** The Argo lens (t): projects an ArgoItem into row/card/detail/stat models. */
export const argoLens: StreamLens<ArgoItem> = {
	searchText: (it) => `${it.name} ${it.namespace} ${it.project}`,
	group: (it) => it.project, // Default grouping by project
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
		{
			id: 'stalled',
			label: 'Stalled',
			tone: 'warning',
			predicate: (it) => it.stalled,
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
		{
			id: 'stalled',
			label: 'Stalled',
			tone: 'warning',
			value: items.filter((i) => i.stalled).length,
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
					{it.stalled && (
						<Badge
							label={`Stalled ${it.stallAgeMs > 0 ? formatAge(it.stallAgeMs) : ''}`}
							tone="warning"
						/>
					)}
				</Stack>
				<Text variant="caption" tone="muted" numberOfLines={1}>
					{it.namespace || '—'} · {it.project}
				</Text>
				<Stack direction="row" gap="sm" wrap>
					<Badge label={it.sync} tone={syncTone(it.sync)} />
					<Badge label={it.health} tone={healthTone(it.health)} />
				</Stack>
				<ResourceBar it={it} />
			</Stack>
		</Surface>
	),
	// detail is replaced in createArgoLens with the tabbed ArgoDetailPanel
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
	resourceBar: {
		flexDirection: 'row',
		height: 10,
		borderRadius: 5,
		overflow: 'hidden',
		backgroundColor: tokens.color.bgSubtle,
	},
	resourceSegment: {
		height: '100%',
		minWidth: 3,
	},
	tabBar: {
		borderBottomWidth: 1,
		borderBottomColor: tokens.color.border,
		marginBottom: tokens.space.sm,
	},
	tab: {
		paddingHorizontal: tokens.space.md,
		paddingVertical: tokens.space.sm,
		borderBottomWidth: 2,
		borderBottomColor: 'transparent',
	},
	tabActive: {
		borderBottomColor: tokens.color.primary,
	},
	resourceItem: {
		padding: tokens.space.sm,
		borderRadius: tokens.radius.md,
	},
	resourceDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	eventItem: {
		padding: tokens.space.sm,
		borderRadius: tokens.radius.md,
		borderWidth: 1,
	},
	diffItem: {
		padding: tokens.space.sm,
		borderRadius: tokens.radius.md,
	},
	logItem: {
		padding: tokens.space.sm,
		borderRadius: tokens.radius.md,
		backgroundColor: tokens.color.surfaceAlt,
	},
});
