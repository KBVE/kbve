import { useGameSelector } from '../store/GameStoreContext';
import { PixelPanel } from './PixelPanel';

const GOAL = 10;

export function QuestTracker() {
	const kills = useGameSelector((s) => s.player.stats.kills ?? 0);
	const done = Math.min(kills, GOAL);
	return (
		<PixelPanel
			variant="wood"
			className="pointer-events-none absolute left-3 top-16 z-30 w-44 px-3 py-2">
			<p className="text-[0.6rem] font-semibold uppercase tracking-widest text-amber-300/80">
				Bounty
			</p>
			<p className="mt-0.5 text-xs text-stone-300">Cull the hostiles</p>
			<div className="mt-1.5 h-1.5 w-full rounded bg-gray-700">
				<div
					className="h-full rounded bg-amber-400 transition-all"
					style={{ width: `${(done / GOAL) * 100}%` }}
				/>
			</div>
			<p className="mt-0.5 text-right font-mono text-[0.6rem] text-stone-400">
				{done}/{GOAL}
			</p>
		</PixelPanel>
	);
}
