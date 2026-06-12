import { useGameSelector } from '../store/GameStoreContext';

export function OnlinePlayers() {
	const players = useGameSelector((s) => s.players);
	const me = useGameSelector((s) => s.player.stats.username);

	return (
		<div className="mb-4">
			<h2 className="text-lg font-semibold mb-2">
				Online
				<span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">
					{players.length}
				</span>
			</h2>
			{players.length === 0 ? (
				<p className="text-sm text-gray-500">Nobody in the realm.</p>
			) : (
				<ul className="space-y-1">
					{players.map((p) => (
						<li
							key={p.slot}
							className="flex items-center gap-2 text-sm">
							<span
								className="h-1.5 w-1.5 rounded-full bg-emerald-400"
								aria-hidden="true"
							/>
							<span className="truncate">
								{p.username}
								{p.username === me && (
									<span className="ml-1 text-xs text-gray-500">
										(you)
									</span>
								)}
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
