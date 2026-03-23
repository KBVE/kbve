import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { edgeService } from './edgeService';
import { initSupa, getSupa } from '@/lib/supa';
import {
	Activity,
	XCircle,
	Clock,
	AlertCircle,
	Server,
	Globe,
} from 'lucide-react';

export default function ReactEdgeSummary() {
	const okCount = useStore(edgeService.$okCount);
	const errorCount = useStore(edgeService.$errorCount);
	const totalCount = useStore(edgeService.$totalCount);
	const proxyOk = useStore(edgeService.$proxyOkCount);
	const directOk = useStore(edgeService.$directOkCount);
	const lastChecked = useStore(edgeService.$lastChecked);
	const error = useStore(edgeService.$error);

	useEffect(() => {
		(async () => {
			// Try to get auth token for proxy checks
			try {
				await initSupa();
				const supa = getSupa();
				const result = await supa.getSession().catch(() => null);
				const token = result?.session?.access_token ?? null;
				if (token) {
					edgeService.$accessToken.set(token as string);
				}
			} catch {
				// No auth — proxy checks will show as pending
			}
			edgeService.fetchHealth();
		})();
	}, []);

	return (
		<>
			{/* Summary bar */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '1.5rem',
					padding: '0.75rem 1rem',
					borderRadius: 10,
					background: 'var(--sl-color-bg-nav, #111)',
					border: '1px solid var(--sl-color-gray-5, #262626)',
					fontSize: '0.85rem',
					color: 'var(--sl-color-gray-3, #8b949e)',
					flexWrap: 'wrap',
				}}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.4rem',
					}}>
					<Activity size={16} />
					<span>
						{okCount}/{totalCount} operational
					</span>
				</div>
				{totalCount > 0 && (
					<>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: '0.4rem',
								color:
									proxyOk === totalCount
										? '#22c55e'
										: '#f59e0b',
							}}>
							<Server size={14} />
							<span>
								Proxy {proxyOk}/{totalCount}
							</span>
						</div>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: '0.4rem',
								color:
									directOk === totalCount
										? '#22c55e'
										: '#f59e0b',
							}}>
							<Globe size={14} />
							<span>
								Direct {directOk}/{totalCount}
							</span>
						</div>
					</>
				)}
				{errorCount > 0 && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '0.4rem',
							color: '#fca5a5',
						}}>
						<XCircle size={16} />
						<span>{errorCount} both-fail</span>
					</div>
				)}
				{lastChecked && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '0.4rem',
						}}>
						<Clock size={16} />
						<span>
							{lastChecked.toLocaleTimeString([], {
								hour: '2-digit',
								minute: '2-digit',
								second: '2-digit',
							})}
						</span>
					</div>
				)}
			</div>

			{/* Error banner */}
			{error && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.5rem',
						padding: '0.75rem 1rem',
						borderRadius: '8px',
						background: 'rgba(239,68,68,0.1)',
						border: '1px solid rgba(239,68,68,0.3)',
						color: '#fca5a5',
						fontSize: '0.875rem',
					}}>
					<AlertCircle size={16} />
					<span>{error}</span>
				</div>
			)}
		</>
	);
}
