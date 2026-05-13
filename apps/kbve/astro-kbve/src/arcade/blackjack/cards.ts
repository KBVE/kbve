export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank =
	| 'A'
	| '2'
	| '3'
	| '4'
	| '5'
	| '6'
	| '7'
	| '8'
	| '9'
	| '10'
	| 'J'
	| 'Q'
	| 'K';

export type CardByte = number;
export type Card = CardByte;

export interface HandValue {
	total: number;
	soft: boolean;
}

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
const RANKS = [
	'A',
	'2',
	'3',
	'4',
	'5',
	'6',
	'7',
	'8',
	'9',
	'10',
	'J',
	'Q',
	'K',
] as const;

const RANK_MASK = 0b1111;
const SUIT_MASK = 0b11;
const SUIT_SHIFT = 4;
const CARD_BYTE_MASK = 0b111111;
const CARDS_PER_DECK = SUITS.length * RANKS.length;
const RANK_POINTS = [11, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10] as const;

export const SUIT_GLYPH: Record<Suit, string> = {
	spades: '♠',
	hearts: '♥',
	diamonds: '♦',
	clubs: '♣',
};

export function isRedSuit(suit: Suit): boolean {
	return suit === 'hearts' || suit === 'diamonds';
}

export function encodeCard(suit: Suit, rank: Rank): Card {
	const suitIndex = SUITS.indexOf(suit);
	const rankIndex = RANKS.indexOf(rank);

	return (suitIndex << SUIT_SHIFT) | rankIndex;
}

export function cardSuit(card: Card): Suit {
	return SUITS[(card >> SUIT_SHIFT) & SUIT_MASK];
}

export function cardRank(card: Card): Rank {
	return RANKS[card & RANK_MASK];
}

export function cardId(card: Card): string {
	return `${cardSuit(card)}-${cardRank(card)}`;
}

export function buildShoe(decks: number): Card[] {
	const shoe = new Array<Card>(decks * CARDS_PER_DECK);
	let index = 0;
	for (let deck = 0; deck < decks; deck++) {
		for (let suitIndex = 0; suitIndex < SUITS.length; suitIndex++) {
			for (let rankIndex = 0; rankIndex < RANKS.length; rankIndex++) {
				shoe[index] = (suitIndex << SUIT_SHIFT) | rankIndex;
				index++;
			}
		}
	}
	return shoe;
}

export function shuffleCards(cards: readonly Card[]): Card[] {
	const out = cards.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

export function cardPoints(card: Card): number {
	return RANK_POINTS[card & RANK_MASK];
}

export function valueHand(cards: readonly Card[]): HandValue {
	let total = 0;
	let aces = 0;

	for (let i = 0; i < cards.length; i++) {
		const card = cards[i];
		total += cardPoints(card);
		if ((card & RANK_MASK) === 0) aces++;
	}

	while (total > 21 && aces > 0) {
		total -= 10;
		aces--;
	}

	return {
		total,
		soft: aces > 0,
	};
}

export function isBlackjack(cards: readonly Card[]): boolean {
	return cards.length === 2 && valueHand(cards).total === 21;
}

export function handFingerprint(cards: readonly Card[]): number {
	let fingerprint = cards.length & 0xff;
	const packedCards = Math.min(cards.length, 4);

	for (let i = 0; i < packedCards; i++) {
		fingerprint |= (cards[i] & CARD_BYTE_MASK) << (8 + i * 6);
	}

	for (let i = packedCards; i < cards.length; i++) {
		fingerprint = Math.imul(
			fingerprint ^ (cards[i] & CARD_BYTE_MASK),
			16777619,
		);
	}

	return fingerprint >>> 0;
}
