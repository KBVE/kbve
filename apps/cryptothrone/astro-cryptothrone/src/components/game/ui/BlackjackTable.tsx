import { useState } from 'react';
import { FloatingWindow } from '@kbve/astro/ui';
import { laserEvents, decodeCard } from '@kbve/laser';
import type { BlackjackSeatView } from '@kbve/laser';
import { useGameSelector } from '../store/GameStoreContext';

const SUIT_GLYPH: Record<string, string> = {
	spades: '♠',
	hearts: '♥',
	diamonds: '♦',
	clubs: '♣',
};

function Card({ byte }: { byte: number }) {
	const c = decodeCard(byte);
	return (
		<span
			className={`inline-flex h-9 min-w-7 items-center justify-center rounded border border-gray-500 bg-white px-1 text-sm font-bold ${c.red ? 'text-red-600' : 'text-gray-900'}`}>
			{c.rank}
			{SUIT_GLYPH[c.suit]}
		</span>
	);
}

function CardBack() {
	return (
		<span className="inline-flex h-9 min-w-7 items-center justify-center rounded border border-indigo-300 bg-indigo-700 px-1 text-sm text-indigo-200">
			🂠
		</span>
	);
}

function Hand({
	cards,
	hideSecond,
}: {
	cards: number[];
	hideSecond?: boolean;
}) {
	return (
		<div className="flex flex-wrap gap-1">
			{cards.map((b, i) => (
				<Card key={i} byte={b} />
			))}
			{hideSecond && <CardBack />}
		</div>
	);
}

const OUTCOME_LABEL: Record<string, string> = {
	win: 'Win',
	loss: 'Loss',
	push: 'Push',
	blackjack: 'Blackjack!',
};

function SeatRow({
	seat,
	active,
	mine,
}: {
	seat: BlackjackSeatView;
	active: boolean;
	mine: boolean;
}) {
	return (
		<div
			className={`flex items-center justify-between rounded px-2 py-1 ${active ? 'bg-yellow-500/20 ring-1 ring-yellow-400' : 'bg-zinc-800/60'}`}>
			<div className="flex flex-col">
				<span className="text-xs text-zinc-300">
					{seat.username}
					{mine && <span className="text-yellow-400"> (you)</span>}
				</span>
				<Hand cards={seat.hand} />
			</div>
			<div className="flex flex-col items-end text-xs">
				{seat.hand.length > 0 && (
					<span className="text-zinc-200">
						{seat.value}
						{seat.soft ? ' (soft)' : ''}
					</span>
				)}
				<span className="text-amber-300">bet {seat.bet}</span>
				{seat.outcome && (
					<span className="font-semibold text-emerald-400">
						{OUTCOME_LABEL[seat.outcome] ?? seat.outcome}
					</span>
				)}
			</div>
		</div>
	);
}

export function BlackjackTable() {
	const bj = useGameSelector((s) => s.blackjack);
	const myName = useGameSelector((s) => s.player.stats.username);
	const [betAmount, setBetAmount] = useState(5);

	if (!bj?.open) return null;
	const state = bj.state;

	const close = () => {
		laserEvents.emit('blackjack:leave', undefined);
		laserEvents.emit('blackjack:close', undefined);
	};

	const mySeat = state?.seats.find((s) => s.username === myName) ?? null;
	const isMyTurn =
		!!mySeat &&
		state?.active_slot != null &&
		state.active_slot === mySeat.slot;
	const canBet = !!mySeat && state?.phase === 'betting' && mySeat.bet === 0;
	const seconds =
		state?.deadline_ms != null
			? Math.max(0, Math.ceil(state.deadline_ms / 1000))
			: null;

	const act = (kind: 'Hit' | 'Stand' | 'Double') =>
		laserEvents.emit('blackjack:action', { kind });

	return (
		<FloatingWindow
			storageKey="ct-blackjack"
			layer="modal"
			initial={{
				x:
					typeof window !== 'undefined'
						? Math.max(12, (window.innerWidth - 560) / 2)
						: 160,
				y:
					typeof window !== 'undefined'
						? Math.max(12, (window.innerHeight - 520) / 3)
						: 80,
			}}
			size={{ width: 560, height: 520 }}
			minWidth={380}
			minHeight={360}
			title="Blackjack"
			onClose={close}>
			<div className="flex h-full flex-col gap-3 bg-zinc-950 p-4 text-white">
				{!state ? (
					<p className="text-sm text-zinc-400">Joining the table…</p>
				) : (
					<>
						<div className="flex items-center justify-between">
							<span className="text-xs uppercase tracking-wide text-zinc-400">
								{state.phase.replace('_', ' ')}
							</span>
							<span className="text-xs text-amber-300">
								Coins: {state.your_balance}
							</span>
							{seconds != null &&
								(state.phase === 'betting' ||
									state.phase === 'player_turn') && (
									<span className="text-xs text-zinc-300">
										⏱ {seconds}s
									</span>
								)}
						</div>

						<div className="rounded bg-emerald-950/60 p-2">
							<span className="text-xs text-zinc-400">
								Dealer
							</span>
							<Hand
								cards={state.dealer_hand}
								hideSecond={state.dealer_hidden}
							/>
						</div>

						<div className="flex flex-1 flex-col gap-1 overflow-y-auto">
							{state.seats.length === 0 && (
								<p className="text-sm text-zinc-500">
									No players seated yet.
								</p>
							)}
							{state.seats.map((seat) => (
								<SeatRow
									key={seat.slot}
									seat={seat}
									active={state.active_slot === seat.slot}
									mine={seat.username === myName}
								/>
							))}
						</div>

						{!mySeat && (
							<p className="text-xs text-zinc-400">
								Spectating — walk up and press E to take a seat.
							</p>
						)}

						{canBet && (
							<div className="flex items-center gap-2">
								<input
									type="number"
									min={1}
									max={state.your_balance}
									value={betAmount}
									onChange={(e) =>
										setBetAmount(
											Math.max(
												1,
												Math.min(
													state.your_balance,
													Number(e.target.value) || 1,
												),
											),
										)
									}
									className="w-20 rounded bg-zinc-800 px-2 py-1 text-sm"
								/>
								<button
									type="button"
									onClick={() =>
										laserEvents.emit('blackjack:bet', {
											amount: betAmount,
										})
									}
									className="rounded bg-amber-500 px-4 py-1 text-sm font-semibold text-black transition-all hover:bg-amber-400">
									Place Bet
								</button>
							</div>
						)}

						{mySeat && (
							<div className="flex gap-2">
								<button
									type="button"
									disabled={!isMyTurn}
									onClick={() => act('Hit')}
									className="flex-1 rounded bg-emerald-600 py-2 text-sm font-semibold transition-all hover:bg-emerald-500 disabled:opacity-40">
									Hit
								</button>
								<button
									type="button"
									disabled={!isMyTurn}
									onClick={() => act('Stand')}
									className="flex-1 rounded bg-sky-600 py-2 text-sm font-semibold transition-all hover:bg-sky-500 disabled:opacity-40">
									Stand
								</button>
								<button
									type="button"
									disabled={
										!isMyTurn ||
										state.your_balance < mySeat.bet ||
										mySeat.hand.length !== 2
									}
									onClick={() => act('Double')}
									className="flex-1 rounded bg-fuchsia-600 py-2 text-sm font-semibold transition-all hover:bg-fuchsia-500 disabled:opacity-40">
									Double
								</button>
							</div>
						)}
					</>
				)}
			</div>
		</FloatingWindow>
	);
}

export default BlackjackTable;
