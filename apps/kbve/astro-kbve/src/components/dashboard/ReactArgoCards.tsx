import React from 'react';
import { useStore } from '@nanostores/react';
import {
	argoService,
	healthColor,
	syncColor,
	formatAge,
	type AppSummary,
	type ResourceTally,
	type ArgoApplication,
	type CardFilter,
	type CardGroupBy,
} from './argoService';
import {
	AppExpandedPanel,
	AppActionBar,
	StatusBadge,
	healthIcon,
	syncIcon,
} from './ReactArgoAppTable';
import {
	Clock,
	GitBranch,
	RefreshCw,
	RotateCw,
	Loader2,
	AlertTriangle,
	Search,
} from 'lucide-react';

function ResourceBar({ tally }: { tally: ResourceTally }) {
	const total = tally.total;
	if (!total) {
		return (
			<div
				style={{
					fontSize: '0.7rem',
					color: 'var(--sl-color-gray-4, #6b7280)',
				}}>
				no tracked resources
			</div>
		);
	}
	const bad = tally.degraded + tally.missing;
	const seg = (n: number, color: string, key: string) =>
		n > 0 ? (
			<div
				key={key}
				title={`${key}: ${n}`}
				style={{
					width: `${(n / total) * 100}%`,
					minWidth: 3,
					background: color,
					height: '100%',
				}}
			/>
		) : null;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
			<div
				style={{
					display: 'flex',
					gap: 1,
					height: 10,
					width: '100%',
					borderRadius: 5,
					overflow: 'hidden',
					background: 'var(--sl-color-gray-6, #1c1c1c)',
				}}>
				{seg(tally.healthy, '#22c55e', 'h')}
				{seg(tally.progressing, '#f59e0b', 'p')}
				{seg(bad, '#ef4444', 'b')}
				{seg(tally.suspended, '#6b7280', 's')}
			</div>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 6,
					fontSize: '0.75rem',
					color: 'var(--sl-color-gray-3, #9ca3af)',
				}}>
				<span>{total} res</span>
				{bad > 0 && (
					<span
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 3,
							color: '#ef4444',
							fontWeight: 600,
						}}>
						<AlertTriangle size={10} />
						{bad} unhealthy
					</span>
				)}
				{tally.progressing > 0 && (
					<span style={{ color: '#f59e0b' }}>
						{tally.progressing} progressing
					</span>
				)}
			</div>
		</div>
	);
}

// Subscribe to only this card's slice of $actionBusy so a sync on one card
// re-renders that card's action bar alone, not every card in the grid.
function useCardBusy(name: string): { syncing: boolean; refreshing: boolean } {
	const [state, setState] = React.useState(() => {
		const b = argoService.$actionBusy.get();
		return {
			syncing: b === `${name}:sync`,
			refreshing: b === `${name}:refresh`,
		};
	});
	React.useEffect(() => {
		const syncKey = `${name}:sync`;
		const refreshKey = `${name}:refresh`;
		return argoService.$actionBusy.subscribe((b) => {
			const next = {
				syncing: b === syncKey,
				refreshing: b === refreshKey,
			};
			setState((prev) =>
				prev.syncing === next.syncing &&
				prev.refreshing === next.refreshing
					? prev
					: next,
			);
		});
	}, [name]);
	return state;
}

function CardActions({ name }: { name: string }) {
	const { syncing, refreshing } = useCardBusy(name);
	const ownBusy = syncing || refreshing;
	const btn: React.CSSProperties = {
		display: 'inline-flex',
		alignItems: 'center',
		gap: 4,
		padding: '0.25rem 0.5rem',
		borderRadius: 5,
		border: '1px solid var(--sl-color-gray-5, #262626)',
		background: 'var(--sl-color-bg, #0d0d0d)',
		color: 'var(--sl-color-gray-2, #c9d1d9)',
		fontSize: '0.7rem',
		fontWeight: 500,
		cursor: ownBusy ? 'wait' : 'pointer',
	};
	const stop = (e: React.MouseEvent) => e.stopPropagation();
	return (
		<div style={{ display: 'flex', gap: 6 }} onClick={stop}>
			<button
				type="button"
				disabled={ownBusy}
				title="Trigger an ArgoCD sync (requires manage permission)"
				onClick={() => argoService.syncApp(name)}
				style={btn}>
				{syncing ? (
					<Loader2
						size={11}
						style={{ animation: 'spin 1s linear infinite' }}
					/>
				) : (
					<RefreshCw size={11} />
				)}
				Sync
			</button>
			<button
				type="button"
				disabled={ownBusy}
				title="Force ArgoCD to re-read the live cluster state"
				onClick={() => argoService.hardRefreshApp(name)}
				style={btn}>
				{refreshing ? (
					<Loader2
						size={11}
						style={{ animation: 'spin 1s linear infinite' }}
					/>
				) : (
					<RotateCw size={11} />
				)}
				Refresh
			</button>
		</div>
	);
}

