import { useEffect, useRef, useState } from 'react';
import { FloatingWindow } from '@kbve/astro/ui';
import {
	laserEvents,
	decodeCard,
	verifyBlackjackCommitment,
} from '@kbve/laser';
import type {
	BlackjackSeatView,
	BlackjackHandView,
	BlackjackStateView,
	BjActionKind,
} from '@kbve/laser';
import { useGameSelector } from '../store/GameStoreContext';
import './BlackjackTable.css';

// Per-phase countdown lengths, mirroring the server's BJ_*_TICKS windows (seconds).
const PHASE_SECONDS: Record<string, number> = {
	betting: 20,
	insurance: 10,
	player_turn: 20,
};

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
			className={`bj-card inline-flex h-9 min-w-7 items-center justify-center rounded border border-gray-500 bg-white px-1 text-sm font-bold shadow-sm ${c.red ? 'text-red-600' : 'text-gray-900'}`}>
			{c.rank}
			{SUIT_GLYPH[c.suit]}
		</span>
	);
}

function CardBack() {
	return (
		<span className="bj-card-back inline-flex h-9 min-w-7 items-center justify-center rounded border border-indigo-300 bg-indigo-700 px-1 text-sm text-indigo-200">
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

function sameRank(cards: number[]): boolean {
	return (
		cards.length === 2 &&
		decodeCard(cards[0]).rank === decodeCard(cards[1]).rank
	);
}

function CountdownBar({
	phase,
	deadlineMs,
}: {
	phase: string;
	deadlineMs: number | null;
}) {
	const max = PHASE_SECONDS[phase];
	if (deadlineMs == null || !max) return null;
	const frac = Math.max(0, Math.min(1, deadlineMs / (max * 1000)));
	const seconds = Math.max(0, Math.ceil(deadlineMs / 1000));
	const color =
		frac > 0.5
			? 'bg-emerald-500'
			: frac > 0.25
				? 'bg-amber-400'
				: 'bg-rose-500';
	return (
		<div className="flex items-center gap-2">
			<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
				<div
					className={`bj-meter h-full rounded-full ${color}`}
					style={{ width: `${frac * 100}%` }}
				/>
			</div>
			<span className="w-8 text-right text-xs tabular-nums text-zinc-300">
				{seconds}s
			</span>
		</div>
	);
}

function FairnessBadge({
	commitment,
	seed,
}: {
	commitment?: string;
	seed?: string | null;
}) {
	const [verified, setVerified] = useState<boolean | null>(null);

	useEffect(() => {
		let live = true;
		setVerified(null);
		if (seed && commitment) {
			verifyBlackjackCommitment(seed, commitment)
				.then((ok) => live && setVerified(ok))
				.catch(() => live && setVerified(false));
		}
		return () => {
			live = false;
		};
	}, [seed, commitment]);

	if (!commitment) return null;
	const short = `${commitment.slice(0, 10)}…`;

	if (!seed) {
		return (
			<span
				className="text-[10px] text-zinc-500"
				title={`Shoe committed before the deal: ${commitment}`}>
				🔒 provably fair · {short}
			</span>
		);
	}
	return (
		<span
			className={`text-[10px] ${verified === false ? 'text-rose-400' : 'text-emerald-400'}`}
			title={`seed ${seed} · sha256 ${commitment}`}>
			{verified == null
				? '🔓 verifying…'
				: verified
					? `✓ provably fair · seed ${seed.slice(0, 8)}…`
					: '✗ commitment mismatch'}
		</span>
	);
}

function HandRow({
	hand,
	active,
}: {
	hand: BlackjackHandView;
	active: boolean;
}) {
	const outcomeColor =
		hand.outcome === 'win' || hand.outcome === 'blackjack'
			? 'text-emerald-400'
			: hand.outcome === 'push'
				? 'text-zinc-300'
				: 'text-rose-400';
	return (
		<div
			className={`flex items-center justify-between rounded px-2 py-1 transition-colors ${active ? 'bj-active bg-yellow-500/20 ring-1 ring-yellow-400' : 'bg-zinc-900/50'}`}>
			<Hand cards={hand.cards} />
			<div className="flex flex-col items-end text-xs">
				{hand.cards.length > 0 && (
					<span className="text-zinc-200">
						{hand.value}
						{hand.soft ? ' (soft)' : ''}
					</span>
				)}
				<span className="text-amber-300">
					bet {hand.bet}
					{hand.doubled && ' ·2x'}
					{hand.surrendered && ' · surrender'}
				</span>
				{hand.outcome && (
					<span
						className={`bj-outcome font-semibold ${outcomeColor}`}>
						{OUTCOME_LABEL[hand.outcome] ?? hand.outcome}
					</span>
				)}
			</div>
		</div>
	);
}

function SeatRow({
	seat,
	activeSlot,
	activeHand,
	mine,
}: {
	seat: BlackjackSeatView;
	activeSlot: number | null;
	activeHand: number | null;
	mine: boolean;
}) {
	const seatActive = activeSlot === seat.slot;
	return (
		<div className="flex flex-col gap-1 rounded bg-zinc-800/60 px-2 py-1">
			<div className="flex items-center justify-between">
				<span className="text-xs text-zinc-300">
					{seat.username}
					{mine && <span className="text-yellow-400"> (you)</span>}
					{seat.disconnected && (
						<span className="text-rose-400"> (reconnecting…)</span>
					)}
				</span>
				{seat.insurance > 0 && (
					<span className="text-xs text-sky-300">
						insurance {seat.insurance}
					</span>
				)}
			</div>
			{seat.hands.length === 0 ? (
				<span className="text-xs text-zinc-500">
					{seat.bet > 0 ? `bet ${seat.bet} — waiting` : 'no bet'}
				</span>
			) : (
				seat.hands.map((hand, i) => (
					<HandRow
						key={i}
						hand={hand}
						active={seatActive && activeHand === i}
					/>
				))
			)}
		</div>
	);
}

// Watches server state transitions and fires sound cues; SoundManager plays them.
function BlackjackSfx({
	state,
	myName,
}: {
	state: BlackjackStateView | null;
	myName: string;
}) {
	const prev = useRef<{ phase: string; cards: number; bet: number } | null>(
		null,
	);
	useEffect(() => {
		if (!state) {
			prev.current = null;
			return;
		}
		const mySeat = state.seats.find((s) => s.username === myName) ?? null;
		const cards =
			state.dealer_hand.length +
			state.seats.reduce(
				(a, s) => a + s.hands.reduce((b, h) => b + h.cards.length, 0),
				0,
			);
		const myBet =
			mySeat?.hands.reduce((a, h) => a + h.bet, 0) || (mySeat?.bet ?? 0);
		const p = prev.current;
		if (p) {
			if (cards > p.cards)
				laserEvents.emit('blackjack:sfx', { kind: 'card' });
			if (myBet > p.bet)
				laserEvents.emit('blackjack:sfx', { kind: 'chip' });
			if (p.phase !== state.phase) {
				if (state.phase === 'dealer_turn')
					laserEvents.emit('blackjack:sfx', { kind: 'flip' });
				else if (
					state.phase === 'player_turn' ||
					state.phase === 'insurance'
				)
					laserEvents.emit('blackjack:sfx', { kind: 'deal' });
				else if (state.phase === 'settle' && mySeat) {
					const outs = mySeat.hands
						.map((h) => h.outcome)
						.filter(Boolean) as string[];
					if (outs.includes('blackjack'))
						laserEvents.emit('blackjack:sfx', {
							kind: 'blackjack',
						});
					else if (outs.some((o) => o === 'win'))
						laserEvents.emit('blackjack:sfx', { kind: 'win' });
					else if (outs.length && outs.every((o) => o === 'push'))
						laserEvents.emit('blackjack:sfx', { kind: 'push' });
					else if (outs.length)
						laserEvents.emit('blackjack:sfx', { kind: 'lose' });
				}
			}
		}
		prev.current = { phase: state.phase, cards, bet: myBet };
	}, [state, myName]);
	return null;
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
	const myActiveHandIdx =
		mySeat && state?.active_slot === mySeat.slot ? state.active_hand : null;
	const isMyTurn = myActiveHandIdx != null;
	const activeHand =
		mySeat && myActiveHandIdx != null
			? (mySeat.hands[myActiveHandIdx] ?? null)
			: null;

	const balance = state?.your_balance ?? 0;
	const canBet = !!mySeat && state?.phase === 'betting' && mySeat.bet === 0;
	const canInsure =
		!!mySeat && state?.phase === 'insurance' && mySeat.insurance === 0;
	const insuranceCap = mySeat ? Math.floor(mySeat.bet / 2) : 0;

	const canDouble =
		isMyTurn &&
		!!activeHand &&
		activeHand.cards.length === 2 &&
		!activeHand.doubled &&
		balance >= activeHand.bet;
	const canSplit =
		isMyTurn &&
		!!activeHand &&
		!!mySeat &&
		sameRank(activeHand.cards) &&
		mySeat.hands.length < 4 &&
		balance >= activeHand.bet;
	const canSurrender =
		isMyTurn &&
		!!activeHand &&
		!!mySeat &&
		mySeat.hands.length === 1 &&
		activeHand.cards.length === 2 &&
		!activeHand.doubled;

	const act = (kind: BjActionKind) =>
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
			size={{ width: 560, height: 560 }}
			minWidth={380}
			minHeight={380}
			title="Blackjack"
			onClose={close}>
			<div className="flex h-full flex-col gap-3 bg-zinc-950 p-4 text-white">
				<BlackjackSfx state={state} myName={myName} />
				{!state ? (
					<p className="text-sm text-zinc-400">Joining the table…</p>
				) : (
					<>
						<div className="flex flex-col gap-1">
							<div className="flex items-center justify-between">
								<span className="text-xs uppercase tracking-wide text-zinc-400">
									{state.phase.replace('_', ' ')}
								</span>
								<span className="text-xs text-amber-300">
									Coins: {state.your_balance}
								</span>
							</div>
							<CountdownBar
								phase={state.phase}
								deadlineMs={state.deadline_ms}
							/>
							<FairnessBadge
								commitment={state.commitment}
								seed={state.seed}
							/>
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
									activeSlot={state.active_slot}
									activeHand={state.active_hand}
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
								<div className="flex gap-1">
									{[5, 25, 100].map((chip) => (
										<button
											key={chip}
											type="button"
											disabled={chip > state.your_balance}
											onClick={() =>
												setBetAmount(
													Math.min(
														state.your_balance,
														chip,
													),
												)
											}
											className="rounded-full bg-zinc-700 px-2 py-1 text-xs transition-all hover:bg-zinc-600 disabled:opacity-30">
											{chip}
										</button>
									))}
									<button
										type="button"
										disabled={state.your_balance < 1}
										onClick={() =>
											setBetAmount(state.your_balance)
										}
										className="rounded-full bg-zinc-700 px-2 py-1 text-xs transition-all hover:bg-zinc-600 disabled:opacity-30">
										Max
									</button>
								</div>
							</div>
						)}

						{canInsure && (
							<div className="flex items-center justify-between gap-2 rounded bg-sky-950/50 px-2 py-1">
								<span className="text-xs text-sky-200">
									Dealer shows an ace — insure up to{' '}
									{insuranceCap}?
								</span>
								<div className="flex gap-2">
									<button
										type="button"
										disabled={insuranceCap < 1}
										onClick={() =>
											laserEvents.emit(
												'blackjack:insure',
												{ amount: insuranceCap },
											)
										}
										className="rounded bg-sky-500 px-3 py-1 text-xs font-semibold text-black transition-all hover:bg-sky-400 disabled:opacity-40">
										Insure {insuranceCap}
									</button>
									<button
										type="button"
										onClick={() =>
											laserEvents.emit(
												'blackjack:insure',
												{ amount: 0 },
											)
										}
										className="rounded bg-zinc-700 px-3 py-1 text-xs transition-all hover:bg-zinc-600">
										No
									</button>
								</div>
							</div>
						)}

						{mySeat && isMyTurn && (
							<span className="bj-you-turn text-center text-xs font-semibold uppercase tracking-wide text-yellow-300">
								Your turn
								{mySeat.hands.length > 1 &&
									myActiveHandIdx != null &&
									` — hand ${myActiveHandIdx + 1}/${mySeat.hands.length}`}
							</span>
						)}

						{mySeat && (
							<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
								<button
									type="button"
									disabled={!isMyTurn}
									onClick={() => act('Hit')}
									className="rounded bg-emerald-600 py-2 text-sm font-semibold transition-all hover:bg-emerald-500 disabled:opacity-40">
									Hit
								</button>
								<button
									type="button"
									disabled={!isMyTurn}
									onClick={() => act('Stand')}
									className="rounded bg-sky-600 py-2 text-sm font-semibold transition-all hover:bg-sky-500 disabled:opacity-40">
									Stand
								</button>
								<button
									type="button"
									disabled={!canDouble}
									onClick={() => act('Double')}
									className="rounded bg-fuchsia-600 py-2 text-sm font-semibold transition-all hover:bg-fuchsia-500 disabled:opacity-40">
									Double
								</button>
								<button
									type="button"
									disabled={!canSplit}
									onClick={() => act('Split')}
									className="rounded bg-violet-600 py-2 text-sm font-semibold transition-all hover:bg-violet-500 disabled:opacity-40">
									Split
								</button>
								<button
									type="button"
									disabled={!canSurrender}
									onClick={() => act('Surrender')}
									className="col-span-2 rounded bg-rose-700 py-2 text-sm font-semibold transition-all hover:bg-rose-600 disabled:opacity-40 sm:col-span-4">
									Surrender
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
