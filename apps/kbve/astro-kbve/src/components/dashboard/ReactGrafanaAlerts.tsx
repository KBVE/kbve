import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	AlertCircle,
	AlertTriangle,
	BellOff,
	BellRing,
	ChevronDown,
	ChevronUp,
	Loader2,
	RefreshCw,
} from 'lucide-react';
import { fetchAlerts, grafanaService, type Alert } from './grafanaService';

const SEVERITY_COLORS: Record<string, string> = {
	critical: '#ef4444',
	high: '#f97316',
	warning: '#eab308',
	medium: '#eab308',
	info: '#06b6d4',
	low: '#06b6d4',
};

function severityColor(sev: string | undefined): string {
	const key = (sev ?? '').toLowerCase();
	return SEVERITY_COLORS[key] ?? '#8b949e';
}

function relativeTime(iso: string | null): string {
	if (!iso) return 'just now';
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return 'recently';
	const seconds = Math.floor((Date.now() - t) / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function summarizeLabels(a: Alert): string {
	const parts: string[] = [];
	const ns = a.labels.namespace ?? a.labels.kubernetes_namespace;
	const pod = a.labels.pod ?? a.labels.kubernetes_pod_name;
	const svc = a.labels.service ?? a.labels.job;
	if (ns) parts.push(`ns=${ns}`);
	if (pod) parts.push(`pod=${pod}`);
	if (!pod && svc) parts.push(`svc=${svc}`);
	return parts.join(' · ');
}

function AlertRow({ alert }: { alert: Alert }) {
	const sev = (alert.labels.severity ?? '').toLowerCase() || 'unknown';
	const color = severityColor(sev);
	const name = alert.labels.alertname ?? '(unnamed alert)';
	const summary =
		alert.annotations.summary ??
		alert.annotations.description ??
		alert.annotations.message ??
		'';
	const isFiring = alert.state === 'firing';
	const labelLine = summarizeLabels(alert);

	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'flex-start',
				gap: '0.75rem',
				padding: '0.6rem 0.75rem',
				borderRadius: 8,
				border: `1px solid ${isFiring ? color + '55' : 'var(--sl-color-gray-5, #262626)'}`,
				background: isFiring
					? `${color}10`
					: 'var(--sl-color-bg-nav, #111)',
			}}>
			<div
				style={{
					width: 4,
					alignSelf: 'stretch',
					borderRadius: 2,
					background: color,
					flexShrink: 0,
				}}
			/>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.5rem',
						flexWrap: 'wrap',
					}}>
					<span
						style={{
							color: 'var(--sl-color-text, #e6edf3)',
							fontWeight: 600,
							fontSize: '0.85rem',
						}}>
						{name}
					</span>
					<span
						style={{
							padding: '1px 6px',
							borderRadius: 3,
							background: `${color}20`,
							color,
							fontSize: '0.65rem',
							fontWeight: 700,
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
						}}>
						{sev}
					</span>
					<span
						style={{
							padding: '1px 6px',
							borderRadius: 3,
							background:
								alert.state === 'firing'
									? 'rgba(239,68,68,0.15)'
									: 'rgba(234,179,8,0.15)',
							color:
								alert.state === 'firing'
									? '#fca5a5'
									: '#fde68a',
							fontSize: '0.65rem',
							fontWeight: 600,
							textTransform: 'uppercase',
						}}>
						{alert.state}
					</span>
					<span
						style={{
							color: 'var(--sl-color-gray-3, #8b949e)',
							fontSize: '0.7rem',
							marginLeft: 'auto',
						}}>
						{relativeTime(alert.activeAt)}
					</span>
				</div>
				{summary && (
					<div
						style={{
							color: 'var(--sl-color-gray-2, #b3b9c4)',
							fontSize: '0.78rem',
							marginTop: '0.25rem',
							lineHeight: 1.4,
						}}>
						{summary}
					</div>
				)}
				{labelLine && (
					<div
						style={{
							color: 'var(--sl-color-gray-3, #8b949e)',
							fontSize: '0.7rem',
							marginTop: '0.25rem',
							fontFamily:
								'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
						}}>
						{labelLine}
					</div>
				)}
			</div>
		</div>
	);
}