function shortRepo(repoUrl: string): string {
	if (!repoUrl) return '';
	return repoUrl
		.replace(/^https?:\/\//, '')
		.replace(/^git@/, '')
		.replace(/\.git$/, '')
		.replace(/^github\.com[/:]/, '');
}

function syncAgeMs(s: AppSummary): number | null {
	const ts = s.last_sync_at || s.reconciled_at || s.created_at;
	if (!ts) return null;
	const t = new Date(ts).getTime();
	if (Number.isNaN(t)) return null;
	return Date.now() - t;
}

const AppCard = React.memo(
	AppCardImpl,
	(a, b) => a.summary === b.summary && a.expanded === b.expanded,
);

function AppCardImpl({
	summary,
	expanded,
	onToggle,
}: {
	summary: AppSummary;
	expanded: boolean;
	onToggle: () => void;
}) {
	const health = summary.health?.status ?? 'Unknown';
	const sync = summary.sync?.status ?? 'Unknown';
	const severity =
		health === 'Degraded' || health === 'Missing'
			? 'crit'
			: summary.stalled || health === 'Progressing'
				? 'warn'
				: null;
	const accent =
		severity === 'crit'
			? '#ef4444'
			: severity === 'warn'
				? '#fbbf24'
				: 'var(--sl-color-gray-5, #262626)';
	const age = syncAgeMs(summary);
	const repo = shortRepo(summary.repo_url);

	return (
		<button
			type="button"
			onClick={onToggle}
			id={`argo-app-${summary.name}`}
			aria-expanded={expanded}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 8,
				padding: '0.85rem 0.95rem',
				borderRadius: 10,
				textAlign: 'left',
				font: 'inherit',
				cursor: 'pointer',
				color: 'var(--sl-color-text, #e6edf3)',
				background: expanded
					? 'var(--sl-color-bg-nav, #111)'
					: 'var(--sl-color-bg, #0d0d0d)',
				border: `1px solid ${accent}`,
				borderLeft: `3px solid ${
					severity ? accent : 'var(--sl-color-gray-5, #262626)'
				}`,
				boxShadow: expanded ? '0 0 0 1px rgba(139,92,246,0.4)' : 'none',
				transition: 'background 0.15s, box-shadow 0.15s',
				width: '100%',
			}}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
				<span
					style={{
						width: 9,
						height: 9,
						borderRadius: '50%',
						background: healthColor(health),
						flexShrink: 0,
					}}
				/>
				<span
					style={{
						fontWeight: 600,
						fontSize: '0.92rem',
						minWidth: 0,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}>
					{summary.name}
				</span>
				{summary.stalled && (
					<span
						title={`${summary.stall_reason} for ${formatAge(summary.stall_age_ms)}`}
						style={{
							marginLeft: 'auto',
							display: 'inline-flex',
							alignItems: 'center',
							gap: 3,
							padding: '0 6px',
							borderRadius: 4,
							background: 'rgba(245, 158, 11, 0.12)',
							border: '1px solid rgba(245, 158, 11, 0.35)',
							color: '#fbbf24',
							fontSize: '0.65rem',
							fontWeight: 600,
							textTransform: 'uppercase',
							flexShrink: 0,
						}}>
						<Clock size={10} />
						Stalled
						{summary.stall_age_ms > 0
							? ` ${formatAge(summary.stall_age_ms)}`
							: ''}
					</span>
				)}
			</div>

			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 6,
					fontSize: '0.72rem',
					color: 'var(--sl-color-gray-4, #6b7280)',
					fontFamily: 'var(--sl-font-mono, monospace)',
				}}>
				<span
					style={{
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}>
					{summary.namespace || '—'}
				</span>
				<span>·</span>
				<span
					style={{
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}>
					{summary.project}
				</span>
			</div>

			<div
				style={{
					display: 'flex',
					gap: 6,
					flexWrap: 'wrap',
					alignItems: 'center',
				}}>
				<StatusBadge
					status={sync}
					colorFn={syncColor}
					iconFn={syncIcon}
				/>
				<StatusBadge
					status={health}
					colorFn={healthColor}
					iconFn={healthIcon}
				/>
			</div>

			<ResourceBar tally={summary.resources ?? emptyTally} />

			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					marginTop: 2,
				}}>
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 3,
						fontSize: '0.7rem',
						color: 'var(--sl-color-gray-4, #6b7280)',
					}}>
					<Clock size={11} />
					{age != null ? `${formatAge(age)} ago` : '—'}
				</span>
				{repo && (
					<span
						title={summary.repo_url}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 3,
							fontSize: '0.7rem',
							color: 'var(--sl-color-gray-4, #6b7280)',
							minWidth: 0,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}>
						<GitBranch size={11} />
						{repo}
					</span>
				)}
				<span style={{ marginLeft: 'auto' }}>
					<CardActions name={summary.name} />
				</span>
			</div>
		</button>
	);
}

