import { useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { motion } from 'framer-motion';
import { RefreshCw, History, Filter } from 'lucide-react';
import { vmService } from './vmService';
import {
	deploymentHistoryService,
	type DeploymentRow,
} from './deploymentHistoryService';

function formatDate(iso: string | null): string {
	if (!iso) return '—';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString();
}

function statusBadge(row: DeploymentRow): {
	label: string;
	tone: 'live' | 'destroyed' | 'unsettled';
} {
	if (row.destroyed_at === null) return { label: 'live', tone: 'live' };
	if (row.settled_ledger_id === null)
		return { label: row.destroy_reason ?? 'destroyed', tone: 'unsettled' };
	return { label: row.destroy_reason ?? 'destroyed', tone: 'destroyed' };
}

export default function ReactDeploymentHistory() {
	const token = useStore(vmService.$accessToken);
	const loading = useStore(deploymentHistoryService.$loading);
	const error = useStore(deploymentHistoryService.$error);
	const rows = useStore(deploymentHistoryService.$rows);
	const stats = useStore(deploymentHistoryService.$stats);
	const liveOnly = useStore(deploymentHistoryService.$liveOnly);

	useEffect(() => {
		if (!token) return;
		void deploymentHistoryService.refresh(token);
	}, [token]);

	const totalCredits = useMemo(
		() => stats?.total_credits_spent ?? 0,
		[stats],
	);

	if (!token) {
		return (
			<div className="deploy-history-empty">
				<History size={18} />
				<span>Sign in to view deployment history.</span>
			</div>
		);
	}

	return (
		<section
			className="deploy-history not-content"
			aria-label="Firecracker deployment history">
			<header className="deploy-history-head">
				<div className="deploy-history-title">
					<History size={18} />
					<h2>Your Deployments</h2>
				</div>
				<div className="deploy-history-controls">
					<label className="deploy-history-filter">
						<input
							type="checkbox"
							checked={liveOnly}
							onChange={(e) => {
								deploymentHistoryService.$liveOnly.set(
									e.target.checked,
								);
								if (token)
									void deploymentHistoryService.refresh(
										token,
									);
							}}
						/>
						<Filter size={12} />
						Live only
					</label>
					<motion.button
						type="button"
						className="deploy-history-refresh"
						whileTap={{ scale: 0.96 }}
						onClick={() =>
							void deploymentHistoryService.refresh(token)
						}
						disabled={loading}>
						<RefreshCw
							size={14}
							className={loading ? 'spin' : ''}
						/>
						Refresh
					</motion.button>
				</div>
			</header>

			{stats && (
				<div className="deploy-history-stats">
					<div className="stat">
						<div className="stat-label">Total</div>
						<div className="stat-value">
							{stats.total_deployments}
						</div>
					</div>
					<div className="stat">
						<div className="stat-label">Live</div>
						<div className="stat-value">
							{stats.live_deployments}
						</div>
					</div>
					<div className="stat">
						<div className="stat-label">Credits spent</div>
						<div className="stat-value">
							{totalCredits.toLocaleString()}
						</div>
					</div>
					<div className="stat">
						<div className="stat-label">Latest</div>
						<div className="stat-value small">
							{formatDate(stats.latest_deployment_at)}
						</div>
					</div>
				</div>
			)}

			{error && <div className="deploy-history-error">{error}</div>}

			<div className="deploy-history-table-wrap">
				<table className="deploy-history-table">
					<thead>
						<tr>
							<th>VM</th>
							<th>Rootfs</th>
							<th>Port</th>
							<th>Visibility</th>
							<th>Resources</th>
							<th>Created</th>
							<th>Destroyed</th>
							<th>Status</th>
							<th>Credits</th>
						</tr>
					</thead>
					<tbody>
						{rows.length === 0 && !loading && (
							<tr>
								<td colSpan={9} className="empty">
									No deployments yet — deploy one above to
									start your history.
								</td>
							</tr>
						)}
						{rows.map((row) => {
							const badge = statusBadge(row);
							return (
								<tr key={row.id}>
									<td className="mono">{row.vm_id}</td>
									<td className="mono">{row.rootfs}</td>
									<td className="mono">{row.http_port}</td>
									<td>{row.visibility}</td>
									<td className="mono">
										{row.vcpu_count}vCPU /{' '}
										{row.mem_size_mib}MiB
									</td>
									<td className="small">
										{formatDate(row.created_at)}
									</td>
									<td className="small">
										{formatDate(row.destroyed_at)}
									</td>
									<td>
										<span
											className={`badge badge-${badge.tone}`}>
											{badge.label}
										</span>
									</td>
									<td className="mono">
										{row.credits_spent === null
											? '—'
											: row.credits_spent.toLocaleString()}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			<style>{`
				.deploy-history { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; border: 1px solid rgba(255,255,255,0.08); border-radius: 0.5rem; background: rgba(255,255,255,0.02); margin-top: 1rem; }
				.deploy-history-empty { display: inline-flex; align-items: center; gap: 0.5rem; padding: 1rem; border: 1px dashed rgba(255,255,255,0.12); border-radius: 0.5rem; opacity: 0.7; font-size: 0.85rem; }
				.deploy-history-head { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
				.deploy-history-title { display: inline-flex; align-items: center; gap: 0.5rem; }
				.deploy-history-title h2 { margin: 0; font-size: 1rem; }
				.deploy-history-controls { display: inline-flex; align-items: center; gap: 0.5rem; }
				.deploy-history-filter { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; opacity: 0.85; cursor: pointer; }
				.deploy-history-refresh { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.6rem; border: 1px solid rgba(255,255,255,0.12); border-radius: 0.25rem; background: rgba(255,255,255,0.04); color: inherit; cursor: pointer; font: inherit; font-size: 0.8rem; }
				.deploy-history-refresh:disabled { opacity: 0.5; cursor: not-allowed; }
				.deploy-history-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.5rem; }
				.deploy-history-stats .stat { padding: 0.6rem 0.75rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 0.3rem; }
				.deploy-history-stats .stat-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.55; }
				.deploy-history-stats .stat-value { font-size: 1.15rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin-top: 0.15rem; }
				.deploy-history-stats .stat-value.small { font-size: 0.78rem; opacity: 0.85; }
				.deploy-history-error { padding: 0.5rem 0.7rem; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.4); border-radius: 0.25rem; font-size: 0.8rem; }
				.deploy-history-table-wrap { overflow-x: auto; }
				.deploy-history-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
				.deploy-history-table th, .deploy-history-table td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.06); }
				.deploy-history-table th { font-weight: 500; opacity: 0.7; }
				.deploy-history-table td.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
				.deploy-history-table td.small { font-size: 0.72rem; opacity: 0.85; }
				.deploy-history-table td.empty { text-align: center; padding: 1.2rem; opacity: 0.55; }
				.deploy-history-table .badge { display: inline-block; padding: 0.1rem 0.4rem; border-radius: 0.2rem; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
				.badge-live { background: rgba(34,197,94,0.14); border: 1px solid rgba(34,197,94,0.35); color: rgba(134,239,172,0.95); }
				.badge-destroyed { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); opacity: 0.85; }
				.badge-unsettled { background: rgba(245,158,11,0.14); border: 1px solid rgba(245,158,11,0.35); color: rgba(252,211,77,0.95); }
				.spin { animation: deploy-history-spin 1s linear infinite; }
				@keyframes deploy-history-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
			`}</style>
		</section>
	);
}
