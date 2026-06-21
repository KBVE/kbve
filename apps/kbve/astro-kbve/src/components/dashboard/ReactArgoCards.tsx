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
				style={{
					width: `${(n / total) * 100}%`,
					background: color,
					height: '100%',
				}}
			/>
		) : null;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
			<div
				style={{
					display: 'flex',
					height: 6,
					width: '100%',
					borderRadius: 3,
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
					fontSize: '0.7rem',
					color: 'var(--sl-color-gray-4, #6b7280)',
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

function CardActions({ name }: { name: string }) {
	const busy = useStore(argoService.$actionBusy);
	const syncing = busy === `${name}:sync`;
	const refreshing = busy === `${name}:refresh`;
	const anyBusy = busy !== null;
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
		cursor: anyBusy ? 'wait' : 'pointer',
	};
	const stop = (e: React.MouseEvent) => e.stopPropagation();
	return (
		<div style={{ display: 'flex', gap: 6 }} onClick={stop}>
			<button
				type="button"
				disabled={anyBusy}
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
				disabled={anyBusy}
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

function AppCard({
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

export default function ReactArgoCards() {
	const summaries = useStore(argoService.$appSummaries);
	const applications = useStore(argoService.$applications);
	const expandedApp = useStore(argoService.$expandedApp);
	const accessToken = useStore(argoService.$accessToken);
	const appTab = useStore(argoService.$appTab);
	const selectedResource = useStore(argoService.$selectedResource);
	const actionError = useStore(argoService.$actionError);
	const actionMsg = useStore(argoService.$actionMsg);

	if (!summaries.length) return null;

	const expandedRaw: ArgoApplication | undefined = expandedApp
		? applications.find((a) => a.metadata.name === expandedApp)
		: undefined;

	return (
		<>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns:
						'repeat(auto-fill, minmax(280px, 1fr))',
					gap: '0.75rem',
				}}>
				{summaries.map((s) => (
					<AppCard
						key={s.name}
						summary={s}
						expanded={expandedApp === s.name}
						onToggle={() => argoService.toggleExpandedApp(s.name)}
					/>
				))}
			</div>

			{expandedRaw && accessToken && (
				<div
					style={{
						marginTop: '0.75rem',
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
						onSelectResource={(sel) =>
							argoService.selectResource(sel)
						}
					/>
				</div>
			)}
		</>
	);
}
