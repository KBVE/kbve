import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import { forgejoService } from './forgejoService';
import { RefreshCw } from 'lucide-react';

export default function ReactForgejoHeader() {
	const lastUpdated = useStore(forgejoService.$lastUpdated);
	const loading = useStore(forgejoService.$loading);
	const [cooldown, setCooldown] = useState(0);
	const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

	useEffect(() => () => clearInterval(timer.current), []);

	const onRefresh = () => {
		forgejoService.refresh();
		const remaining = forgejoService.manualRefreshCooldownMs();
		setCooldown(Math.ceil(remaining / 1000));
		clearInterval(timer.current);
		timer.current = setInterval(() => {
			const left = forgejoService.manualRefreshCooldownMs();
			setCooldown(Math.ceil(left / 1000));
			if (left <= 0) clearInterval(timer.current);
		}, 250);
	};

	const disabled = loading || cooldown > 0;

	return (
		<div
			className="not-content"
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: '0.75rem',
			}}>
			{lastUpdated && (
				<span
					style={{
						color: 'var(--sl-color-gray-3, #8b949e)',
						fontSize: '0.75rem',
					}}>
					Updated {lastUpdated.toLocaleTimeString()}
				</span>
			)}
			<button
				onClick={onRefresh}
				disabled={disabled}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 6,
					padding: '0.4rem 0.8rem',
					borderRadius: 8,
					border: '1px solid var(--sl-color-gray-5, #30363d)',
					background: 'var(--sl-color-gray-6, #161b22)',
					color: 'var(--sl-color-text, #e6edf3)',
					cursor: disabled ? 'not-allowed' : 'pointer',
					opacity: disabled ? 0.6 : 1,
					fontSize: '0.8rem',
				}}>
				<RefreshCw
					size={14}
					style={
						loading
							? { animation: 'spin 1s linear infinite' }
							: undefined
					}
				/>
				{cooldown > 0 ? `Refresh (${cooldown}s)` : 'Refresh'}
			</button>
		</div>
	);
}
