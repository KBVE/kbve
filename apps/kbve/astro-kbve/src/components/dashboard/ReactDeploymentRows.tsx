import { memo } from 'react';
import { useStore } from '@nanostores/react';
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

interface RowProps {
	row: DeploymentRow;
}

const Row = memo(function Row({ row }: RowProps) {
	const badge = statusBadge(row);
	return (
		<tr>
			<td className="mono">{row.vm_id}</td>
			<td className="mono">{row.rootfs}</td>
			<td className="mono">{row.http_port}</td>
			<td>{row.visibility}</td>
			<td className="mono">
				{row.vcpu_count}vCPU / {row.mem_size_mib}MiB
			</td>
			<td className="small">{formatDate(row.created_at)}</td>
			<td className="small">{formatDate(row.destroyed_at)}</td>
			<td>
				<span className={`badge badge-${badge.tone}`}>
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
});

export default function ReactDeploymentRows() {
	const rows = useStore(deploymentHistoryService.$rows);
	const loading = useStore(deploymentHistoryService.$loading);

	return (
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
					{rows.length === 0 && !loading ? (
						<tr>
							<td colSpan={9} className="empty">
								No deployments yet — deploy one above to start
								your history.
							</td>
						</tr>
					) : (
						rows.map((row) => <Row key={row.id} row={row} />)
					)}
				</tbody>
			</table>
		</div>
	);
}