const emptyTally: ResourceTally = {
	total: 0,
	healthy: 0,
	degraded: 0,
	progressing: 0,
	missing: 0,
	suspended: 0,
	synced: 0,
	out_of_sync: 0,
};

function FilterChip({
	label,
	count,
	active,
	tone,
	onClick,
}: {
	label: string;
	count: number;
	active: boolean;
	tone: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 5,
				padding: '3px 10px',
				borderRadius: 999,
				fontSize: '0.73rem',
				fontWeight: 600,
				cursor: 'pointer',
				color: active ? '#0d0d0d' : tone,
				background: active ? tone : 'transparent',
				border: `1px solid ${active ? tone : 'var(--sl-color-gray-5, #262626)'}`,
			}}>
			{label}
			<span
				style={{
					fontVariantNumeric: 'tabular-nums',
					opacity: 0.85,
					fontSize: '0.68rem',
				}}>
				{count}
			</span>
		</button>
	);
}

function CardFilterBar({
	filter,
	search,
	groupBy,
	counts,
}: {
	filter: CardFilter;
	search: string;
	groupBy: CardGroupBy;
	counts: {
		all: number;
		degraded: number;
		outofsync: number;
		stalled: number;
	};
}) {
	const set = (f: CardFilter) =>
		argoService.setCardFilter(filter === f ? 'all' : f);
	return (
		<div
			style={{
				display: 'flex',
				flexWrap: 'wrap',
				alignItems: 'center',
				gap: 8,
				marginBottom: '0.75rem',
			}}>
			<FilterChip
				label="All"
				count={counts.all}
				active={filter === 'all'}
				tone="#8b5cf6"
				onClick={() => argoService.setCardFilter('all')}
			/>
			<FilterChip
				label="Degraded"
				count={counts.degraded}
				active={filter === 'degraded'}
				tone="#ef4444"
				onClick={() => set('degraded')}
			/>
			<FilterChip
				label="OutOfSync"
				count={counts.outofsync}
				active={filter === 'outofsync'}
				tone="#f59e0b"
				onClick={() => set('outofsync')}
			/>
			<FilterChip
				label="Stalled"
				count={counts.stalled}
				active={filter === 'stalled'}
				tone="#fbbf24"
				onClick={() => set('stalled')}
			/>

			<div
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 5,
					marginLeft: 'auto',
					padding: '3px 8px',
					borderRadius: 6,
					border: '1px solid var(--sl-color-gray-5, #262626)',
					background: 'var(--sl-color-bg, #0d0d0d)',
				}}>
				<Search
					size={13}
					style={{ color: 'var(--sl-color-gray-4, #6b7280)' }}
				/>
				<input
					value={search}
					onChange={(e) => argoService.setCardSearch(e.target.value)}
					placeholder="filter by name / namespace / project"
					style={{
						background: 'transparent',
						border: 'none',
						outline: 'none',
						color: 'var(--sl-color-text, #e6edf3)',
						fontSize: '0.75rem',
						width: 220,
						maxWidth: '50vw',
					}}
				/>
			</div>

			<select
				value={groupBy}
				onChange={(e) =>
					argoService.setCardGroupBy(e.target.value as CardGroupBy)
				}
				title="Group cards"
				style={{
					background: 'var(--sl-color-bg-nav, #111)',
					color: 'var(--sl-color-text, #e6edf3)',
					border: '1px solid var(--sl-color-gray-5, #262626)',
					borderRadius: 6,
					padding: '4px 8px',
					fontSize: '0.75rem',
				}}>
				<option value="none">No grouping</option>
				<option value="project">By project</option>
				<option value="namespace">By namespace</option>
			</select>
		</div>
	);
}

