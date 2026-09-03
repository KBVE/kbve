import { useMemo } from 'react';
import { FloatingWindow } from '@kbve/astro/ui';
import { laserEvents } from '@kbve/laser';
import { useGameSelector, useGameDispatch } from '../store/GameStoreContext';
import { getItemById, getItemPrice } from '../data/items';

const CURRENCY = new Set(['coin', 'gold-bar']);

function coinBalance(backpack: string[]): number {
	return backpack.reduce(
		(sum, id) => sum + (id === 'coin' ? 1 : id === 'gold-bar' ? 100 : 0),
		0,
	);
}

export function TradeModal() {
	const trade = useGameSelector((s) => s.tradeModal);
	const backpack = useGameSelector((s) => s.player.inventory.backpack);
	const dispatch = useGameDispatch();

	const balance = useMemo(() => coinBalance(backpack), [backpack]);

	const sellables = useMemo(() => {
		const counts = new Map<string, number>();
		for (const id of backpack) {
			if (CURRENCY.has(id)) continue;
			counts.set(id, (counts.get(id) ?? 0) + 1);
		}
		return [...counts.entries()].map(([ref, count]) => ({
			ref,
			count,
			name: getItemById(ref)?.name ?? ref,
			sellPrice: getItemPrice(ref).sell,
		}));
	}, [backpack]);

	if (!trade) return null;

	const handleClose = () => dispatch({ type: 'SET_TRADE', payload: null });

	const buy = (ref: string) =>
		laserEvents.emit('shop:buy', {
			npc: trade.npcEid,
			itemRef: ref,
			qty: 1,
		});

	const sell = (ref: string) =>
		laserEvents.emit('shop:sell', {
			npc: trade.npcEid,
			itemRef: ref,
			qty: 1,
		});

	return (
		<FloatingWindow
			storageKey="ct-trade-window"
			initial={{
				x:
					typeof window !== 'undefined'
						? Math.max(12, (window.innerWidth - 480) / 2)
						: 200,
				y:
					typeof window !== 'undefined'
						? Math.max(12, (window.innerHeight - 420) / 3)
						: 100,
			}}
			size={{ width: 480, height: 420 }}
			resizable={false}
			title={`Trade — ${trade.npcName}`}
			onClose={handleClose}>
			<div className="flex h-full flex-col p-4 text-white">
				<div className="mb-3 flex items-center justify-between">
					<span className="text-sm text-gray-300">
						Buy from {trade.npcName} or sell your goods.
					</span>
					<span className="flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-black/40 px-2.5 py-1">
						<span className="inline-block h-3 w-3 rounded-full bg-gradient-to-b from-amber-200 to-amber-500" />
						<span className="font-mono text-xs font-semibold text-amber-200">
							{balance}
						</span>
					</span>
				</div>

				<div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
					<section className="flex min-h-0 flex-col rounded-lg border border-emerald-400/20 bg-black/30">
						<h3 className="border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
							Shop
						</h3>
						<ul className="min-h-0 flex-1 overflow-y-auto p-2">
							{trade.shopItems.map((item) => {
								const affordable =
									item.buyPrice > 0 &&
									balance >= item.buyPrice;
								return (
									<li
										key={item.ref}
										className="mb-1 flex items-center justify-between rounded bg-white/5 px-2 py-1.5">
										<span className="truncate text-sm">
											{item.name}
										</span>
										<button
											onClick={() => buy(item.ref)}
											disabled={!affordable}
											className="ml-2 shrink-0 rounded bg-emerald-600 px-2 py-1 font-mono text-xs transition-all hover:bg-emerald-500 disabled:opacity-40">
											{item.buyPrice} 🪙
										</button>
									</li>
								);
							})}
							{trade.shopItems.length === 0 && (
								<li className="px-2 py-2 text-xs text-gray-400">
									Nothing in stock.
								</li>
							)}
						</ul>
					</section>

					<section className="flex min-h-0 flex-col rounded-lg border border-amber-400/20 bg-black/30">
						<h3 className="border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
							Your Backpack
						</h3>
						<ul className="min-h-0 flex-1 overflow-y-auto p-2">
							{sellables.map((item) => (
								<li
									key={item.ref}
									className="mb-1 flex items-center justify-between rounded bg-white/5 px-2 py-1.5">
									<span className="truncate text-sm">
										{item.name}
										{item.count > 1 && (
											<span className="text-gray-400">
												{' '}
												×{item.count}
											</span>
										)}
									</span>
									<button
										onClick={() => sell(item.ref)}
										disabled={item.sellPrice <= 0}
										className="ml-2 shrink-0 rounded bg-amber-600 px-2 py-1 font-mono text-xs transition-all hover:bg-amber-500 disabled:opacity-40">
										{item.sellPrice} 🪙
									</button>
								</li>
							))}
							{sellables.length === 0 && (
								<li className="px-2 py-2 text-xs text-gray-400">
									Nothing to sell.
								</li>
							)}
						</ul>
					</section>
				</div>

				<button
					onClick={handleClose}
					className="mt-3 rounded bg-red-500 py-2 text-sm transition-all hover:bg-red-600">
					Close
				</button>
			</div>
		</FloatingWindow>
	);
}
