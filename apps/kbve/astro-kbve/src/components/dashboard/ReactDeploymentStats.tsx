import { useStore } from '@nanostores/react';
import { deploymentHistoryService } from './deploymentHistoryService';

function formatDate(iso: string | null): string {
	if (!iso) return '—';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString();
}

export default function ReactDeploymentStats() {
	const stats = useStore(deploymentHistoryService.$stats);
	const total = stats?.total_deployments ?? null;
	const live = stats?.live_deployments ?? null;
	const credits = stats?.total_credits_spent ?? null;
	const latest = stats?.latest_deployment_at ?? null;
	return (
		<div className="deploy-history-stats">
			<div className="stat">
				<div className="stat-label">Total</div>
				<div className="stat-value">{total ?? '—'}</div>
			</div>
			<div className="stat">
				<div className="stat-label">Live</div>
				<div className="stat-value">{live ?? '—'}</div>
			</div>
			<div className="stat">
				<div className="stat-label">Credits spent</div>
				<div className="stat-value">
					{credits === null ? '—' : credits.toLocaleString()}
				</div>
			</div>
			<div className="stat">
				<div className="stat-label">Latest</div>
				<div className="stat-value small">{formatDate(latest)}</div>
			</div>
		</div>
	);
}
