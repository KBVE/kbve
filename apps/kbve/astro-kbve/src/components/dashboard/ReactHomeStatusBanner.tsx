import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '@nanostores/react';
import { homeService } from './homeService';
import { StatusDot } from './homeServiceCard';
import { RefreshCw, Clock } from 'lucide-react';
import './homeStatusBanner.css';

export default function ReactHomeStatusBanner() {
	const isStaff = useStore(homeService.$isStaff);
	const grafanaStatus = useStore(homeService.$grafanaStatus);
	const argoStatus = useStore(homeService.$argoStatus);
	const edgeStatus = useStore(homeService.$edgeStatus);
	const clickhouseStatus = useStore(homeService.$clickhouseStatus);
	const securityStatus = useStore(homeService.$securityStatus);
	const rowsStatus = useStore(homeService.$rowsStatus);
	const allOk = useStore(homeService.$allOk);
	const anyError = useStore(homeService.$anyError);
	const anyLoading = useStore(homeService.$anyLoading);
	const lastUpdated = useStore(homeService.$lastUpdated);
	const loading = useStore(homeService.$loading);
	const authState = useStore(homeService.$authState);

	useEffect(() => {
		if (authState === 'authenticated') {
			homeService.fetchAll();
		}
	}, [authState, isStaff]);

	useEffect(() => {
		if (!isStaff) return;
		const title = document.getElementById('dashboard-home-title');
		const subtitle = document.getElementById('dashboard-home-subtitle');
		if (title) title.textContent = 'Infrastructure Dashboard';
		if (subtitle)
			subtitle.textContent =
				'Real-time cluster monitoring, deployment status, and service health';
	}, [isStaff]);

	const overallColor = anyLoading
		? '#94a3b8'
		: allOk
			? '#22c55e'
			: anyError
				? '#ef4444'
				: '#f59e0b';
	const overallLabel = anyLoading
		? 'Checking services...'
		: allOk
			? 'All Systems Operational'
			: anyError
				? 'Service Disruption Detected'
				: 'Partial Degradation';

	const services = [
		...(isStaff
			? [
					{ name: 'Monitoring', status: grafanaStatus },
					{ name: 'Deployments', status: argoStatus },
					{ name: 'Game Ops', status: rowsStatus },
					{ name: 'Logs', status: clickhouseStatus },
				]
			: []),
		{ name: 'Edge', status: edgeStatus },
		{ name: 'Security', status: securityStatus },
	];

	return (
		<div
			className="hsb"
			style={{ '--hsb-overall': overallColor } as CSSProperties}>
			<div className="hsb__overall">
				<span
					className={`hsb__overall-dot${allOk ? ' hsb__overall-dot--ok' : ''}`}
				/>
				<span className="hsb__overall-label">{overallLabel}</span>
			</div>

			<div className="hsb__services">
				{services.map((s) => (
					<div key={s.name} className="hsb__service">
						<StatusDot status={s.status} />
						{s.name}
					</div>
				))}
			</div>

			<div className="hsb__meta">
				{lastUpdated && (
					<span className="hsb__timestamp">
						<Clock size={10} />
						{lastUpdated.toLocaleTimeString([], {
							hour: '2-digit',
							minute: '2-digit',
						})}
					</span>
				)}
				<button
					onClick={() => homeService.fetchAll()}
					disabled={loading}
					title="Refresh all"
					className="hsb__refresh">
					<RefreshCw
						size={13}
						className={loading ? 'svc-spin' : undefined}
					/>
				</button>
			</div>
		</div>
	);
}
