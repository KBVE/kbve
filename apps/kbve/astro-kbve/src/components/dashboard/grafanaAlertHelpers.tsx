import type { Alert } from './grafanaService';

const SEVERITY_COLORS: Record<string, string> = {
	critical: '#ef4444',
	high: '#f97316',
	warning: '#eab308',
	medium: '#eab308',
	info: '#06b6d4',
	low: '#06b6d4',
};

export function severityColor(sev: string | undefined): string {
	const key = (sev ?? '').toLowerCase();
	return SEVERITY_COLORS[key] ?? '#8b949e';
}

export function relativeTime(iso: string | null): string {
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

export function summarizeLabels(a: Alert): string {
	const parts: string[] = [];
	const ns = a.labels.namespace ?? a.labels.kubernetes_namespace;
	const pod = a.labels.pod ?? a.labels.kubernetes_pod_name;
	const svc = a.labels.service ?? a.labels.job;
	if (ns) parts.push(`ns=${ns}`);
	if (pod) parts.push(`pod=${pod}`);
	if (!pod && svc) parts.push(`svc=${svc}`);
	return parts.join(' · ');
}

/** True when an alert's labels mention the given pod (or its namespace,
 * if no pod label is set on the alert). Used by ReactArgoGrafanaPanel
 * to scope the global alerts list down to the resource being inspected. */
export function alertMatchesPod(a: Alert, ns: string, pod: string): boolean {
	const aNs = a.labels.namespace ?? a.labels.kubernetes_namespace ?? '';
	if (aNs && aNs !== ns) return false;

	const aPod = a.labels.pod ?? a.labels.kubernetes_pod_name ?? '';
	if (aPod) return aPod === pod;

	// Alerts without a pod label still surface if the namespace matches —
	// covers cluster-level rules that fire about a namespace as a whole.
	return aNs === ns;
}

/** True when an alert's labels match the given namespace (any pod). Used
 * for non-Pod kinds in the Argo drawer Grafana tab. */
export function alertMatchesNamespace(a: Alert, ns: string): boolean {
	const aNs = a.labels.namespace ?? a.labels.kubernetes_namespace ?? '';
	return aNs === ns;
}

export function AlertRow({ alert }: { alert: Alert }) {
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
