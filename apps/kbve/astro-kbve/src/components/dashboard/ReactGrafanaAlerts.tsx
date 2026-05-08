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
import { fetchAlerts, grafanaService } from './grafanaService';
import { AlertRow } from './grafanaAlertHelpers';

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
