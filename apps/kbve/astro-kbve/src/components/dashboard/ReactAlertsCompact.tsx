import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { AlertCircle, Bell, Loader2 } from 'lucide-react';
import { POLL_MS } from './chartTheme';
import {
	$alertsFiring,
	$alertsFiringStatus,
	$alertsRange,
	fetchAlertsFiring,
	severityColor,
	severityTextClass,
} from './alertsService';

export default function ReactAlertsCompact() {
	const range = useStore($alertsRange);
	const firing = useStore($alertsFiring);
	const firingStatus = useStore($alertsFiringStatus);

	useEffect(() => {
		void fetchAlertsFiring(range);
		const id = window.setInterval(() => fetchAlertsFiring(range), POLL_MS);
		return () => window.clearInterval(id);
	}, [range]);

	const firingByLevel: Record<string, number> = {};
	(firing ?? []).forEach((a) => {
		const s = (a.severity || 'unknown').toLowerCase();
		firingByLevel[s] = (firingByLevel[s] ?? 0) + 1;
	});
	const total = firing?.length ?? 0;

	return (
		<div className="rounded-lg border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg-nav)] p-3">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 text-sm font-semibold">
					<Bell className="size-4 text-amber-500" />
					<a href="/dashboard/grafana/" className="hover:underline">
						Alerts firing
					</a>
					<span className="text-lg font-bold tabular-nums">
						{total}
					</span>
				</div>
				<div className="flex items-center gap-2 text-xs">
					{['critical', 'warning', 'info'].map(
						(s) =>
							firingByLevel[s] > 0 && (
								<span
									key={s}
									className={`flex items-center gap-1 ${severityTextClass(s)}`}>
									<span
										className="inline-block size-2 rounded-full"
										style={{
											background: severityColor(s),
										}}
									/>
									<span className="tabular-nums">
										{firingByLevel[s]}
									</span>
									<span className="opacity-60">{s}</span>
								</span>
							),
					)}
					{firingStatus === 'loading' && (
						<Loader2 className="size-3 animate-spin text-gray-400" />
					)}
					{firingStatus === 'error' && (
						<AlertCircle className="size-3 text-red-500" />
					)}
				</div>
			</div>
		</div>
	);
}
