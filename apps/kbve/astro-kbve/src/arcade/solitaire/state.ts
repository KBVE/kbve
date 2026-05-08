// ============================================================================
// Solitaire — game state (byte-packed engine + Balatro-flavored progression)
// ============================================================================
//
// Layered state:
//   1. Piles (stock / waste / foundations / tableaus) — byte-packed
//   2. Scoring (score, combo, multiplier) — accumulated per move
//   3. Run progression (round, blind, cash, jokers owned) — round to round
//
// Snapshots cover layers 1+2 so undo rolls back both pile state AND the
// score effect of the move. Run-progression state is NOT in undo (rounds
// only advance on round-end, never via undo).

import {
	dealBytes,
	FOUNDATION_SUITS,
	getDisplayRank,
	getSuit,
	isFaceUp,
	isJoker,
	JokerVariant,
	setFaceUp,
	type CardByte,
} from './cards';
import {
	canDropOnFoundation,
	canDropOnTableau,
	isWin,
	movableRun,
} from './rules';
import {
	CASH_RATE,
	COMBO,
	HP,
	JOKER_MULT_PER_TABLEAU,
	ROUND_BLINDS,
	SCORE,
	STARTING_CASH,
	STATS,
	STOCK_DRAW_COUNT,
	STORAGE_KEY,
} from './config';

const SNAPSHOT_HEADER = 13;
const SNAPSHOT_TOTAL = SNAPSHOT_HEADER + 54; // 52 standard + up to 2 jokers

/** Per-undo-step score snapshot. Mirrors history[] indices. */
interface ScoreSnapshot {
	score: number;
	combo: number;
	comboMultiplier: number;
	lastFoundationAt: number;
	moves: number;
	/** Card indices that have already triggered a foundation reward this
	 * round. Re-placing a card after foundation→tableau→foundation does NOT
	 * re-reward — prevents loop abuse. Stored as a flat number[] for
	 * snapshot serialization; reconstructed into the live Set on restore. */
	scoredCards: number[];
}

/** Persistent run record stored in localStorage. */
export interface RunRecord {
	bestScore: number;
	bestRound: number;
	totalRuns: number;
}

const EMPTY_RUN: RunRecord = {
	bestScore: 0,
	bestRound: 0,
	totalRuns: 0,
};

export class GameState {
	stock: number[] = [];
	waste: number[] = [];
	foundations: number[][] = [[], [], [], []];
	tableaus: number[][] = [[], [], [], [], [], [], []];

	// --- Layer 2: scoring --------------------------------------------------
	score = 0;
	combo = 0;
	comboMultiplier = 1;
	moves = 0;
	private lastFoundationAt = 0;
	/** Stock-recycle counter — first pass through deck is free, recycles
	 * after that cost SCORE.stockRecycle. */
	private stockCycles = 0;
	/** Card indices that have already been rewarded by foundation placement
	 * this round. A card removed from foundation + re-placed does not score
	 * again — prevents the foundation→tableau→foundation reward loop. The
	 * removal penalty (SCORE.foundationToTableau) still applies. */
	private scoredCards: Set<number> = new Set();

	// --- Layer 3: run progression ------------------------------------------
	round = 1;
	blind = ROUND_BLINDS[0];
	cash = STARTING_CASH;
	hp: number = HP.start;
	maxHp: number = HP.max;
	armor: number = STATS.startArmor;
	attack: number = STATS.startAttack;
	jokerVariants: Map<number, JokerVariant> = new Map();
	/** Jokers owned via shop, applied to next deal. Each entry is a variant
	 * the player paid for. Up to 2 entries (matches the 2 deck jokers). */
	ownedJokerVariants: JokerVariant[] = [];
	/** True between rounds — between win and next deal. Drives shop UI. */
	betweenRounds = false;
	/** True when current round failed (foundations not all complete + score
	 * below blind at end of stock cycles). */
	gameOver = false;

	// --- Persistence -------------------------------------------------------
	bestRecord: RunRecord = { ...EMPTY_RUN };

	// --- Undo --------------------------------------------------------------
	private history: Uint8Array[] = [];
	private scoreHistory: ScoreSnapshot[] = [];
	private static readonly MAX_HISTORY = 256;