export default function ReactGrafanaAlerts() {
	const accessToken = useStore(grafanaService.$accessToken);
	const userId = useStore(grafanaService.$userId);
	const alerts = useStore(grafanaService.$alerts);
	const firing = useStore(grafanaService.$alertsFiring);
	const pending = useStore(grafanaService.$alertsPending);
	const loaded = useStore(grafanaService.$alertsLoaded);
	const error = useStore(grafanaService.$alertsError);

	const [loading, setLoading] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const [fromCache, setFromCache] = useState(false);

	const refresh = useCallback(
		async (skipCache: boolean) => {
			if (!accessToken || !userId) return;
			setLoading(true);
			grafanaService.$alertsError.set(null);
			try {
				const snap = await fetchAlerts(accessToken, userId, skipCache);
				if (!snap) {
					grafanaService.$alertsError.set(
						'Could not fetch alerts from Grafana',
					);
					return;
				}
				grafanaService.$alerts.set(snap.alerts);
				grafanaService.$alertsFiring.set(snap.firingCount);
				grafanaService.$alertsPending.set(snap.pendingCount);
				grafanaService.$alertsLoaded.set(true);
				setFromCache(snap.fromCache);
			} catch (e: unknown) {
				grafanaService.$alertsError.set(
					e instanceof Error ? e.message : 'Failed to load alerts',
				);
			} finally {
				setLoading(false);
			}
		},
		[accessToken, userId],
	);

	useEffect(() => {
		if (accessToken && userId && !loaded) {
			refresh(false);
		}
	}, [accessToken, userId, loaded, refresh]);

	if (!accessToken || !userId) return null;

	const hasIssues = firing > 0 || pending > 0;
	const headerColor =
		firing > 0 ? '#ef4444' : pending > 0 ? '#eab308' : '#22c55e';
	const HeaderIcon =
		firing > 0 ? BellRing : pending > 0 ? AlertTriangle : BellOff;

	return (
		<section
			style={{
				borderRadius: 12,
				border: `1px solid ${hasIssues ? headerColor + '55' : 'var(--sl-color-gray-5, #262626)'}`,
				background: hasIssues
					? `${headerColor}08`
					: 'var(--sl-color-bg-nav, #111)',
				overflow: 'hidden',
			}}>
			<button
				onClick={() => setExpanded((v) => !v)}
				style={{
					width: '100%',
					display: 'flex',
					alignItems: 'center',
					gap: '0.6rem',
					padding: '0.75rem 1rem',
					background: 'transparent',
					border: 'none',
					cursor: 'pointer',
					color: 'var(--sl-color-text, #e6edf3)',
				}}>
				<HeaderIcon size={18} style={{ color: headerColor }} />
				<span style={{ fontSize: '1rem', fontWeight: 600 }}>
					Alerts
				</span>
				<div
					style={{
						display: 'flex',
						gap: '0.4rem',
						marginLeft: '0.25rem',
					}}>
					{firing > 0 && (
						<span
							style={{
								padding: '1px 8px',
								borderRadius: 3,
								background: 'rgba(239,68,68,0.15)',
								color: '#fca5a5',
								fontSize: '0.7rem',
								fontWeight: 700,
								textTransform: 'uppercase',
							}}>
							{firing} firing
						</span>
					)}
					{pending > 0 && (
						<span
							style={{
								padding: '1px 8px',
								borderRadius: 3,
								background: 'rgba(234,179,8,0.15)',
								color: '#fde68a',
								fontSize: '0.7rem',
								fontWeight: 700,
								textTransform: 'uppercase',
							}}>
							{pending} pending
						</span>
					)}
					{!hasIssues && loaded && (
						<span
							style={{
								padding: '1px 8px',
								borderRadius: 3,
								background: 'rgba(34,197,94,0.15)',
								color: '#86efac',
								fontSize: '0.7rem',
								fontWeight: 700,
								textTransform: 'uppercase',
							}}>
							all clear
						</span>
					)}
				</div>
				{fromCache && (
					<span
						style={{
							padding: '1px 6px',
							borderRadius: 3,
							background: 'var(--sl-color-gray-6, #1c1c1c)',
							color: 'var(--sl-color-gray-3, #8b949e)',
							fontSize: '0.65rem',
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
						}}>
						cached
					</span>
				)}
				<button
					onClick={(e) => {
						e.stopPropagation();
						refresh(true);
					}}
					disabled={loading}
					title="Refresh alerts"
					style={{
						marginLeft: 'auto',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						width: 28,
						height: 28,
						borderRadius: 6,
						border: '1px solid var(--sl-color-gray-5, #262626)',
						background: 'var(--sl-color-bg-nav, #111)',
						color: 'var(--sl-color-text, #e6edf3)',
						cursor: loading ? 'wait' : 'pointer',
					}}>
					<RefreshCw
						size={13}
						style={
							loading
								? { animation: 'spin 1s linear infinite' }
								: undefined
						}
					/>
				</button>
				{expanded ? (
					<ChevronUp
						size={16}
						style={{ color: 'var(--sl-color-gray-3, #8b949e)' }}
					/>
				) : (
					<ChevronDown
						size={16}
						style={{ color: 'var(--sl-color-gray-3, #8b949e)' }}
					/>
				)}
			</button>

			{expanded && (
				<div
					style={{
						padding: '0.5rem 0.75rem 0.85rem',
						display: 'flex',
						flexDirection: 'column',
						gap: '0.5rem',
						borderTop: '1px solid var(--sl-color-gray-5, #262626)',
					}}>
					{loading && alerts.length === 0 && (
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								padding: '0.75rem 0.25rem',
								color: 'var(--sl-color-gray-3, #8b949e)',
								fontSize: '0.85rem',
							}}>
							<Loader2
								size={14}
								style={{ animation: 'spin 1s linear infinite' }}
							/>
							Loading alerts...
						</div>
					)}
					{error && (
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 6,
								padding: '0.5rem 0.6rem',
								borderRadius: 6,
								background: 'rgba(239,68,68,0.1)',
								border: '1px solid rgba(239,68,68,0.3)',
								color: '#fca5a5',
								fontSize: '0.8rem',
							}}>
							<AlertCircle size={14} />
							{error}
						</div>
					)}
					{!loading && !error && alerts.length === 0 && loaded && (
						<div
							style={{
								padding: '0.65rem 0.5rem',
								color: 'var(--sl-color-gray-3, #8b949e)',
								fontSize: '0.85rem',
							}}>
							No alerts firing or pending — cluster is clean.
						</div>
					)}
					{alerts.map((a, i) => (
						<AlertRow
							key={`${a.labels.alertname ?? 'alert'}-${i}`}
							alert={a}
						/>
					))}
				</div>
			)}
		</section>
	);
}
