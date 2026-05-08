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