	constructor() {
		this.bestRecord = loadBestRecord();
	}

	reset(rng?: () => number) {
		const { tableaus, stock } = dealBytes(rng, { withJokers: true });
		this.tableaus = tableaus;
		this.stock = stock;
		this.waste = [];
		this.foundations = [[], [], [], []];
		this.history = [];
		this.scoreHistory = [];

		// Layer 2 reset.
		this.score = 0;
		this.combo = 0;
		this.comboMultiplier = 1;
		this.moves = 0;
		this.lastFoundationAt = 0;
		this.stockCycles = 0;
		this.scoredCards.clear();

		// Apply owned joker variants (from shop) to the dealt jokers. Variant
		// stays bound to the card index so the variant persists across moves
		// within this round.
		this.jokerVariants.clear();
		const dealtJokerIndices: number[] = [];
		for (const col of this.tableaus) {
			for (const c of col) {
				if (isJoker(c)) dealtJokerIndices.push(c & 0x3f);
			}
		}
		for (const c of this.stock) {
			if (isJoker(c)) dealtJokerIndices.push(c & 0x3f);
		}
		for (let i = 0; i < dealtJokerIndices.length; i++) {
			const variant = this.ownedJokerVariants[i] ?? JokerVariant.Wild;
			this.jokerVariants.set(dealtJokerIndices[i], variant);
		}
	}

	/** Start a fresh run (round 1, score 0, blind 200, full HP, no owned
	 * jokers). */
	resetRun(rng?: () => number) {
		this.round = 1;
		this.blind = ROUND_BLINDS[0];
		this.cash = STARTING_CASH;
		this.hp = HP.start;
		this.maxHp = HP.max;
		this.armor = STATS.startArmor;
		this.attack = STATS.startAttack;
		this.ownedJokerVariants = [];
		this.gameOver = false;
		this.betweenRounds = false;
		this.bestRecord.totalRuns += 1;
		saveBestRecord(this.bestRecord);
		this.reset(rng);
	}

	/** Take damage. Armor reduces incoming amount by `armor × armorReduction`,
	 * floor 1 — at least 1 damage always lands so armor never makes the
	 * player fully invincible. HP clamps at 0 + auto-fires game over. */
	damage(amount: number) {
		const reduced = Math.max(1, amount - this.armor * STATS.armorReduction);
		this.hp = Math.max(0, this.hp - reduced);
		if (this.hp === 0 && !this.gameOver) {
			this.declareGameOver();
		}
	}

	/** Heal up to maxHp. */
	heal(amount: number) {
		this.hp = Math.min(this.maxHp, this.hp + amount);
	}

	/** Called when the player succeeds (foundations full) on the current
	 * round. Computes round cash, advances round counter, sets betweenRounds
	 * so the scene shows the shop. */
	finishRound() {
		this.cash += Math.floor(this.score / CASH_RATE);
		this.bestRecord.bestScore = Math.max(
			this.bestRecord.bestScore,
			this.score,
		);
		this.bestRecord.bestRound = Math.max(
			this.bestRecord.bestRound,
			this.round,
		);
		saveBestRecord(this.bestRecord);
		this.betweenRounds = true;
	}

	/** Player advances from shop to next round. Increments round, picks
	 * next blind, starts a fresh deal with current ownedJokerVariants. */
	advanceRound(rng?: () => number) {
		this.round += 1;
		this.blind = blindForRound(this.round);
		this.betweenRounds = false;
		this.reset(rng);
	}

	/** Trigger game-over manually (e.g. player runs out of moves below
	 * blind score). Caller decides when. */
	declareGameOver() {
		this.gameOver = true;
		this.bestRecord.bestScore = Math.max(
			this.bestRecord.bestScore,
			this.score,
		);
		this.bestRecord.bestRound = Math.max(
			this.bestRecord.bestRound,
			this.round,
		);
		saveBestRecord(this.bestRecord);
	}

	// -------------------------------------------------------------------
	// Snapshot / undo (covers layers 1 + 2)
	// -------------------------------------------------------------------

