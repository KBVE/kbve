import { atom } from 'nanostores';

export type DeploymentVisibility = 'staff' | 'public';
export type DeploymentDestroyReason =
	| 'user'
	| 'idle_sweep'
	| 'crash'
	| 'pod_shutdown'
	| 'admin';

export interface DeploymentRow {
	id: number;
	vm_id: string;
	account_id: string;
	rootfs: string;
	entrypoint: string;
	http_port: number;
	visibility: DeploymentVisibility;
	vcpu_count: number;
	mem_size_mib: number;
	idle_ttl_secs: number;
	spec: Record<string, unknown>;
	created_at: string;
	destroyed_at: string | null;
	destroy_reason: DeploymentDestroyReason | null;
	settled_ledger_id: number | null;
	credits_spent: number | null;
}

export interface DeploymentListResponse {
	account_id: string;
	limit: number;
	offset: number;
	live_only: boolean;
	deployments: DeploymentRow[];
}

export interface DeploymentStats {
	total_deployments: number;
	live_deployments: number;
	total_credits_spent: number;
	earliest_deployment_at: string | null;
	latest_deployment_at: string | null;
}

export interface DeploymentStatsResponse {
	account_id: string;
	stats: DeploymentStats;
}

class DeploymentHistoryService {
	public readonly $loading = atom<boolean>(false);
	public readonly $error = atom<string | null>(null);
	public readonly $rows = atom<DeploymentRow[]>([]);
	public readonly $stats = atom<DeploymentStats | null>(null);
	public readonly $offset = atom<number>(0);
	public readonly $liveOnly = atom<boolean>(false);
	public readonly $limit = atom<number>(25);

	public async refresh(token: string): Promise<void> {
		this.$loading.set(true);
		this.$error.set(null);
		try {
			const limit = this.$limit.get();
			const offset = this.$offset.get();
			const liveOnly = this.$liveOnly.get();
			const [rows, stats] = await Promise.all([
				this.fetchDeployments(token, limit, offset, liveOnly),
				this.fetchStats(token),
			]);
			this.$rows.set(rows);
			this.$stats.set(stats);
		} catch (e) {
			this.$error.set(e instanceof Error ? e.message : String(e));
		} finally {
			this.$loading.set(false);
		}
	}

	private async fetchDeployments(
		token: string,
		limit: number,
		offset: number,
		liveOnly: boolean,
	): Promise<DeploymentRow[]> {
		const params = new URLSearchParams({
			limit: String(limit),
			offset: String(offset),
			live_only: liveOnly ? 'true' : 'false',
		});
		const resp = await fetch(
			`/dashboard/firecracker/deployments?${params.toString()}`,
			{
				headers: { Authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(20000),
			},
		);
		if (!resp.ok) {
			const text = await resp.text().catch(() => '');
			throw new Error(
				`deployments ${resp.status}: ${text.slice(0, 200)}`,
			);
		}
		const body = (await resp.json()) as DeploymentListResponse;
		return body.deployments;
	}

	private async fetchStats(token: string): Promise<DeploymentStats> {
		const resp = await fetch(`/dashboard/firecracker/stats`, {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(20000),
		});
		if (!resp.ok) {
			const text = await resp.text().catch(() => '');
			throw new Error(`stats ${resp.status}: ${text.slice(0, 200)}`);
		}
		const body = (await resp.json()) as DeploymentStatsResponse;
		return body.stats;
	}
}

export const deploymentHistoryService = new DeploymentHistoryService();
