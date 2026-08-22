import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Wind } from 'lucide-react';
import { initSupa, getSupa } from '@/lib/supa';
import { DASH_PROXY_BASE } from '@/components/rnweb/dashProxyBase';
import { POLL_MS } from './chartTheme';

interface WindmillJob {
	id: string;
	script_path?: string;
	job_kind?: string;
	type?: string;
	success?: boolean;
	running?: boolean;
	canceled?: boolean;
	created_at?: string;
	started_at?: string;
	duration_ms?: number;
	created_by?: string;
}

type Status = 'loading' | 'ready' | 'error';

const JOBS_URL = `${DASH_PROXY_BASE}/dashboard/workflows/proxy/api/w/kbve/jobs/list?per_page=25`;

async function getToken(): Promise<string | null> {
	try {
		await initSupa();
		const result = await getSupa()
			.getSession()
			.catch(() => null);
		return result?.session?.access_token ?? null;
	} catch {
		return null;
	}
}

function jobState(j: WindmillJob): { label: string; cls: string } {
	if (j.canceled) return { label: 'canceled', cls: 'text-gray-500' };
	if (j.running || j.type === 'QueuedJob')
		return { label: 'running', cls: 'text-amber-400' };
	if (j.success) return { label: 'success', cls: 'text-emerald-400' };
	return { label: 'failure', cls: 'text-red-400' };
}

function formatWhen(iso?: string): string {
	if (!iso) return '—';
	const delta = Date.now() - new Date(iso).getTime();
	if (!Number.isFinite(delta)) return '—';
	const mins = Math.round(delta / 60_000);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.round(mins / 60);
	if (hours < 48) return `${hours}h ago`;
	return `${Math.round(hours / 24)}d ago`;
}

function formatDuration(ms?: number): string {
	if (ms == null) return '—';
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

export default function ReactWindmillJobs() {
	const [jobs, setJobs] = useState<WindmillJob[]>([]);
	const [status, setStatus] = useState<Status>('loading');
	const [refreshing, setRefreshing] = useState(false);

	const load = useCallback(async () => {
		try {
			const token = await getToken();
			const resp = await fetch(JOBS_URL, {
				headers: token ? { Authorization: `Bearer ${token}` } : {},
			});
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const data = (await resp.json()) as WindmillJob[];
			setJobs(Array.isArray(data) ? data : []);
			setStatus('ready');
		} catch {
			setStatus('error');
		}
	}, []);

	useEffect(() => {
		void load();
		const id = window.setInterval(load, POLL_MS);
		return () => window.clearInterval(id);
	}, [load]);

	const onRefresh = async () => {
		setRefreshing(true);
		await load();
		setRefreshing(false);
	};

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2 text-sm font-semibold">
					<Wind className="size-4 text-sky-400" />
					<span>Windmill jobs</span>
					<span className="text-xs font-normal text-gray-500">
						(workspace kbve · 30s poll)
					</span>
					{status === 'loading' && (
						<Loader2 className="size-4 animate-spin text-gray-400" />
					)}
				</div>
				<div className="flex items-center gap-2">
					<a
						href="https://windmill.kbve.com"
						target="_blank"
						rel="noreferrer"
						className="rounded-md border border-[var(--sl-color-gray-5)] px-2 py-1 text-xs text-gray-400 hover:text-gray-200">
						Open Windmill
					</a>
					<button
						onClick={onRefresh}
						disabled={refreshing}
						className="rounded-md border border-[var(--sl-color-gray-5)] p-1 text-gray-400 hover:text-gray-200 disabled:opacity-50">
						<RefreshCw
							className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
						/>
					</button>
				</div>
			</div>

			<div className="rounded-lg border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg-nav)] p-4">
				{jobs.length > 0 ? (
					<div className="max-h-80 overflow-y-auto">
						<table className="w-full text-xs">
							<thead className="sticky top-0 border-b border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg-nav)] text-left text-gray-400">
								<tr>
									<th className="py-1.5 pr-3">Path</th>
									<th className="py-1.5 pr-3">Kind</th>
									<th className="py-1.5 pr-3">Status</th>
									<th className="py-1.5 pr-3">By</th>
									<th className="py-1.5 pr-3 text-right">
										Duration
									</th>
									<th className="py-1.5 text-right">
										Started
									</th>
								</tr>
							</thead>
							<tbody>
								{jobs.map((j) => {
									const s = jobState(j);
									return (
										<tr
											key={j.id}
											className="border-b border-[var(--sl-color-gray-5)]/40 last:border-0">
											<td className="py-1 pr-3 font-mono">
												{j.script_path || '—'}
											</td>
											<td className="py-1 pr-3 text-gray-400">
												{j.job_kind || '—'}
											</td>
											<td
												className={`py-1 pr-3 ${s.cls}`}>
												● {s.label}
											</td>
											<td className="py-1 pr-3 text-gray-400">
												{j.created_by || '—'}
											</td>
											<td className="py-1 pr-3 text-right tabular-nums text-gray-400">
												{formatDuration(j.duration_ms)}
											</td>
											<td className="py-1 text-right text-gray-400">
												{formatWhen(
													j.started_at ||
														j.created_at,
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				) : (
					<div className="py-6 text-center text-xs text-gray-500">
						{status === 'loading'
							? 'Loading…'
							: status === 'error'
								? 'Failed to load jobs — check sign-in.'
								: 'No jobs in workspace window.'}
					</div>
				)}
			</div>
		</div>
	);
}
