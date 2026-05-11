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

export interface Card {
	id: string;
	suit: Suit;
	rank: Rank;
}

export interface HandValue {
	total: number;
	soft: boolean;
}

const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: readonly Rank[] = [
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
];

export const SUIT_GLYPH: Record<Suit, string> = {
	spades: '♠',
	hearts: '♥',
	diamonds: '♦',
	clubs: '♣',
};

export function isRedSuit(suit: Suit): boolean {
	return suit === 'hearts' || suit === 'diamonds';
}

export function buildShoe(decks: number): Card[] {
	const shoe: Card[] = [];
	for (let deck = 0; deck < decks; deck++) {
		for (const suit of SUITS) {
			for (const rank of RANKS) {
				shoe.push({
					id: `${deck}-${suit}-${rank}`,
					suit,
					rank,
				});
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
	if (card.rank === 'A') return 11;
	if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J') return 10;
	return Number(card.rank);
}

export function valueHand(cards: readonly Card[]): HandValue {
	let total = 0;
	let aces = 0;

	for (const card of cards) {
		total += cardPoints(card);
		if (card.rank === 'A') aces++;
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
