// ============================================================================
// Solitaire — game configuration
// ============================================================================

export const BASE_WIDTH = 960;
/** Tall enough to fit a worst-case 13-card face-up tableau column without
 * clipping the bottom. (TABLEAU_Y + 12*24 + CARD_HEIGHT ≈ 240 + 288 + 112 = 640) */
export const BASE_HEIGHT = 760;

export const CARD_SIZE = {
	width: 84,
	height: 118,
	radius: 8,
} as const;

/** Vertical offset between stacked face-up cards in a tableau column.
 * Compact enough to fit ~13 cards in a column without overflowing. */
export const TABLEAU_FAN_Y = 26;
/** Vertical offset between stacked face-DOWN cards (tighter than face-up). */
export const TABLEAU_FAN_Y_DOWN = 14;

/** Top-row layout: foundations on the right, stock + waste on the left. */
export const TOP_ROW_Y = 64;
export const STOCK_X = 56;
export const WASTE_X = STOCK_X + CARD_SIZE.width + 24;
export const FOUNDATION_X_START =
	BASE_WIDTH - 56 - CARD_SIZE.width * 4 - 22 * 3;
export const FOUNDATION_GAP = CARD_SIZE.width + 22;

/** Tableau (7 columns) — first column at TABLEAU_X_START, gap between. */
export const TABLEAU_X_START = 56;
export const TABLEAU_X_GAP = (BASE_WIDTH - 112 - CARD_SIZE.width) / 6;
export const TABLEAU_Y = TOP_ROW_Y + CARD_SIZE.height + 40;

export const COLORS = {
	// Table layers (bottom → top)
	tableEdge: 0x081a12, // very dark — outer "wood" frame
	tableTrim: 0xb38b3e, // muted gold trim between edge and felt
	tableTrimDark: 0x6e5022, // shadow side of the trim
	background: 0x0d5a35, // felt green (canvas clear color)
	feltCenter: 0x0f6b3f, // slightly brighter at center for vignette
	feltEdge: 0x062a18, // darker at edges to fake a soft vignette
	boardFill: 0x0a4f2e, // play-zone panel
	boardBorder: 0xb38b3e, // gold board border (matches trim)
	boardInnerStroke: 0x0d3b24, // dark inner stroke for inset depth
	// Cards
	cardFace: 0xffffff,
	cardBack: 0x1e3a8a,
	cardBackPattern: 0x3b82f6,
	cardBorder: 0x111827,
	// Slots
	slot: 0x064529,
	slotBorder: 0x064e36,
	slotHighlight: 0x10b981,
	slotHighlightBorder: 0xfbbf24,
	highlight: 0xfbbf24,
	// Suits
	suitRed: 0xdc2626,
	suitBlack: 0x111827,
	// Jokers — wild card visuals. Body uses a deep purple → gold gradient
	// (not literal — solid fill with gold accents) so jokers read distinct
	// from the standard 52 even at a glance.
	jokerFace: 0x312e81, // deep indigo body
	jokerAccent: 0xfbbf24, // gold trim + glyph for both joker colors
	jokerStripe: 0x6366f1, // mid-purple for the diagonal stripe
	jokerRedTint: 0xf87171, // red joker pip
	jokerBlackTint: 0x1f2937, // black joker pip
	// HUD
	winText: '#fbbf24',
	hintText: '#d1d5db',
} as const;

/** Padding around each board zone (top row + tableau). Used to size the
 * darker felt panel that subdivides the play surface. */
export const BOARD_PADDING = 18;
export const BOARD_RADIUS = 14;

export const TIMING = {
	dealDelay: 30, // ms between cards during initial deal
	flipMs: 200,
	moveMs: 180,
} as const;

// ============================================================================
// Scoring + run progression (Balatro-flavored Klondike)
// ============================================================================

/** Score awarded per move type. Mirrors the classic Klondike value table
 * with foundation placements weighted heavier so combo-chasing pays. */
export const SCORE = {
	wasteToTableau: 5,
	wasteToFoundation: 10,
	tableauToFoundation: 15,
	foundationToTableau: -15,
	revealTableau: 5, // bonus for flipping a face-down card on the move
	stockRecycle: -100, // first pass is free; subsequent recycles cost

	/** Flat cost levied on every move (any pile-mutating action — drag drop,
	 * stock click, double-click auto-foundation). Spaces play out so brute
	 * forcing isn't free. Subtracted AFTER combo + joker multipliers, so a
	 * big chain still nets positive. Tune downward if rounds feel grindy. */
	movePerAction: 5,
	/** Flat cost on each undo. Discourages spam-undo for trial-and-error
	 * exploration without locking it out entirely. Applied after the
	 * restore (so undoing repeatedly stacks the cost). */
	undoCost: 5,
} as const;

/** Combo: consecutive foundation placements within `comboWindowMs` extend
 * the combo and apply a multiplier to that placement's score. Resets on any
 * non-foundation move or timeout. */
export const COMBO = {
	windowMs: 4000,
	/** Multiplier per combo length (index = combo length - 1). Length 1 has
	 * no multiplier; length 2 doubles; cap at 5x. */
	tiers: [1, 1.5, 2, 3, 5] as const,
} as const;

/** Joker multiplier: each joker sitting in tableau adds +0.5x to foundation
 * placements while it's there. Two jokers in play = ×2. Encourages keeping
 * jokers in board instead of dumping them. */
export const JOKER_MULT_PER_TABLEAU = 0.5;

/** Round / blind progression. Index = round number - 1. After the table,
 * blinds scale 1.6× per round indefinitely (caps in practice when player
 * loses or quits). */
export const ROUND_BLINDS: readonly number[] = [
	200, 500, 900, 1500, 2400, 3600, 5200, 7200,
];

/** Currency earned at end of round = score / cashRate (rounded). Spent in
 * the shop on jokers / boosts. */
export const CASH_RATE = 10;

/** Shop offering count per round. */
export const SHOP_OFFERS = 3;

/** Storage key for run persistence (best score, run count). Bump suffix
 * if the schema changes. */
export const STORAGE_KEY = 'kbve.solitaire.v1';

export const HUD_COLORS = {
	scoreText: '#fde68a',
	comboText: '#fbbf24',
	comboPulse: '#f59e0b',
	roundText: '#e5e7eb',
	blindText: '#fca5a5',
	cashText: '#86efac',
	hudBg: 0x1a2e1d,
	hudBorder: 0xb38b3e,
} as const;
