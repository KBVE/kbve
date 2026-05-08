// ============================================================================
// Solitaire — game state (byte-packed)
// ============================================================================
//
// Runtime piles are `number[]` (variable-length, cheap mutation). Snapshots
// for undo are `Uint8Array` — packed with a tiny header so an entire game
// state takes ~64 bytes (12 byte header + 52 card bytes). The whole undo
// stack for a 200-move game is ~13KB — small enough to keep in memory
// indefinitely.
//
// Snapshot layout (Uint8Array):
//   [0]                  stock length          (1 byte)
//   [1]                  waste length          (1 byte)
//   [2..5]               foundation lengths    (4 bytes, 0..13 each)
//   [6..12]              tableau lengths       (7 bytes, 0..52 each)
//   [13..]               packed card bytes in order:
//                          stock, waste, fnd0, fnd1, fnd2, fnd3,
//                          tab0, tab1, tab2, tab3, tab4, tab5, tab6

import {
	dealBytes,
	FOUNDATION_SUITS,
	getSuit,
	isFaceUp,
	setFaceUp,
	type CardByte,
} from './cards';
import {
	canDropOnFoundation,
	canDropOnTableau,
	isWin,
	movableRun,
} from './rules';

const SNAPSHOT_HEADER = 13;
const SNAPSHOT_TOTAL = SNAPSHOT_HEADER + 52;

export class GameState {
	stock: number[] = [];
	waste: number[] = [];
	foundations: number[][] = [[], [], [], []];
	tableaus: number[][] = [[], [], [], [], [], [], []];

	/** Frozen snapshots; pushed before every successful move. */
	private history: Uint8Array[] = [];
	private static readonly MAX_HISTORY = 256;

	reset(rng?: () => number) {
		const { tableaus, stock } = dealBytes(rng);
		this.tableaus = tableaus;
		this.stock = stock;
		this.waste = [];
		this.foundations = [[], [], [], []];
		this.history = [];
	}

	// -------------------------------------------------------------------
	// Snapshot / undo
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

	private pushHistory() {
		this.history.push(this.snapshot());
		if (this.history.length > GameState.MAX_HISTORY) {
			// Drop oldest. Slow path; acceptable for an undo cap.
			this.history.shift();
		}
	}

	undo(): boolean {
		const snap = this.history.pop();
		if (!snap) return false;
		this.restore(snap);
		return true;
	}

	canUndo(): boolean {
		return this.history.length > 0;
	}

	// -------------------------------------------------------------------
	// Mutators — each pushes history on success so undo is free.
	// -------------------------------------------------------------------

	drawFromStock(): boolean {
		if (this.stock.length === 0 && this.waste.length === 0) return false;
		this.pushHistory();
		if (this.stock.length === 0) {
			while (this.waste.length > 0) {
				const c = this.waste.pop()!;
				this.stock.push(setFaceUp(c, false));
			}
			return true;
		}
		const c = this.stock.pop()!;
		this.waste.push(setFaceUp(c, true));
		return true;
	}

	moveWasteToTableau(toCol: number): boolean {
		const c = this.waste[this.waste.length - 1];
		if (c === undefined) return false;
		if (!canDropOnTableau(c, this.tableaus[toCol])) return false;
		this.pushHistory();
		this.waste.pop();
		this.tableaus[toCol].push(c);
		return true;
	}

	moveWasteToFoundation(idx: number): boolean {
		const c = this.waste[this.waste.length - 1];
		if (c === undefined) return false;
		// Foundation slot is suit-locked: slot index determines which suit
		// it accepts. Prevents the "Ace of Spades on Hearts slot, stuck"
		// trap.
		if (getSuit(c) !== FOUNDATION_SUITS[idx]) return false;
		if (!canDropOnFoundation(c, this.foundations[idx])) return false;
		this.pushHistory();
		this.waste.pop();
		this.foundations[idx].push(c);
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
		this.flipExposedTop(fromCol);
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
		this.flipExposedTop(fromCol);
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
		return true;
	}

	private flipExposedTop(col: number) {
		const top = this.tableaus[col][this.tableaus[col].length - 1];
		if (top !== undefined && !isFaceUp(top)) {
			this.tableaus[col][this.tableaus[col].length - 1] = setFaceUp(
				top,
				true,
			);
		}
	}

	hasWon(): boolean {
		return isWin(this.foundations);
	}

	/** All cards that exist in the deck (stock + waste + foundations + tableaus).
	 * Used by the scene's per-card view map at startup. Order is meaningless. */
	allCards(): CardByte[] {
		const out: CardByte[] = [];
		for (const c of this.stock) out.push(c);
		for (const c of this.waste) out.push(c);
		for (const f of this.foundations) for (const c of f) out.push(c);
		for (const t of this.tableaus) for (const c of t) out.push(c);
		return out;
	}
}