	snapshot(): Uint8Array {
		const out = new Uint8Array(SNAPSHOT_TOTAL);
		out[0] = this.stock.length;
		out[1] = this.waste.length;
		for (let i = 0; i < 4; i++) out[2 + i] = this.foundations[i].length;
		for (let i = 0; i < 7; i++) out[6 + i] = this.tableaus[i].length;

		let cursor = SNAPSHOT_HEADER;
		for (const c of this.stock) out[cursor++] = c;
		for (const c of this.waste) out[cursor++] = c;
		for (let f = 0; f < 4; f++) {
			for (const c of this.foundations[f]) out[cursor++] = c;
		}
		for (let t = 0; t < 7; t++) {
			for (const c of this.tableaus[t]) out[cursor++] = c;
		}
		return out;
	}

	restore(snap: Uint8Array) {
		const stockLen = snap[0];
		const wasteLen = snap[1];
		const foundLens = [snap[2], snap[3], snap[4], snap[5]];
		const tabLens = [
			snap[6],
			snap[7],
			snap[8],
			snap[9],
			snap[10],
			snap[11],
			snap[12],
		];

		let cursor = SNAPSHOT_HEADER;
		this.stock = Array.from(snap.subarray(cursor, cursor + stockLen));
		cursor += stockLen;
		this.waste = Array.from(snap.subarray(cursor, cursor + wasteLen));
		cursor += wasteLen;
		this.foundations = foundLens.map((len) => {
			const arr = Array.from(snap.subarray(cursor, cursor + len));
			cursor += len;
			return arr;
		});
		this.tableaus = tabLens.map((len) => {
			const arr = Array.from(snap.subarray(cursor, cursor + len));
			cursor += len;
			return arr;
		});
	}

	private snapshotScore(): ScoreSnapshot {
		return {
			score: this.score,
			combo: this.combo,
			comboMultiplier: this.comboMultiplier,
			lastFoundationAt: this.lastFoundationAt,
			moves: this.moves,
			scoredCards: Array.from(this.scoredCards),
		};
	}

	private restoreScore(s: ScoreSnapshot) {
		this.score = s.score;
		this.combo = s.combo;
		this.comboMultiplier = s.comboMultiplier;
		this.lastFoundationAt = s.lastFoundationAt;
		this.moves = s.moves;
		this.scoredCards = new Set(s.scoredCards);
	}

	private pushHistory() {
		this.history.push(this.snapshot());
		this.scoreHistory.push(this.snapshotScore());
		if (this.history.length > GameState.MAX_HISTORY) {
			this.history.shift();
			this.scoreHistory.shift();
		}
	}

	undo(): boolean {
		const snap = this.history.pop();
		const score = this.scoreHistory.pop();
		if (!snap || !score) return false;
		this.restore(snap);
		this.restoreScore(score);
		// Charge undo tax after restoring. Score allowed negative.
		this.score -= SCORE.undoCost;
		return true;
	}

	canUndo(): boolean {
		return this.history.length > 0;
	}

	// -------------------------------------------------------------------
	// Scoring
	// -------------------------------------------------------------------

	/** Tally a move. `isFoundation` extends combo + applies joker multiplier
	 * on positive points. Negative points (e.g. foundation→tableau) reset
	 * combo and skip multipliers. SCORE.movePerAction is subtracted AFTER
	 * any multipliers so the per-move tax is flat. */
	private applyScore(points: number, isFoundation: boolean) {
		let delta: number;
		if (isFoundation && points > 0) {
			const now = nowMs();
			if (now - this.lastFoundationAt < COMBO.windowMs) {
				this.combo += 1;
			} else {
				this.combo = 1;
			}
			this.lastFoundationAt = now;
			const tierIdx = Math.min(this.combo - 1, COMBO.tiers.length - 1);
			this.comboMultiplier = COMBO.tiers[tierIdx];

			const jokerCount = this.countJokersInTableau();
			const jokerMult = 1 + jokerCount * JOKER_MULT_PER_TABLEAU;

			// Joker variant flat bonus: each ScoreBoost joker in tableau adds
			// +50 flat to this placement's points.
			const flatBonus = this.tableauScoreBoostBonus();

			const base = points + flatBonus;
			// Attack stat multiplies the final foundation score on top of
			// combo + joker mults. Default attack=1 = no-op; bought
			// upgrades push it past 1.0 in increments of attackStep (0.25).
			delta = Math.round(
				base * this.comboMultiplier * jokerMult * this.attack,
			);
		} else {
			// Non-foundation move OR negative-point foundation rollback.
			this.combo = 0;
			this.comboMultiplier = 1;
			delta = points;
		}
		// Score allowed to go negative — pressure when burn outpaces
		// progress. HUD turns red.
		this.score = this.score + delta - SCORE.movePerAction;
		this.moves += 1;
	}

