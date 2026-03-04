import type { PlayerStats } from '../types';

interface StatsSectionProps {
	stats: PlayerStats;
}

export function StatsSection({ stats }: StatsSectionProps) {
	const pct = (val: number, max: number) => Math.min((val / max) * 100, 100);

	const bars = [
		{
			label: 'HP',
			current: stats.hp,
			max: stats.maxHp,
			color: 'bg-green-400',
			textColor: 'text-green-400',
		},
		{
			label: 'MP',
			current: stats.mp,
			max: stats.maxMp,
			color: 'bg-blue-400',
			textColor: 'text-blue-400',
		},
		{
			label: 'EP',
			current: stats.ep,
			max: stats.maxEp,
			color: 'bg-yellow-400',
			textColor: 'text-yellow-400',
		},
	];

	return (
		<div className="mb-4">
			<h2 className="text-lg font-semibold mb-2">Stats</h2>
			{bars.map((b) => (
				<div key={b.label} className="mb-2">
					<p
						className={`text-sm ${b.textColor}`}>{`${b.label}: ${b.current} / ${b.max}`}</p>
					<div className="w-full bg-gray-600 h-4 rounded">
						<div
							className={`${b.color} h-full rounded transition-all duration-300`}
							style={{
								width: `${pct(b.current, b.max)}%`,
							}}
						/>
					</div>
				</div>
			))}
		</div>
	);
}
