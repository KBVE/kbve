// Barrel for the solitaire game module. Imported by the arcade route + any
// embedding component that wants programmatic access to the scene / engine.
//
// The engine is byte-packed: piles are `number[]` where each element is a
// `CardByte`. Use `toCardView(byte)` at the UI boundary to inflate.

export { SolitaireScene } from './SolitaireScene';
export { GameState } from './state';
export {
	type CardByte,
	type CardView,
	type Suit,
	type Color,
	SuitByte,
	ColorByte,
	SUIT_LABEL,
	SUIT_GLYPH,
	RANK_LABEL,
	buildDeckBytes,
	shuffleBytes,
	dealBytes,
	packCard,
	getRank,
	getDisplayRank,
	getSuit,
	isFaceUp,
	setFaceUp,
	getColor,
	getCardId,
	getCardLabel,
	toCardView,
} from './cards';
export {
	canDropOnFoundation,
	canDropOnTableau,
	movableRun,
	isWin,
} from './rules';