	private countJokersInTableau(): number {
		let n = 0;
		for (const col of this.tableaus) {
			for (const c of col) {
				if (isJoker(c)) n += 1;
			}
		}
		return n;
	}

	/** Sum of flat bonuses from ScoreBoost jokers currently sitting in
	 * tableau columns. Multiplier-variant jokers are folded into the
	 * `JOKER_MULT_PER_TABLEAU` count when their variant is Multiplier. */
	private tableauScoreBoostBonus(): number {
		let bonus = 0;
		for (const col of this.tableaus) {
			for (const c of col) {
				if (!isJoker(c)) continue;
				const variant =
					this.jokerVariants.get(c & 0x3f) ?? JokerVariant.Wild;
				if (variant === JokerVariant.ScoreBoost) bonus += 50;
			}
		}
		return bonus;
	}

	// -------------------------------------------------------------------
	// Mutators — each pushes history on success so undo is free.
	// -------------------------------------------------------------------

	drawFromStock(): boolean {
		if (this.stock.length === 0 && this.waste.length === 0) return false;
		this.pushHistory();

		// Stock empty → recycle waste back face-down.
		if (this.stock.length === 0) {
			while (this.waste.length > 0) {
				const c = this.waste.pop()!;
				this.stock.push(setFaceUp(c, false));
			}
			this.stockCycles += 1;
			const recyclePenalty =
				this.stockCycles > 1 ? SCORE.stockRecycle : 0;
			this.applyScore(recyclePenalty, false);
			// Recycles past the first also cost HP — escalating pressure
			// when player keeps burning the deck.
			if (this.stockCycles > 1) {
				this.damage(HP.stockRecyclePenalty);
			}
			return true;
		}

		// Draw STOCK_DRAW_COUNT cards (or whatever stock has left). All
		// flipped face-up onto waste; only the topmost (last drawn) is
		// grabbable per Klondike draw-3 rules.
		const drawCount = Math.min(STOCK_DRAW_COUNT, this.stock.length);
		for (let i = 0; i < drawCount; i++) {
			const c = this.stock.pop()!;
			this.waste.push(setFaceUp(c, true));
		}
		this.applyScore(0, false);
		return true;
	}

	moveWasteToTableau(toCol: number): boolean {
		const c = this.waste[this.waste.length - 1];
		if (c === undefined) return false;
		if (!canDropOnTableau(c, this.tableaus[toCol])) return false;
		this.pushHistory();
		this.waste.pop();
		this.tableaus[toCol].push(c);
		this.applyScore(SCORE.wasteToTableau, false);
		return true;
	}

	moveWasteToFoundation(idx: number): boolean {
		const c = this.waste[this.waste.length - 1];
		if (c === undefined) return false;
		if (getSuit(c) !== FOUNDATION_SUITS[idx]) return false;
		if (!canDropOnFoundation(c, this.foundations[idx])) return false;
		this.pushHistory();
		this.waste.pop();
		this.foundations[idx].push(c);
		const cardIdx = c & 0x3f;
		const firstTime = !this.scoredCards.has(cardIdx);
		this.applyScore(firstTime ? SCORE.wasteToFoundation : 0, firstTime);
		if (firstTime) this.scoredCards.add(cardIdx);
		return true;
	}

	moveTableauRun(
		fromCol: number,
		fromCardIndex: number,
		toCol: number,
	): boolean {
		if (fromCol === toCol) return false;
		const run = movableRun(this.tableaus[fromCol], fromCardIndex);
		if (!run) return false;
		const bottom = run[0];
		if (!canDropOnTableau(bottom, this.tableaus[toCol])) return false;

		this.pushHistory();
		this.tableaus[fromCol].splice(fromCardIndex);
		for (const card of run) this.tableaus[toCol].push(card);
		const flipped = this.flipExposedTop(fromCol);
		const points = flipped ? SCORE.revealTableau : 0;
		this.applyScore(points, false);
		return true;
	}

