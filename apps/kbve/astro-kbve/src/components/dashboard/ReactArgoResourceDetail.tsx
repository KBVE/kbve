import React, { useEffect, useMemo, useState } from 'react';
import {
	fetchAppEvents,
	fetchLiveResource,
	fetchManagedResources,
	fetchPodLogs,
	type AppEvent,
	type LogLine,
	type ManagedResource,
	type ResourceSelector,
} from './argoService';
import { fetchIndexedLogs, type LogRow } from './clickhouseService';
import { Loader2, X, AlertCircle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Inline YAML emitter (read-only, kubectl-ish)
// ---------------------------------------------------------------------------

function toYaml(value: unknown, indent = 0): string {
	const pad = '  '.repeat(indent);
	if (value === null || value === undefined) return 'null';
	if (typeof value === 'string') {
		if (value === '' || /[:#&*!|>'"%@`\n]|^\s|\s$/.test(value)) {
			return JSON.stringify(value);
		}
		return value;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	if (Array.isArray(value)) {
		if (value.length === 0) return '[]';
		return value
			.map((item) => {
				const rendered = toYaml(item, indent + 1);
				if (typeof item === 'object' && item !== null) {
					const lines = rendered.split('\n');
					const first = lines[0]?.replace(/^ {2}/, '');
					const rest = lines.slice(1).join('\n');
					return `${pad}- ${first}${rest ? `\n${rest}` : ''}`;
				}
				return `${pad}- ${rendered}`;
			})
			.join('\n');
	}
	if (typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>);
		if (entries.length === 0) return '{}';
		return entries
			.map(([k, v]) => {
				if (v === null || v === undefined) return `${pad}${k}: null`;
				if (typeof v === 'object') {
					const rendered = toYaml(v, indent + 1);
					if (Array.isArray(v) && v.length === 0)
						return `${pad}${k}: []`;
					if (
						!Array.isArray(v) &&
						Object.keys(v as object).length === 0
					)
						return `${pad}${k}: {}`;
					return `${pad}${k}:\n${rendered}`;
				}
				return `${pad}${k}: ${toYaml(v, indent + 1)}`;
			})
			.join('\n');
	}
	return String(value);
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

type TabId =
	| 'summary'
	| 'manifest'
	| 'events'
	| 'diff'
	| 'logs'
	| 'indexed'
	| 'conditions'
	| 'containers';

function TabBar({
	tabs,
	active,
	onSelect,
}: {
	tabs: { id: TabId; label: string }[];
	active: TabId;
	onSelect: (t: TabId) => void;
}) {
	return (
		<div
			style={{
				display: 'flex',
				gap: 0,
				borderBottom: '1px solid var(--sl-color-gray-5, #262626)',
				marginBottom: '0.75rem',
			}}>
			{tabs.map((t) => {
				const isActive = t.id === active;
				return (
					<button
						key={t.id}
						onClick={() => onSelect(t.id)}
						style={{
							background: 'transparent',
							border: 'none',
							borderBottom: `2px solid ${isActive ? '#8b5cf6' : 'transparent'}`,
							color: isActive
								? 'var(--sl-color-text, #e6edf3)'
								: 'var(--sl-color-gray-3, #8b949e)',
							padding: '0.5rem 0.75rem',
							fontSize: '0.8rem',
							fontWeight: isActive ? 600 : 500,
							cursor: 'pointer',
							marginBottom: '-1px',
						}}>
						{t.label}
					</button>
				);
			})}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Container helpers
// ---------------------------------------------------------------------------

function FetchState({
	loading,
	error,
	empty,
}: {
	loading: boolean;
	error: string | null;
	empty?: string;
}) {
	if (loading) {
		return (
			<div
				style={{
					padding: '1rem',
					color: 'var(--sl-color-gray-3, #8b949e)',
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					fontSize: '0.85rem',
				}}>
				<Loader2
					size={14}
					style={{ animation: 'spin 1s linear infinite' }}
				/>
				Loading...
			</div>
		);
	}
	if (error) {
		return (
			<div
				style={{
					padding: '1rem',
					color: '#ef4444',
					fontSize: '0.85rem',
					display: 'flex',
					alignItems: 'center',
					gap: 8,
				}}>
				<AlertCircle size={14} />
				{error}
			</div>
		);
	}
	if (empty) {
		return (
			<div
				style={{
					padding: '1rem',
					color: 'var(--sl-color-gray-3, #8b949e)',
					fontSize: '0.85rem',
				}}>
				{empty}
			</div>
		);
	}
	return null;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function SummaryTab({
	sel,
	manifest,
	healthMessage,
}: {
	sel: ResourceSelector;
	manifest: Record<string, unknown> | null;
	healthMessage?: string;
}) {
	const meta = (manifest?.metadata as Record<string, unknown>) ?? {};
	const status = (manifest?.status as Record<string, unknown>) ?? {};
	const labels = (meta?.labels as Record<string, string>) ?? {};
	const annotations = (meta?.annotations as Record<string, string>) ?? {};
	const created = meta?.creationTimestamp as string | undefined;

	const rows: [string, React.ReactNode][] = [
		['Kind', sel.kind],
		['API Group', sel.group || 'core'],
		['Version', sel.version || 'v1'],
		['Namespace', sel.namespace || '(cluster)'],
		['Name', sel.name],
		['UID', (meta.uid as string) || sel.uid || '--'],
		['Created', created ? new Date(created).toLocaleString() : '--'],
		['Resource Version', (meta.resourceVersion as string) || '--'],
	];

	if (typeof status.phase === 'string') {
		rows.push(['Phase', status.phase as string]);
	}

	return (
		<div style={{ fontSize: '0.85rem' }}>
			{healthMessage && (
				<div
					style={{
						padding: '0.75rem',
						marginBottom: '0.75rem',
						borderRadius: 6,
						background: 'rgba(239, 68, 68, 0.08)',
						border: '1px solid rgba(239, 68, 68, 0.3)',
						color: '#fca5a5',
						fontSize: '0.8rem',
					}}>
					{healthMessage}
				</div>
			)}
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: '160px 1fr',
					gap: '0.4rem 1rem',
					marginBottom: '1rem',
				}}>
				{rows.map(([k, v]) => (
					<React.Fragment key={k}>
						<div
							style={{
								color: 'var(--sl-color-gray-3, #8b949e)',
								fontSize: '0.75rem',
								textTransform: 'uppercase',
								letterSpacing: '0.05em',
							}}>
							{k}
						</div>
						<div
							style={{
								color: 'var(--sl-color-text, #e6edf3)',
								wordBreak: 'break-all',
							}}>
							{v}
						</div>
					</React.Fragment>
				))}
			</div>

			{Object.keys(labels).length > 0 && (
				<KVBlock title="Labels" data={labels} />
			)}
			{Object.keys(annotations).length > 0 && (
				<KVBlock title="Annotations" data={annotations} truncate />
			)}
		</div>
	);
}

function KVBlock({
	title,
	data,
	truncate = false,
}: {
	title: string;
	data: Record<string, string>;
	truncate?: boolean;
}) {
	return (
		<div style={{ marginBottom: '1rem' }}>
			<div
				style={{
					fontSize: '0.7rem',
					fontWeight: 600,
					color: 'var(--sl-color-gray-3, #8b949e)',
					marginBottom: 4,
					textTransform: 'uppercase',
					letterSpacing: '0.05em',
				}}>
				{title}
			</div>
			<div
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					gap: 6,
				}}>
				{Object.entries(data).map(([k, v]) => {
					const value =
						truncate && v.length > 80 ? v.slice(0, 77) + '...' : v;
					return (
						<span
							key={k}
							title={`${k}=${v}`}
							style={{
								fontSize: '0.7rem',
								padding: '2px 8px',
								borderRadius: 4,
								background: 'rgba(139, 92, 246, 0.08)',
								border: '1px solid rgba(139, 92, 246, 0.2)',
								color: 'var(--sl-color-text, #e6edf3)',
								fontFamily: 'var(--sl-font-mono, monospace)',
							}}>
							{k}={value}
						</span>
					);
				})}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Manifest viewer
// ---------------------------------------------------------------------------

function CodeBlock({ children }: { children: string }) {
	return (
		<pre
			style={{
				background: 'var(--sl-color-bg-inline-code, #0d1117)',
				color: 'var(--sl-color-text, #e6edf3)',
				padding: '0.75rem',
				borderRadius: 6,
				border: '1px solid var(--sl-color-gray-5, #262626)',
				fontSize: '0.75rem',
				fontFamily: 'var(--sl-font-mono, monospace)',
				maxHeight: '420px',
				overflow: 'auto',
				whiteSpace: 'pre',
				margin: 0,
			}}>
			{children}
		</pre>
	);
}

// ---------------------------------------------------------------------------
// Events tab
// ---------------------------------------------------------------------------

export function EventsList({ events }: { events: AppEvent[] }) {
	if (events.length === 0) {
		return (
			<div
				style={{
					padding: '1rem',
					color: 'var(--sl-color-gray-3, #8b949e)',
					fontSize: '0.85rem',
				}}>
				No events recorded for this resource
			</div>
		);
	}
	const sorted = [...events].sort((a, b) => {
		const ta = new Date(
			a.lastTimestamp ?? a.eventTime ?? a.firstTimestamp ?? 0,
		).getTime();
		const tb = new Date(
			b.lastTimestamp ?? b.eventTime ?? b.firstTimestamp ?? 0,
		).getTime();
		return tb - ta;
	});
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
			{sorted.map((e, i) => {
				const ts =
					e.lastTimestamp ?? e.eventTime ?? e.firstTimestamp ?? '';
				const isWarn = e.type === 'Warning';
				return (
					<div
						key={`${e.metadata?.uid ?? i}`}
						style={{
							padding: '0.5rem 0.75rem',
							borderRadius: 6,
							background: isWarn
								? 'rgba(245, 158, 11, 0.06)'
								: 'rgba(34, 197, 94, 0.04)',
							border: `1px solid ${isWarn ? 'rgba(245, 158, 11, 0.25)' : 'rgba(34, 197, 94, 0.18)'}`,
						}}>
						<div
							style={{
								display: 'flex',
								gap: 8,
								alignItems: 'center',
								marginBottom: 2,
								fontSize: '0.75rem',
							}}>
							<span
								style={{
									color: isWarn ? '#fbbf24' : '#22c55e',
									fontWeight: 600,
								}}>
								{e.reason ?? '(no reason)'}
							</span>
							{e.count && e.count > 1 && (
								<span
									style={{
										color: 'var(--sl-color-gray-4, #6b7280)',
										fontSize: '0.7rem',
									}}>
									×{e.count}
								</span>
							)}
							<span
								style={{
									marginLeft: 'auto',
									color: 'var(--sl-color-gray-4, #6b7280)',
									fontSize: '0.7rem',
								}}>
								{ts ? new Date(ts).toLocaleString() : ''}
							</span>
						</div>
						<div
							style={{
								color: 'var(--sl-color-text, #e6edf3)',
								fontSize: '0.8rem',
								wordBreak: 'break-word',
							}}>
							{e.message ?? ''}
						</div>
						{e.source?.component && (
							<div
								style={{
									color: 'var(--sl-color-gray-4, #6b7280)',
									fontSize: '0.7rem',
									marginTop: 2,
								}}>
								source: {e.source.component}
								{e.source.host ? ` (${e.source.host})` : ''}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

function DiffTab({
	sel,
	managed,
}: {
	sel: ResourceSelector;
	managed: ManagedResource | null;
}) {
	if (!managed) {
		return (
			<div
				style={{
					padding: '1rem',
					color: 'var(--sl-color-gray-3, #8b949e)',
					fontSize: '0.85rem',
				}}>
				Resource not managed by Argo (no diff available)
			</div>
		);
	}

	const live = useMemo(() => {
		if (!managed.liveState) return null;
		try {
			return JSON.parse(managed.liveState);
		} catch {
			return null;
		}
	}, [managed.liveState]);

	const target = useMemo(() => {
		if (!managed.targetState) return null;
		try {
			return JSON.parse(managed.targetState);
		} catch {
			return null;
		}
	}, [managed.targetState]);

	if (!live && !target) {
		return (
			<div
				style={{
					padding: '1rem',
					color: 'var(--sl-color-gray-3, #8b949e)',
					fontSize: '0.85rem',
				}}>
				No live or target state available
			</div>
		);
	}

	return (
		<div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: '1fr 1fr',
					gap: '0.5rem',
				}}>
				<div>
					<div
						style={{
							fontSize: '0.7rem',
							fontWeight: 600,
							color: '#22c55e',
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
							marginBottom: 4,
						}}>
						Live (cluster)
					</div>
					<CodeBlock>{live ? toYaml(live) : '(missing)'}</CodeBlock>
				</div>
				<div>
					<div
						style={{
							fontSize: '0.7rem',
							fontWeight: 600,
							color: '#8b5cf6',
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
							marginBottom: 4,
						}}>
						Target (desired)
					</div>
					<CodeBlock>
						{target ? toYaml(target) : '(missing)'}
					</CodeBlock>
				</div>
			</div>
			{managed.requiresPruning && (
				<div
					style={{
						marginTop: '0.5rem',
						padding: '0.5rem 0.75rem',
						borderRadius: 6,
						background: 'rgba(245, 158, 11, 0.08)',
						border: '1px solid rgba(245, 158, 11, 0.3)',
						color: '#fbbf24',
						fontSize: '0.75rem',
					}}>
					Pruning required — this {sel.kind} exists in the cluster but
					is no longer in the desired state
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Logs (Pod kind only)
// ---------------------------------------------------------------------------

function LogsTab({
	token,
	sel,
	manifest,
}: {
	token: string;
	sel: ResourceSelector;
	manifest: Record<string, unknown> | null;
}) {
	const containers = useMemo(() => {
		const spec = (manifest?.spec as Record<string, unknown>) ?? {};
		const list = (spec.containers as Array<{ name: string }>) ?? [];
		const init = (spec.initContainers as Array<{ name: string }>) ?? [];
		return [...list.map((c) => c.name), ...init.map((c) => c.name)];
	}, [manifest]);

	const [container, setContainer] = useState<string>('');
	const [tailLines, setTailLines] = useState<number>(200);
	const [logs, setLogs] = useState<LogLine[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (containers.length > 0 && !container) {
			setContainer(containers[0]);
		}
	}, [containers, container]);

	const load = async () => {
		try {
			setLoading(true);
			setError(null);
			const result = await fetchPodLogs(token, sel.appName, sel.name, {
				namespace: sel.namespace,
				container: container || undefined,
				tailLines,
			});
			setLogs(result);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : 'Failed to load logs');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (container) load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [container, tailLines]);

	return (
		<div>
			<div
				style={{
					display: 'flex',
					gap: 8,
					marginBottom: 8,
					alignItems: 'center',
					flexWrap: 'wrap',
				}}>
				{containers.length > 0 && (
					<select
						value={container}
						onChange={(e) => setContainer(e.target.value)}
						style={{
							background: 'var(--sl-color-bg-nav, #111)',
							color: 'var(--sl-color-text, #e6edf3)',
							border: '1px solid var(--sl-color-gray-5, #262626)',
							borderRadius: 6,
							padding: '4px 8px',
							fontSize: '0.8rem',
						}}>
						{containers.map((c) => (
							<option key={c} value={c}>
								{c}
							</option>
						))}
					</select>
				)}
				<select
					value={tailLines}
					onChange={(e) => setTailLines(Number(e.target.value))}
					style={{
						background: 'var(--sl-color-bg-nav, #111)',
						color: 'var(--sl-color-text, #e6edf3)',
						border: '1px solid var(--sl-color-gray-5, #262626)',
						borderRadius: 6,
						padding: '4px 8px',
						fontSize: '0.8rem',
					}}>
					{[100, 200, 500, 1000].map((n) => (
						<option key={n} value={n}>
							Last {n} lines
						</option>
					))}
				</select>
				<button
					onClick={load}
					disabled={loading}
					style={{
						background: 'rgba(139, 92, 246, 0.12)',
						color: '#c4b5fd',
						border: '1px solid rgba(139, 92, 246, 0.3)',
						borderRadius: 6,
						padding: '4px 10px',
						fontSize: '0.75rem',
						cursor: loading ? 'wait' : 'pointer',
					}}>
					{loading ? 'Loading...' : 'Refresh'}
				</button>
			</div>
			{error && (
				<div
					style={{
						padding: '0.5rem 0.75rem',
						color: '#ef4444',
						fontSize: '0.8rem',
						marginBottom: 8,
					}}>
					{error}
				</div>
			)}
			{logs.length === 0 && !loading && !error ? (
				<div
					style={{
						padding: '1rem',
						color: 'var(--sl-color-gray-3, #8b949e)',
						fontSize: '0.85rem',
					}}>
					No log lines
				</div>
			) : (
				<pre
					style={{
						background: 'var(--sl-color-bg-inline-code, #0d1117)',
						color: 'var(--sl-color-text, #e6edf3)',
						padding: '0.75rem',
						borderRadius: 6,
						border: '1px solid var(--sl-color-gray-5, #262626)',
						fontSize: '0.72rem',
						fontFamily: 'var(--sl-font-mono, monospace)',
						maxHeight: '420px',
						overflow: 'auto',
						whiteSpace: 'pre-wrap',
						wordBreak: 'break-all',
						margin: 0,
						lineHeight: 1.4,
					}}>
					{logs
						.map((l) => {
							const ts = l.timeStamp
								? new Date(l.timeStamp).toLocaleTimeString()
								: '';
							return ts ? `[${ts}] ${l.content}` : l.content;
						})
						.join('\n')}
				</pre>
			)}
		</div>
	);
}

function IndexedLogsTab({
	token,
	sel,
	isPod,
}: {
	token: string;
	sel: ResourceSelector;
	isPod: boolean;
}) {
	const [rows, setRows] = useState<LogRow[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [minutes, setMinutes] = useState<number>(60);
	const [level, setLevel] = useState<string>('');
	const [search, setSearch] = useState<string>('');

	const load = async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await fetchIndexedLogs(token, {
				namespace: sel.namespace || undefined,
				podName: isPod ? sel.name : undefined,
				level: level || undefined,
				search: search || undefined,
				minutes,
				limit: 500,
			});
			setRows(data);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : 'Failed to load');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, [token, sel.appName, sel.namespace, sel.name, isPod, minutes, level]);

	return (
		<div>
			<div
				style={{
					display: 'flex',
					gap: 8,
					marginBottom: 8,
					alignItems: 'center',
					flexWrap: 'wrap',
				}}>
				<span
					style={{
						fontSize: '0.7rem',
						color: 'var(--sl-color-gray-3, #8b949e)',
					}}>
					{isPod
						? `pod=${sel.name}`
						: `namespace=${sel.namespace || '(cluster)'}`}
				</span>
				<select
					value={minutes}
					onChange={(e) => setMinutes(Number(e.target.value))}
					style={selectStyle}>
					{[
						[15, '15m'],
						[60, '1h'],
						[360, '6h'],
						[1440, '24h'],
						[10080, '7d'],
					].map(([m, label]) => (
						<option key={m} value={m}>
							{label}
						</option>
					))}
				</select>
				<select
					value={level}
					onChange={(e) => setLevel(e.target.value)}
					style={selectStyle}>
					<option value="">All levels</option>
					<option value="error">error</option>
					<option value="warn">warn</option>
					<option value="info">info</option>
					<option value="debug">debug</option>
				</select>
				<input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') load();
					}}
					placeholder="search message..."
					style={{
						...selectStyle,
						minWidth: 180,
						flex: '1 1 200px',
					}}
				/>
				<button
					onClick={load}
					disabled={loading}
					style={{
						background: 'rgba(139, 92, 246, 0.12)',
						color: '#c4b5fd',
						border: '1px solid rgba(139, 92, 246, 0.3)',
						borderRadius: 6,
						padding: '4px 10px',
						fontSize: '0.75rem',
						cursor: loading ? 'wait' : 'pointer',
					}}>
					{loading ? 'Loading...' : 'Refresh'}
				</button>
			</div>
			{error && (
				<div
					style={{
						padding: '0.5rem 0.75rem',
						color: '#ef4444',
						fontSize: '0.8rem',
						marginBottom: 8,
					}}>
					{error}
				</div>
			)}
			{rows.length === 0 && !loading && !error ? (
				<div
					style={{
						padding: '1rem',
						color: 'var(--sl-color-gray-3, #8b949e)',
						fontSize: '0.85rem',
					}}>
					No indexed log lines for this filter
				</div>
			) : (
				<div
					style={{
						background: 'var(--sl-color-bg-inline-code, #0d1117)',
						borderRadius: 6,
						border: '1px solid var(--sl-color-gray-5, #262626)',
						maxHeight: 420,
						overflow: 'auto',
						fontFamily: 'var(--sl-font-mono, monospace)',
						fontSize: '0.72rem',
						lineHeight: 1.4,
					}}>
					{rows.map((r, i) => {
						const ts = r.timestamp
							? new Date(r.timestamp).toLocaleTimeString()
							: '';
						const lvl = String(r.level ?? '').toLowerCase();
						const lvlColor =
							lvl === 'error'
								? '#ef4444'
								: lvl === 'warn'
									? '#fbbf24'
									: lvl === 'debug'
										? '#94a3b8'
										: '#22c55e';
						return (
							<div
								key={i}
								style={{
									padding: '4px 8px',
									borderBottom:
										i < rows.length - 1
											? '1px solid rgba(255,255,255,0.03)'
											: 'none',
									display: 'grid',
									gridTemplateColumns: '80px 60px 100px 1fr',
									gap: 8,
									alignItems: 'baseline',
								}}>
								<span
									style={{
										color: 'var(--sl-color-gray-4, #6b7280)',
									}}>
									{ts}
								</span>
								<span
									style={{
										color: lvlColor,
										fontWeight: 600,
										textTransform: 'uppercase',
										fontSize: '0.65rem',
									}}>
									{r.level ?? ''}
								</span>
								<span
									style={{
										color: 'var(--sl-color-gray-4, #6b7280)',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap',
									}}
									title={r.pod_name ?? ''}>
									{r.pod_name ?? ''}
								</span>
								<span
									style={{
										color: 'var(--sl-color-text, #e6edf3)',
										whiteSpace: 'pre-wrap',
										wordBreak: 'break-word',
									}}>
									{r.message ?? ''}
								</span>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

const selectStyle: React.CSSProperties = {
	background: 'var(--sl-color-bg-nav, #111)',
	color: 'var(--sl-color-text, #e6edf3)',
	border: '1px solid var(--sl-color-gray-5, #262626)',
	borderRadius: 6,
	padding: '4px 8px',
	fontSize: '0.8rem',
};

function ContainersTab({
	containerStatuses,
	initContainerStatuses,
}: {
	containerStatuses: Array<Record<string, unknown>>;
	initContainerStatuses: Array<Record<string, unknown>>;
}) {
	const renderRow = (cs: Record<string, unknown>, isInit: boolean) => {
		const name = cs.name as string;
		const ready = cs.ready as boolean | undefined;
		const started = cs.started as boolean | undefined;
		const restartCount = cs.restartCount as number | undefined;
		const image = cs.image as string | undefined;
		const state = (cs.state as Record<string, unknown>) ?? {};
		const lastState = (cs.lastState as Record<string, unknown>) ?? {};

		const stateName = Object.keys(state)[0] ?? 'unknown';
		const stateInfo = state[stateName] as
			| Record<string, unknown>
			| undefined;
		const stateColor =
			stateName === 'running'
				? '#22c55e'
				: stateName === 'waiting'
					? '#fbbf24'
					: '#ef4444';

		const lastStateName = Object.keys(lastState)[0];
		const lastInfo = lastStateName
			? (lastState[lastStateName] as Record<string, unknown>)
			: undefined;

		return (
			<div
				key={`${isInit ? 'init-' : ''}${name}`}
				style={{
					padding: '0.6rem 0.75rem',
					borderRadius: 6,
					background: 'var(--sl-color-bg, #0d1117)',
					border: '1px solid var(--sl-color-gray-5, #262626)',
					marginBottom: 6,
				}}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						marginBottom: 4,
						fontSize: '0.85rem',
					}}>
					{isInit && (
						<span
							style={{
								fontSize: '0.65rem',
								padding: '1px 6px',
								borderRadius: 3,
								background: 'rgba(148, 163, 184, 0.12)',
								color: '#94a3b8',
								fontWeight: 600,
							}}>
							INIT
						</span>
					)}
					<span
						style={{
							fontWeight: 600,
							color: 'var(--sl-color-text, #e6edf3)',
						}}>
						{name}
					</span>
					<span
						style={{
							fontSize: '0.7rem',
							padding: '1px 8px',
							borderRadius: 3,
							color: stateColor,
							background: `${stateColor}18`,
							border: `1px solid ${stateColor}30`,
							fontWeight: 600,
							textTransform: 'uppercase',
						}}>
						{stateName}
					</span>
					{ready !== undefined && (
						<span
							style={{
								fontSize: '0.7rem',
								color: ready ? '#22c55e' : '#ef4444',
							}}>
							ready: {ready ? 'true' : 'false'}
						</span>
					)}
					{started !== undefined && (
						<span
							style={{
								fontSize: '0.7rem',
								color: started ? '#22c55e' : '#fbbf24',
							}}>
							started: {started ? 'true' : 'false'}
						</span>
					)}
					{restartCount !== undefined && restartCount > 0 && (
						<span
							style={{
								marginLeft: 'auto',
								fontSize: '0.7rem',
								color: restartCount > 5 ? '#ef4444' : '#fbbf24',
								fontWeight: 600,
							}}>
							restarts: {restartCount}
						</span>
					)}
				</div>
				{image && (
					<div
						style={{
							fontSize: '0.7rem',
							color: 'var(--sl-color-gray-4, #6b7280)',
							fontFamily: 'var(--sl-font-mono, monospace)',
							marginBottom: 4,
							wordBreak: 'break-all',
						}}>
						{image}
					</div>
				)}
				{stateInfo && Object.keys(stateInfo).length > 0 && (
					<div
						style={{
							fontSize: '0.72rem',
							color: 'var(--sl-color-gray-3, #8b949e)',
							marginTop: 4,
						}}>
						{stateInfo.reason ? (
							<>
								<span
									style={{
										color: stateColor,
										fontWeight: 600,
									}}>
									{String(stateInfo.reason)}
								</span>
								{stateInfo.message
									? `: ${String(stateInfo.message)}`
									: ''}
							</>
						) : stateInfo.startedAt ? (
							<>started {String(stateInfo.startedAt)}</>
						) : null}
					</div>
				)}
				{lastInfo && lastInfo.reason && (
					<div
						style={{
							marginTop: 4,
							fontSize: '0.7rem',
							color: '#fca5a5',
						}}>
						last {lastStateName}: {String(lastInfo.reason)}
						{lastInfo.exitCode !== undefined
							? ` (exit ${String(lastInfo.exitCode)})`
							: ''}
						{lastInfo.message
							? ` — ${String(lastInfo.message)}`
							: ''}
					</div>
				)}
			</div>
		);
	};

	return (
		<div>
			{initContainerStatuses.length > 0 && (
				<div style={{ marginBottom: 8 }}>
					<div
						style={{
							fontSize: '0.7rem',
							fontWeight: 600,
							color: 'var(--sl-color-gray-3, #8b949e)',
							marginBottom: 4,
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
						}}>
						Init Containers
					</div>
					{initContainerStatuses.map((c) => renderRow(c, true))}
				</div>
			)}
			<div
				style={{
					fontSize: '0.7rem',
					fontWeight: 600,
					color: 'var(--sl-color-gray-3, #8b949e)',
					marginBottom: 4,
					textTransform: 'uppercase',
					letterSpacing: '0.05em',
				}}>
				Containers
			</div>
			{containerStatuses.map((c) => renderRow(c, false))}
		</div>
	);
}

function ConditionsTab({
	conditions,
}: {
	conditions: Array<Record<string, unknown>>;
}) {
	if (conditions.length === 0) {
		return (
			<div
				style={{
					padding: '1rem',
					color: 'var(--sl-color-gray-3, #8b949e)',
					fontSize: '0.85rem',
				}}>
				No conditions reported
			</div>
		);
	}
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
			{conditions.map((c, i) => {
				const type = c.type as string;
				const statusVal = c.status as string;
				const reason = c.reason as string | undefined;
				const message = c.message as string | undefined;
				const ts = (c.lastTransitionTime ?? c.lastProbeTime) as
					| string
					| undefined;
				const isTrue = statusVal === 'True';
				const isFalse = statusVal === 'False';
				const color = isTrue
					? '#22c55e'
					: isFalse
						? '#ef4444'
						: '#fbbf24';
				return (
					<div
						key={`${type}-${i}`}
						style={{
							padding: '0.5rem 0.75rem',
							borderRadius: 6,
							background: 'var(--sl-color-bg, #0d1117)',
							border: '1px solid var(--sl-color-gray-5, #262626)',
						}}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								marginBottom: 2,
								fontSize: '0.8rem',
							}}>
							<span
								style={{
									fontWeight: 600,
									color: 'var(--sl-color-text, #e6edf3)',
								}}>
								{type}
							</span>
							<span
								style={{
									fontSize: '0.7rem',
									padding: '1px 8px',
									borderRadius: 3,
									color,
									background: `${color}18`,
									border: `1px solid ${color}30`,
									fontWeight: 600,
								}}>
								{statusVal}
							</span>
							{ts && (
								<span
									style={{
										marginLeft: 'auto',
										color: 'var(--sl-color-gray-4, #6b7280)',
										fontSize: '0.7rem',
									}}>
									{new Date(ts).toLocaleString()}
								</span>
							)}
						</div>
						{(reason || message) && (
							<div
								style={{
									fontSize: '0.75rem',
									color: 'var(--sl-color-gray-3, #8b949e)',
								}}>
								{reason && (
									<span style={{ fontWeight: 600 }}>
										{reason}
									</span>
								)}
								{reason && message ? ': ' : ''}
								{message ?? ''}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

export default function ReactArgoResourceDetail({
	token,
	sel,
	healthMessage,
	onClose,
}: {
	token: string;
	sel: ResourceSelector;
	healthMessage?: string;
	onClose: () => void;
}) {
	const [tab, setTab] = useState<TabId>('summary');
	const [manifest, setManifest] = useState<Record<string, unknown> | null>(
		null,
	);
	const [manifestLoading, setManifestLoading] = useState(true);
	const [manifestError, setManifestError] = useState<string | null>(null);

	const [events, setEvents] = useState<AppEvent[] | null>(null);
	const [eventsLoading, setEventsLoading] = useState(false);
	const [eventsError, setEventsError] = useState<string | null>(null);

	const [managed, setManaged] = useState<ManagedResource | null>(null);
	const [managedLoading, setManagedLoading] = useState(false);
	const [managedError, setManagedError] = useState<string | null>(null);

	const isPod = sel.kind === 'Pod';
	const status = (manifest?.status as Record<string, unknown>) ?? {};
	const conditions = Array.isArray(status.conditions)
		? (status.conditions as Array<Record<string, unknown>>)
		: [];
	const containerStatuses = Array.isArray(status.containerStatuses)
		? (status.containerStatuses as Array<Record<string, unknown>>)
		: [];
	const initContainerStatuses = Array.isArray(status.initContainerStatuses)
		? (status.initContainerStatuses as Array<Record<string, unknown>>)
		: [];

	const tabs: { id: TabId; label: string }[] = [
		{ id: 'summary', label: 'Summary' },
		{ id: 'manifest', label: 'Manifest' },
		...(isPod && (containerStatuses.length || initContainerStatuses.length)
			? [{ id: 'containers' as TabId, label: 'Containers' }]
			: []),
		...(conditions.length
			? [{ id: 'conditions' as TabId, label: 'Conditions' }]
			: []),
		{ id: 'events', label: 'Events' },
		{ id: 'diff', label: 'Diff' },
		...(isPod ? [{ id: 'logs' as TabId, label: 'Logs' }] : []),
		{ id: 'indexed', label: 'Indexed Logs' },
	];

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				setManifestLoading(true);
				setManifestError(null);
				const data = await fetchLiveResource(token, sel);
				if (!cancelled) setManifest(data);
			} catch (e: unknown) {
				if (!cancelled)
					setManifestError(
						e instanceof Error ? e.message : 'Failed to load',
					);
			} finally {
				if (!cancelled) setManifestLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [token, sel.appName, sel.kind, sel.namespace, sel.name, sel.group]);

	useEffect(() => {
		if (tab !== 'events' || events !== null) return;
		let cancelled = false;
		(async () => {
			try {
				setEventsLoading(true);
				setEventsError(null);
				const data = await fetchAppEvents(token, sel.appName, {
					uid:
						sel.uid ??
						((manifest?.metadata as Record<string, unknown>)
							?.uid as string | undefined),
					namespace: sel.namespace,
					name: sel.name,
					kind: sel.kind,
				});
				if (!cancelled) setEvents(data);
			} catch (e: unknown) {
				if (!cancelled)
					setEventsError(
						e instanceof Error ? e.message : 'Failed to load',
					);
			} finally {
				if (!cancelled) setEventsLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [
		tab,
		token,
		sel.appName,
		sel.uid,
		sel.namespace,
		sel.name,
		sel.kind,
		manifest,
		events,
	]);

	useEffect(() => {
		if (tab !== 'diff' || managed !== null || managedError !== null) return;
		let cancelled = false;
		(async () => {
			try {
				setManagedLoading(true);
				setManagedError(null);
				const all = await fetchManagedResources(token, sel.appName);
				const match =
					all.find(
						(m) =>
							m.kind === sel.kind &&
							m.name === sel.name &&
							(m.namespace ?? '') === sel.namespace,
					) ?? null;
				if (!cancelled) setManaged(match);
			} catch (e: unknown) {
				if (!cancelled)
					setManagedError(
						e instanceof Error ? e.message : 'Failed to load',
					);
			} finally {
				if (!cancelled) setManagedLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [
		tab,
		token,
		sel.appName,
		sel.kind,
		sel.namespace,
		sel.name,
		managed,
		managedError,
	]);

	return (
		<div
			style={{
				margin: '0.5rem 0 0.75rem',
				padding: '0.75rem',
				borderRadius: 8,
				background: 'var(--sl-color-bg, #0d1117)',
				border: '1px solid var(--sl-color-gray-5, #262626)',
			}}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					marginBottom: '0.5rem',
				}}>
				<span
					style={{
						fontSize: '0.75rem',
						padding: '2px 8px',
						borderRadius: 4,
						background: 'rgba(139, 92, 246, 0.12)',
						color: '#c4b5fd',
						fontWeight: 600,
					}}>
					{sel.kind}
				</span>
				<span
					style={{
						color: 'var(--sl-color-text, #e6edf3)',
						fontSize: '0.85rem',
						fontWeight: 600,
					}}>
					{sel.namespace ? `${sel.namespace}/` : ''}
					{sel.name}
				</span>
				<button
					onClick={onClose}
					style={{
						marginLeft: 'auto',
						background: 'transparent',
						border: 'none',
						color: 'var(--sl-color-gray-3, #8b949e)',
						cursor: 'pointer',
						padding: 4,
						display: 'flex',
						alignItems: 'center',
					}}
					title="Close">
					<X size={14} />
				</button>
			</div>

			<TabBar tabs={tabs} active={tab} onSelect={setTab} />

			{tab === 'summary' &&
				(manifestLoading ? (
					<FetchState loading error={null} />
				) : manifestError ? (
					<SummaryTab
						sel={sel}
						manifest={null}
						healthMessage={healthMessage ?? manifestError}
					/>
				) : (
					<SummaryTab
						sel={sel}
						manifest={manifest}
						healthMessage={healthMessage}
					/>
				))}

			{tab === 'manifest' &&
				(manifestLoading ? (
					<FetchState loading error={null} />
				) : manifestError ? (
					<FetchState loading={false} error={manifestError} />
				) : manifest ? (
					<CodeBlock>{toYaml(manifest)}</CodeBlock>
				) : (
					<FetchState
						loading={false}
						error={null}
						empty="No manifest"
					/>
				))}

			{tab === 'events' &&
				(eventsLoading || events === null ? (
					<FetchState loading={eventsLoading} error={eventsError} />
				) : eventsError ? (
					<FetchState loading={false} error={eventsError} />
				) : (
					<EventsList events={events} />
				))}

			{tab === 'diff' &&
				(managedLoading ? (
					<FetchState loading error={null} />
				) : managedError ? (
					<FetchState loading={false} error={managedError} />
				) : (
					<DiffTab sel={sel} managed={managed} />
				))}

			{tab === 'logs' && (
				<LogsTab token={token} sel={sel} manifest={manifest} />
			)}

			{tab === 'indexed' && (
				<IndexedLogsTab token={token} sel={sel} isPod={isPod} />
			)}

			{tab === 'containers' && (
				<ContainersTab
					containerStatuses={containerStatuses}
					initContainerStatuses={initContainerStatuses}
				/>
			)}

			{tab === 'conditions' && <ConditionsTab conditions={conditions} />}
		</div>
	);
}
