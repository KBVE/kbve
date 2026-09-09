import { usePlayerStats } from '../character/playerStats';

const POOLS = [
	{ key: 'hp', maxKey: 'maxHp', label: 'HP', color: '#e0483a' },
	{ key: 'mp', maxKey: 'maxMp', label: 'MP', color: '#3a7ae0' },
	{ key: 'ep', maxKey: 'maxEp', label: 'EP', color: '#e0c23a' },
	{ key: 'sp', maxKey: 'maxSp', label: 'SP', color: '#4fdc6a' },
] as const;

// Four stacked resource bars, bottom-right. Reads the throttled player-stats
// snapshot; only re-renders when a pool value moves.
export function PlayerBars() {
	const s = usePlayerStats();
	return (
		<div
			style={{
				position: 'fixed',
				bottom: 12,
				right: 12,
				width: 168,
				padding: '8px 10px',
				background: 'rgba(10,10,14,0.8)',
				border: '1px solid #333',
				borderRadius: 6,
				font: '11px monospace',
				color: '#c9c9d6',
				pointerEvents: 'none',
				display: 'flex',
				flexDirection: 'column',
				gap: 5,
			}}>
			{POOLS.map((p) => {
				const cur = s[p.key];
				const max = s[p.maxKey];
				const pct = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
				return (
					<div
						key={p.key}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 6,
						}}>
						<span style={{ width: 18, opacity: 0.7 }}>
							{p.label}
						</span>
						<div
							style={{
								flex: 1,
								height: 8,
								background: 'rgba(255,255,255,0.08)',
								borderRadius: 3,
								overflow: 'hidden',
							}}>
							<div
								style={{
									width: `${pct * 100}%`,
									height: '100%',
									background: p.color,
									transition: 'width 80ms linear',
								}}
							/>
						</div>
						<span
							style={{
								width: 30,
								textAlign: 'right',
								opacity: 0.6,
							}}>
							{Math.round(cur)}
						</span>
					</div>
				);
			})}
		</div>
	);
}