	moveTableauToFoundation(fromCol: number, foundationIdx: number): boolean {
		const col = this.tableaus[fromCol];
		const c = col[col.length - 1];
		if (c === undefined || !isFaceUp(c)) return false;
		if (getSuit(c) !== FOUNDATION_SUITS[foundationIdx]) return false;
		if (!canDropOnFoundation(c, this.foundations[foundationIdx]))
			return false;

		this.pushHistory();
		col.pop();
		this.foundations[foundationIdx].push(c);
		const flipped = this.flipExposedTop(fromCol);
		const cardIdx = c & 0x3f;
		const firstTime = !this.scoredCards.has(cardIdx);
		// Reveal bonus still fires even on re-placement (the flip is real
		// progress regardless of whether the card already scored before).
		const points =
			(firstTime ? SCORE.tableauToFoundation : 0) +
			(flipped ? SCORE.revealTableau : 0);
		this.applyScore(points, firstTime);
		if (firstTime) this.scoredCards.add(cardIdx);
		return true;
	}

	moveFoundationToTableau(foundationIdx: number, toCol: number): boolean {
		const f = this.foundations[foundationIdx];
		const c = f[f.length - 1];
		if (c === undefined) return false;
		if (!canDropOnTableau(c, this.tableaus[toCol])) return false;

		this.pushHistory();
		f.pop();
		this.tableaus[toCol].push(c);
		this.applyScore(SCORE.foundationToTableau, false);
		return true;
	}

	private flipExposedTop(col: number): boolean {
		const top = this.tableaus[col][this.tableaus[col].length - 1];
		if (top !== undefined && !isFaceUp(top)) {
			this.tableaus[col][this.tableaus[col].length - 1] = setFaceUp(
				top,
				true,
			);
			return true;
		}
		return false;
	}

	hasWon(): boolean {
		return isWin(this.foundations);
	}

	/** Player meets the round's blind = "passed" the round (even before
	 * filling all foundations). UX hook: reaching blind unlocks the
	 * "advance to shop" button. */
	hasMetBlind(): boolean {
		return this.score >= this.blind;
	}

	allCards(): CardByte[] {
		const out: CardByte[] = [];
		for (const c of this.stock) out.push(c);
		for (const c of this.waste) out.push(c);
		for (const f of this.foundations) for (const c of f) out.push(c);
		for (const t of this.tableaus) for (const c of t) out.push(c);
		return out;
	}

	// Exposed for HUD / scene.
	getRank(c: CardByte): number {
		return getDisplayRank(c);
	}
}

// ============================================================================
// Helpers
// ============================================================================

function nowMs(): number {
	return typeof performance !== 'undefined' && performance.now
		? performance.now()
		: Date.now();
}

function blindForRound(round: number): number {
	if (round - 1 < ROUND_BLINDS.length) return ROUND_BLINDS[round - 1];
	// Beyond the table: 1.6× per round indefinitely, capped to a sane int.
	const last = ROUND_BLINDS[ROUND_BLINDS.length - 1];
	const extra = round - ROUND_BLINDS.length;
	return Math.round(last * Math.pow(1.6, extra));
}

function loadBestRecord(): RunRecord {
	if (typeof window === 'undefined' || !window.localStorage) {
		return { ...EMPTY_RUN };
	}
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...EMPTY_RUN };
		const parsed = JSON.parse(raw) as Partial<RunRecord>;
		return {
			bestScore:
				typeof parsed.bestScore === 'number' ? parsed.bestScore : 0,
			bestRound:
				typeof parsed.bestRound === 'number' ? parsed.bestRound : 0,
			totalRuns:
				typeof parsed.totalRuns === 'number' ? parsed.totalRuns : 0,
		};
	} catch {
		return { ...EMPTY_RUN };
	}
}

function saveBestRecord(record: RunRecord) {
	if (typeof window === 'undefined' || !window.localStorage) return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
	} catch {
		// Quota / privacy mode — silently noop.
	}
}
