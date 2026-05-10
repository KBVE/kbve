/** Game state — byte-packed piles + scoring + run progression. Snapshots
 * cover piles + scoring (undo rolls both back). Round-level state stays
 * out of undo: rounds only advance on win, never via undo. */

import {
	BonusType,
	dealBytes,
	FOUNDATION_SUITS,
	getBonusType,
	getCardIndex,
	getDisplayRank,
	getMonsterKind,
	getSuit,
	IDENTITY_MASK,
	isBonus,
	isFaceUp,
	isJoker,
	isMonster,
	JokerVariant,
	MonsterKind,
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

/** Per-monster combat stats. Lives in a Map<cardIndex, MonsterState> on
 * GameState. `name` defaults to the kind label but can be overwritten
 * with an npcdb entry's display name once data loads. */
export interface MonsterState {
	kind: MonsterKind;
	name: string;
	hp: number;
	maxHp: number;
	atk: number;
	engaged: boolean;
}

/** Default monster stats used when no npcdb data is bound (e.g. before
 * `/api/npcdb.json` has loaded). Numbers tuned for early-round play. */
export const MONSTER_KIND_PRESETS: Record<
	MonsterKind,
	Omit<MonsterState, 'engaged'>
> = {
	[MonsterKind.Goblin]: {
		kind: MonsterKind.Goblin,
		name: 'Goblin',
		hp: 2,
		maxHp: 2,
		atk: 1,
	},
	[MonsterKind.Skeleton]: {
		kind: MonsterKind.Skeleton,
		name: 'Skeleton',
		hp: 4,
		maxHp: 4,
		atk: 2,
	},
	[MonsterKind.Ghoul]: {
		kind: MonsterKind.Ghoul,
		name: 'Ghoul',
		hp: 6,
		maxHp: 6,
		atk: 3,
	},
};

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

	score = 0;
	combo = 0;
	comboMultiplier = 1;
	moves = 0;
	private lastFoundationAt = 0;
	/** First pass through the deck is free; recycles past that cost
	 * `SCORE.stockRecycle` plus `HP.stockRecyclePenalty`. */
	private stockCycles = 0;
	/** Cards already rewarded for foundation placement this round —
	 * prevents the foundation → tableau → foundation reward loop. */
	private scoredCards: Set<number> = new Set();
	/** Live count of jokers currently in any tableau column. Maintained on
	 * every tableau push/pop so `applyScore` is O(1). */
	private tableauJokerCount = 0;
	/** Live sum of flat ScoreBoost bonuses from jokers in tableau columns. */
	private tableauScoreBoost = 0;

	round = 1;
	blind = ROUND_BLINDS[0];
	cash = STARTING_CASH;
	hp: number = HP.start;
	maxHp: number = HP.max;
	armor: number = STATS.startArmor;
	attack: number = STATS.startAttack;
	jokerVariants: Map<number, JokerVariant> = new Map();
	/** Per-instance monster combat stats keyed by card index. `engaged`
	 * flips true on first reveal so the engage hit only fires once. */
	monsters: Map<number, MonsterState> = new Map();
	/** Indices revealed by the Reveal bonus. Card byte stays face-down so
	 * rules + drag stay correct; scene flips the face on hover. */
	peekedCards: Set<number> = new Set();
	/** At most one frozen card index. Rotates on each stock click. */
	frozenCards: Set<number> = new Set();
	/** Joker variants the player owns from the shop, applied to the next
	 * deal in array order. Up to 2 entries (one per dealt joker). */
	ownedJokerVariants: JokerVariant[] = [];
	/** True between win and the next deal — drives the shop modal. */
	betweenRounds = false;
	gameOver = false;

	bestRecord: RunRecord = { ...EMPTY_RUN };

	private history: Uint8Array[] = [];
	private scoreHistory: ScoreSnapshot[] = [];
	private static readonly MAX_HISTORY = 256;

	constructor() {
		this.bestRecord = loadBestRecord();
	}

	reset(rng?: () => number) {
		const { tableaus, stock } = dealBytes(rng, {
			withJokers: true,
			withBonuses: true,
			withMonsters: true,
		});
		this.tableaus = tableaus;
		this.stock = stock;
		this.waste = [];
		this.foundations = [[], [], [], []];
		this.history = [];
		this.scoreHistory = [];

		this.score = 0;
		this.combo = 0;
		this.comboMultiplier = 1;
		this.moves = 0;
		this.lastFoundationAt = 0;
		this.stockCycles = 0;
		this.scoredCards.clear();
		this.peekedCards.clear();
		this.frozenCards.clear();

		this.jokerVariants.clear();
		const dealtJokerIndices: number[] = [];
		for (const col of this.tableaus) {
			for (const c of col) {
				if (isJoker(c)) dealtJokerIndices.push(getCardIndex(c));
			}
		}
		for (const c of this.stock) {
			if (isJoker(c)) dealtJokerIndices.push(getCardIndex(c));
		}
		for (let i = 0; i < dealtJokerIndices.length; i++) {
			const variant = this.ownedJokerVariants[i] ?? JokerVariant.Wild;
			this.jokerVariants.set(dealtJokerIndices[i], variant);
		}

		this.monsters.clear();
		this.seedMonstersFromPile(this.stock);
		this.seedMonstersFromPile(this.waste);
		for (const col of this.tableaus) this.seedMonstersFromPile(col);

		this.recomputeTableauJokerStats();
	}

	private seedMonstersFromPile(pile: number[]) {
		for (const c of pile) {
			if (!isMonster(c)) continue;
			const idx = getCardIndex(c);
			if (this.monsters.has(idx)) continue;
			const kind = getMonsterKind(c);
			const preset = MONSTER_KIND_PRESETS[kind];
			this.monsters.set(idx, { ...preset, engaged: false });
		}
	}

	/** Walk the tableau once and rebuild the cached joker count + flat
	 * score-boost sum. Called from reset/restore — paths that mutate one
	 * card at a time keep the cache up-to-date inline. */
	private recomputeTableauJokerStats() {
		let count = 0;
		let boost = 0;
		for (const col of this.tableaus) {
			for (const c of col) {
				if (!isJoker(c)) continue;
				count += 1;
				const variant =
					this.jokerVariants.get(getCardIndex(c)) ??
					JokerVariant.Wild;
				if (variant === JokerVariant.ScoreBoost) boost += 50;
			}
		}
		this.tableauJokerCount = count;
		this.tableauScoreBoost = boost;
	}

	private onTableauJokerAdded(card: CardByte) {
		if (!isJoker(card)) return;
		this.tableauJokerCount += 1;
		const variant =
			this.jokerVariants.get(getCardIndex(card)) ?? JokerVariant.Wild;
		if (variant === JokerVariant.ScoreBoost) this.tableauScoreBoost += 50;
	}

	private onTableauJokerRemoved(card: CardByte) {
		if (!isJoker(card)) return;
		this.tableauJokerCount -= 1;
		const variant =
			this.jokerVariants.get(getCardIndex(card)) ?? JokerVariant.Wild;
		if (variant === JokerVariant.ScoreBoost) this.tableauScoreBoost -= 50;
	}

	/** Replace the preset monster stats with values pulled from the npcdb
	 * content collection. Called by the scene once `/api/npcdb.json`
	 * resolves; safe to call multiple times. The map keys are the
	 * `MonsterKind` values so the scene can pass any sample of NPCs. */
	bindMonstersFromNpcs(
		assignments: Partial<
			Record<MonsterKind, { name: string; hp: number; atk: number }>
		>,
	) {
		for (const [idx, mob] of this.monsters) {
			const a = assignments[mob.kind];
			if (!a) continue;
			mob.name = a.name;
			mob.maxHp = a.hp;
			mob.hp = a.hp;
			mob.atk = a.atk;
			this.monsters.set(idx, mob);
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

	snapshot(): Uint8Array {
		let total = SNAPSHOT_HEADER + this.stock.length + this.waste.length;
		for (let i = 0; i < 4; i++) total += this.foundations[i].length;
		for (let i = 0; i < 7; i++) total += this.tableaus[i].length;
		const out = new Uint8Array(total);
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

		let cursor = SNAPSHOT_HEADER;
		this.stock = new Array(stockLen);
		for (let i = 0; i < stockLen; i++) this.stock[i] = snap[cursor++];
		this.waste = new Array(wasteLen);
		for (let i = 0; i < wasteLen; i++) this.waste[i] = snap[cursor++];
		for (let f = 0; f < 4; f++) {
			const len = snap[2 + f];
			const arr = new Array<number>(len);
			for (let i = 0; i < len; i++) arr[i] = snap[cursor++];
			this.foundations[f] = arr;
		}
		for (let t = 0; t < 7; t++) {
			const len = snap[6 + t];
			const arr = new Array<number>(len);
			for (let i = 0; i < len; i++) arr[i] = snap[cursor++];
			this.tableaus[t] = arr;
		}
		this.recomputeTableauJokerStats();
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
		this.score -= SCORE.undoCost;
		return true;
	}

	canUndo(): boolean {
		return this.history.length > 0;
	}

	/** Tally a move. `isFoundation` extends combo + applies joker multiplier
	 * on positive points. Negative points (e.g. foundation → tableau) reset
	 * combo and skip multipliers. SCORE.movePerAction is subtracted AFTER
	 * any multipliers so the per-move tax is flat. Score is allowed to go
	 * negative — that's the pressure signal. */
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

			const jokerMult =
				1 + this.tableauJokerCount * JOKER_MULT_PER_TABLEAU;
			const base = points + this.tableauScoreBoost;
			delta = Math.round(
				base * this.comboMultiplier * jokerMult * this.attack,
			);
		} else {
			this.combo = 0;
			this.comboMultiplier = 1;
			delta = points;
		}
		this.score = this.score + delta - SCORE.movePerAction;
		this.moves += 1;
		this.maybeClearFreezeAtEndgame();
	}

	/** Each mutator pushes history on success so undo rolls back the
	 * full pile + score state. Played-3 draw model: leftover waste cards
	 * cycle back to the BOTTOM of stock face-down so all 3 visible cards
	 * stay player-selectable. Monster draws auto-divert into the tableau;
	 * the freeze rotates per stock click. */

	drawFromStock(): boolean {
		if (this.stock.length === 0 && this.waste.length === 0) {
			this.maybeClearFreezeAtEndgame();
			return false;
		}
		this.pushHistory();

		let recyclePoints = 0;
		let recycleHp = 0;
		if (this.waste.length > 0) {
			const wasEmpty = this.stock.length === 0;
			const returned = this.waste.map((c) => setFaceUp(c, false));
			this.waste = [];
			this.stock = [...returned, ...this.stock];
			if (wasEmpty) {
				this.stockCycles += 1;
				if (this.stockCycles > 1) {
					recyclePoints = SCORE.stockRecycle;
					recycleHp = HP.stockRecyclePenalty;
				}
			}
		}

		if (this.stock.length === 0) {
			this.applyScore(recyclePoints, false);
			if (recycleHp) this.damage(recycleHp);
			return true;
		}

		const drawCount = Math.min(STOCK_DRAW_COUNT, this.stock.length);
		for (let i = 0; i < drawCount; i++) {
			const c = this.stock.pop()!;
			this.waste.push(setFaceUp(c, true));
		}
		this.divertMonstersFromWaste();
		this.rotateFreeze();
		while (this.waste.length < STOCK_DRAW_COUNT && this.stock.length > 0) {
			const c = setFaceUp(this.stock.pop()!, true);
			if (isMonster(c)) {
				this.placeMonsterInTableau(c);
			} else {
				this.waste.push(c);
			}
		}
		this.applyScore(recyclePoints, false);
		if (recycleHp) this.damage(recycleHp);
		return true;
	}

	/** Pull any face-up monster cards out of the waste and route them to a
	 * tableau column so combat happens in-board, not in the discard pile. */
	private divertMonstersFromWaste() {
		for (let i = this.waste.length - 1; i >= 0; i--) {
			const c = this.waste[i];
			if (!isMonster(c)) continue;
			this.waste.splice(i, 1);
			this.placeMonsterInTableau(c);
		}
	}

	/** Pick a fresh card to freeze and clear the previous one. Skips
	 * monsters (combat targets stay engageable) and face-down cards (the
	 * player can't see what's frozen). No-op when no candidates exist. */
	private rotateFreeze() {
		this.frozenCards.clear();
		if (this.stock.length === 0 && this.waste.length === 0) return;
		const candidates: number[] = [];
		for (const col of this.tableaus) {
			for (const c of col) {
				if (!isFaceUp(c)) continue;
				if (isMonster(c)) continue;
				candidates.push(c & IDENTITY_MASK);
			}
		}
		if (candidates.length === 0) return;
		const pick = candidates[Math.floor(Math.random() * candidates.length)];
		this.frozenCards.add(pick);
	}

	/** True when the card index is currently frozen. Exposed to the scene
	 * for hover/drag-start checks + frozen-ring visibility. */
	isFrozen(idx: number): boolean {
		return this.frozenCards.has(idx);
	}

	/** Lift any active freeze when stock + waste are both empty — the
	 * freeze normally rotates on stock click, but at endgame no draw is
	 * possible so a frozen card would permanently lock foundation moves.
	 * Returns true if freeze was cleared (caller can refresh visuals). */
	private maybeClearFreezeAtEndgame(): boolean {
		if (this.frozenCards.size === 0) return false;
		if (this.stock.length > 0 || this.waste.length > 0) return false;
		this.frozenCards.clear();
		return true;
	}

	/** Helper used by `moveTableauRun` to reject runs whose first card —
	 * or any card — is frozen. */
	private runHasFrozen(run: number[]): boolean {
		for (const c of run) {
			if (this.frozenCards.has(c & IDENTITY_MASK)) return true;
		}
		return false;
	}

	/** Append a monster card face-up to the least-crowded tableau column,
	 * then trigger the engage hit (one-time `atk` damage to the player).
	 * Bypasses `canDropOnTableau` on purpose — the monster crashing into
	 * the column is a state event, not a player move. */
	private placeMonsterInTableau(card: CardByte) {
		const placed = setFaceUp(card, true);
		let target = 0;
		for (let col = 1; col < 7; col++) {
			if (this.tableaus[col].length < this.tableaus[target].length) {
				target = col;
			}
		}
		this.tableaus[target].push(placed);
		const idx = placed & IDENTITY_MASK;
		const mob = this.monsters.get(idx);
		if (mob && !mob.engaged) {
			mob.engaged = true;
			this.damage(mob.atk);
		}
	}

	moveWasteToTableau(toCol: number, wasteIdx?: number): boolean {
		const idx = wasteIdx ?? this.waste.length - 1;
		const c = this.waste[idx];
		if (c === undefined) return false;
		if (!canDropOnTableau(c, this.tableaus[toCol])) return false;
		this.pushHistory();
		this.waste.splice(idx, 1);
		this.tableaus[toCol].push(c);
		this.onTableauJokerAdded(c);
		this.applyScore(SCORE.wasteToTableau, false);
		return true;
	}

	moveWasteToFoundation(foundIdx: number, wasteIdx?: number): boolean {
		const idx = wasteIdx ?? this.waste.length - 1;
		const c = this.waste[idx];
		if (c === undefined) return false;
		if (getSuit(c) !== FOUNDATION_SUITS[foundIdx]) return false;
		if (!canDropOnFoundation(c, this.foundations[foundIdx])) return false;
		this.pushHistory();
		this.waste.splice(idx, 1);
		this.foundations[foundIdx].push(c);
		const cardIdx = c & IDENTITY_MASK;
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
		this.maybeClearFreezeAtEndgame();
		if (this.runHasFrozen(run)) return false;
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
		this.maybeClearFreezeAtEndgame();
		if (this.frozenCards.has(c & IDENTITY_MASK)) return false;
		if (getSuit(c) !== FOUNDATION_SUITS[foundationIdx]) return false;
		if (!canDropOnFoundation(c, this.foundations[foundationIdx]))
			return false;

		this.pushHistory();
		col.pop();
		this.foundations[foundationIdx].push(c);
		const flipped = this.flipExposedTop(fromCol);
		const cardIdx = c & IDENTITY_MASK;
		const firstTime = !this.scoredCards.has(cardIdx);
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
		this.onTableauJokerAdded(c);
		this.applyScore(SCORE.foundationToTableau, false);
		return true;
	}

	private flipExposedTop(col: number): boolean {
		const top = this.tableaus[col][this.tableaus[col].length - 1];
		if (top !== undefined && !isFaceUp(top)) {
			const flipped = setFaceUp(top, true);
			this.tableaus[col][this.tableaus[col].length - 1] = flipped;
			if (isMonster(flipped)) {
				const idx = flipped & IDENTITY_MASK;
				const mob = this.monsters.get(idx);
				if (mob && !mob.engaged) {
					mob.engaged = true;
					this.damage(mob.atk);
				}
			}
			return true;
		}
		return false;
	}

	/** Player clicks a monster card sitting on top of a tableau column to
	 * attack it. Damage = floor(player.attack rounded up to at least 1).
	 * Each click costs SCORE.movePerAction (charged via applyScore). When
	 * monster HP hits 0 the card is removed and `flipExposedTop` runs on
	 * the column so the next card surfaces. Returns true on a valid hit. */
	attackMonster(col: number): boolean {
		const pile = this.tableaus[col];
		const top = pile[pile.length - 1];
		if (top === undefined || !isFaceUp(top) || !isMonster(top))
			return false;
		const idx = top & IDENTITY_MASK;
		const mob = this.monsters.get(idx);
		if (!mob) return false;

		this.pushHistory();
		const dmg = Math.max(1, Math.floor(this.attack));
		mob.hp = Math.max(0, mob.hp - dmg);

		const points = SCORE.wasteToTableau;
		if (mob.hp === 0) {
			pile.pop();
			this.monsters.delete(idx);
			this.flipExposedTop(col);
			this.applyScore(points + mob.maxHp * 5, false);
		} else {
			this.applyScore(points, false);
		}
		return true;
	}

	/** Player drag-drops a bonus card from the waste onto the activate
	 * slot. Validates the index is a bonus, applies the effect, splices it
	 * out, pushes history, and pays the per-action cost. */
	activateBonusFromWaste(wasteIdx: number): boolean {
		const c = this.waste[wasteIdx];
		if (c === undefined || !isBonus(c)) return false;
		this.pushHistory();
		this.waste.splice(wasteIdx, 1);
		this.applyBonusEffect(getBonusType(c));
		this.applyScore(0, false);
		return true;
	}

	/** Player drag-drops a bonus card from the top of a tableau column onto
	 * the activate slot. Bonus must be the topmost card and face-up. */
	activateBonusFromTableau(col: number): boolean {
		const pile = this.tableaus[col];
		const c = pile[pile.length - 1];
		if (c === undefined || !isFaceUp(c) || !isBonus(c)) return false;
		this.maybeClearFreezeAtEndgame();
		if (this.frozenCards.has(c & IDENTITY_MASK)) return false;
		this.pushHistory();
		pile.pop();
		this.applyBonusEffect(getBonusType(c));
		this.flipExposedTop(col);
		this.applyScore(0, false);
		return true;
	}

	private applyBonusEffect(type: BonusType) {
		switch (type) {
			case BonusType.HP:
				this.heal(5);
				break;
			case BonusType.Cash:
				this.cash += 5;
				break;
			case BonusType.Reveal:
				this.revealRandomHiddenCard();
				break;
		}
	}

	/** Mark one random face-down tableau card as "peeked" — the byte stays
	 * face-down (so rules + drag are unchanged) but the scene reveals its
	 * face on hover. Skips cards already peeked. No-op when every tableau
	 * card is face-up or peeked. */
	private revealRandomHiddenCard() {
		const candidates: number[] = [];
		for (let col = 0; col < 7; col++) {
			for (let i = 0; i < this.tableaus[col].length; i++) {
				const c = this.tableaus[col][i];
				const idx = c & IDENTITY_MASK;
				if (!isFaceUp(c) && !this.peekedCards.has(idx)) {
					candidates.push(idx);
				}
			}
		}
		if (candidates.length === 0) return;
		const pick = candidates[Math.floor(Math.random() * candidates.length)];
		this.peekedCards.add(pick);
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

	getRank(c: CardByte): number {
		return getDisplayRank(c);
	}
}

function nowMs(): number {
	return typeof performance !== 'undefined' && performance.now
		? performance.now()
		: Date.now();
}

function blindForRound(round: number): number {
	if (round - 1 < ROUND_BLINDS.length) return ROUND_BLINDS[round - 1];
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
		/* quota / privacy mode — silent */
	}
}
