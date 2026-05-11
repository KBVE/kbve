export const BASE_WIDTH = 1280;
export const BASE_HEIGHT = 800;

export const CARD_SIZE = {
	width: 108,
	height: 154,
	radius: 12,
} as const;

export const FONT = {
	serif: '"Cormorant Garamond", "Playfair Display", Georgia, "Times New Roman", serif',
	sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
	mono: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
} as const;

export const COLORS = {
	background: 0x06100c,
	feltCenter: 0x0c7a4d,
	feltEdge: 0x042619,
	tableTrim: 0xd0a14a,
	tableTrimDark: 0x7a5420,
	panel: 0x0d2118,
	panelStroke: 0xd6a84b,
	cardFace: 0xfffbeb,
	cardBorder: 0x1f2937,
	cardBack: 0x991b1b,
	cardBackAccent: 0xfbbf24,
	tableShadow: 0x020617,
	action: 0x166534,
	red: '#dc2626',
	black: '#111827',
	gold: '#fde68a',
	soft: '#a7f3d0',
	muted: '#cbd5e1',
	danger: '#fca5a5',
} as const;

export const GAME = {
	startingBankroll: 1000,
	defaultBet: 25,
	minBet: 5,
	maxBet: 500,
	decks: 4,
	dealerHitsSoft17: false,
	blackjackPayout: 1.5,
} as const;
