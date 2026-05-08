// ============================================================================
// Solitaire — game configuration
// ============================================================================

/** Logical board dimensions. Matched to the Astro container's 6/5 aspect
 * ratio so Phaser's Scale.FIT renders 1:1 at typical desktop widths. */
export const BASE_WIDTH = 1080;
export const BASE_HEIGHT = 900;

export const CARD_SIZE = {
	width: 100,
	height: 140,
	radius: 10,
} as const;

/** Vertical offset between stacked face-up cards in a tableau column.
 * Roomier fan reads better at the new card size. */
export const TABLEAU_FAN_Y = 32;
/** Vertical offset between stacked face-DOWN cards (tighter than face-up). */
export const TABLEAU_FAN_Y_DOWN = 18;

/** Top-row layout: foundations on the right, stock + waste on the left. */
export const TOP_ROW_Y = 96;
export const STOCK_X = 60;
export const WASTE_X = STOCK_X + CARD_SIZE.width + 28;
export const FOUNDATION_X_START =
	BASE_WIDTH - 60 - CARD_SIZE.width * 4 - 24 * 3;
export const FOUNDATION_GAP = CARD_SIZE.width + 24;

/** Tableau (7 columns) — first column at TABLEAU_X_START, gap between. */
export const TABLEAU_X_START = 60;
export const TABLEAU_X_GAP = (BASE_WIDTH - 120 - CARD_SIZE.width) / 6;
export const TABLEAU_Y = TOP_ROW_Y + CARD_SIZE.height + 52;

/** Font stacks. Serif for prestige numbers (score, round, banner) — reads
 * "card table at the casino". Sans for utility (controls hint, card pips). */
export const FONT = {
	serif: '"Cormorant Garamond", "Playfair Display", Georgia, "Times New Roman", serif',
	sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
	mono: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
} as const;

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

/** HP system — Balatro-style "lives". Damage from stock-recycle pressure;
 * 0 HP triggers game over mid-round. Missing the blind at end of round is
 * an instant game over (no HP cushion). */
export const HP = {
	start: 20,
	max: 20,
	/** Damage when stock recycle (cycle 2+) costs HP in addition to score. */
	stockRecyclePenalty: 1,
} as const;

/** Combat stats — Armor reduces incoming damage, Attack multiplies
 * foundation score on top of combo + joker mults. Both buyable in shop. */
export const STATS = {
	startArmor: 0,
	startAttack: 1,
	/** Per-point armor: incoming damage reduced by this amount (min 1 still
	 * goes through unless armor is high enough to fully absorb). */
	armorReduction: 1,
	/** Per-point attack adds this much to the multiplier (1 base + n×step). */
	attackStep: 0.25,
} as const;

/** Shop offering catalogue. Each round shuffles a subset of these into
 * the modal. */
export const SHOP_PRICES = {
	jokerMultiplier: 5,
	jokerScoreBoost: 8,
	armorPoint: 6,
	attackPoint: 10,
	healSmall: 3, // +5 HP (capped at maxHp)
	maxHpUp: 12, // +5 maxHp + heal that much
} as const;

/** Stock draw count. Klondike traditional = 1; we run 3 for richer flow.
 * Only the top of the fanned waste is grabbable; the two beneath show as
 * a peek so the player can plan ahead. */
export const STOCK_DRAW_COUNT = 3;

/** Horizontal fan offset between visible waste cards. Top of pile is
 * fully visible; cards beneath peek by this amount. */
export const WASTE_FAN_X = 22;

/** Shop offering count per round. */
export const SHOP_OFFERS = 3;

/** Storage key for run persistence (best score, run count). Bump suffix
 * if the schema changes. */
export const STORAGE_KEY = 'kbve.solitaire.v1';

export const HUD_COLORS = {
	scoreText: '#fde68a',
	scoreNegative: '#f87171', // red when score below 0
	comboText: '#fbbf24',
	comboPulse: '#f59e0b',
	roundText: '#e5e7eb',
	blindText: '#fca5a5',
	cashText: '#86efac',
	hpText: '#fca5a5',
	hpFill: 0xdc2626,
	hpBg: 0x4a1010,
	hudBg: 0x1a2e1d,
	hudBorder: 0xb38b3e,
} as const;