function CardGrid({
	summaries,
	expandedApp,
	expandedPanel,
}: {
	summaries: AppSummary[];
	expandedApp: string | null;
	expandedPanel?: React.ReactNode;
}) {
	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
				gap: '0.75rem',
			}}>
			{summaries.map((s) => {
				const isExpanded = expandedApp === s.name;
				return (
					<React.Fragment key={s.name}>
						<AppCard
							summary={s}
							expanded={isExpanded}
							onToggle={() =>
								argoService.toggleExpandedApp(s.name)
							}
						/>
						{isExpanded && expandedPanel && (
							<div style={{ gridColumn: '1 / -1' }}>
								{expandedPanel}
							</div>
						)}
					</React.Fragment>
				);
			})}
		</div>
	);
}

function groupSummaries(
	summaries: AppSummary[],
	groupBy: CardGroupBy,
): { key: string; items: AppSummary[] }[] {
	if (groupBy === 'none') return [{ key: '', items: summaries }];
	const map = new Map<string, AppSummary[]>();
	for (const s of summaries) {
		const k = (groupBy === 'project' ? s.project : s.namespace) || '—';
		const arr = map.get(k) ?? [];
		arr.push(s);
		map.set(k, arr);
	}
	return Array.from(map.entries())
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([key, items]) => ({ key, items }));
}

export default function ReactArgoCards() {
	// Defer the list so a 30s poll re-render yields to clicks/typing.
	const summaries = React.useDeferredValue(
		useStore(argoService.$filteredSummaries),
	);
	const applications = useStore(argoService.$applications);
	const expandedApp = useStore(argoService.$expandedApp);
	const accessToken = useStore(argoService.$accessToken);
	const appTab = useStore(argoService.$appTab);
	const selectedResource = useStore(argoService.$selectedResource);
	const actionError = useStore(argoService.$actionError);
	const actionMsg = useStore(argoService.$actionMsg);
	const filter = useStore(argoService.$cardFilter);
	const search = useStore(argoService.$cardSearch);
	const groupBy = useStore(argoService.$cardGroupBy);
	const totalApps = useStore(argoService.$totalApps);
	const degradedCount = useStore(argoService.$degradedCount);
	const outOfSyncCount = useStore(argoService.$outOfSyncCount);
	const stalledCount = useStore(argoService.$stalledCount);

	if (!applications.length) return null;

	const expandedRaw: ArgoApplication | undefined = expandedApp
		? applications.find((a) => a.metadata.name === expandedApp)
		: undefined;

	const groups = groupSummaries(summaries, groupBy);

	const expandedPanel =
		expandedRaw && accessToken ? (
			<div
				style={{
					borderRadius: 10,
					border: '1px solid var(--sl-color-gray-5, #262626)',
					background: 'var(--sl-color-bg-nav, #111)',
				}}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						padding: '0.65rem 1rem',
						fontWeight: 600,
						fontSize: '0.9rem',
					}}>
					{expandedRaw.metadata.name}
					{(actionMsg || actionError) && (
						<span
							style={{
								marginLeft: 'auto',
								fontSize: '0.75rem',
								color: actionError ? '#fca5a5' : '#22c55e',
							}}>
							{actionError ?? actionMsg}
						</span>
					)}
				</div>
				<AppActionBar app={expandedRaw} />
				<AppExpandedPanel
					app={expandedRaw}
					token={accessToken}
					tab={appTab}
					onTabChange={(t) => argoService.setAppTab(t)}
					selectedResource={selectedResource}
					onSelectResource={(sel) => argoService.selectResource(sel)}
				/>
			</div>
		) : null;

	return (
		<>
			<CardFilterBar
				filter={filter}
				search={search}
				groupBy={groupBy}
				counts={{
					all: totalApps,
					degraded: degradedCount,
					outofsync: outOfSyncCount,
					stalled: stalledCount,
				}}
			/>

			{summaries.length === 0 ? (
				<div
					style={{
						padding: '1.5rem',
						textAlign: 'center',
						color: 'var(--sl-color-gray-4, #6b7280)',
						fontSize: '0.85rem',
					}}>
					No applications match the current filter
				</div>
			) : (
				groups.map((g) => (
					<div key={g.key || 'all'} style={{ marginBottom: '1rem' }}>
						{g.key && (
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 6,
									margin: '0 0 0.5rem',
									fontSize: '0.72rem',
									fontWeight: 700,
									textTransform: 'uppercase',
									letterSpacing: '0.05em',
									color: 'var(--sl-color-gray-3, #8b949e)',
								}}>
								{g.key}
								<span
									style={{
										color: 'var(--sl-color-gray-4, #6b7280)',
									}}>
									({g.items.length})
								</span>
							</div>
						)}
						<CardGrid
							summaries={g.items}
							expandedApp={expandedApp}
							expandedPanel={expandedPanel}
						/>
					</div>
				))
			)}
		</>
	);
}
