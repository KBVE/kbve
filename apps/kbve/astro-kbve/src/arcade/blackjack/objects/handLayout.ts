import { CARD_SIZE } from '../config';
import { handFingerprint, type Card } from '../cards';
import type { CardPlacement, HandOwner } from '../animation/dealerAnimation';

interface PlacementCacheEntry {
	cards: Uint8Array;
	fingerprint: number;
	centerX: number;
	y: number;
	hideHole: boolean;
	placements: CardPlacement[];
}

export class HandLayout {
	private readonly placementCache = new Map<HandOwner, PlacementCacheEntry>();

	constructor(private readonly textureKey: (card: Card | 'back') => string) {}

	cardPlacements(
		cards: readonly Card[],
		centerX: number,
		y: number,
		hideHole: boolean,
		owner: HandOwner,
	): CardPlacement[] {
		const cached = this.placementCache.get(owner);
		const fingerprint = handFingerprint(cards);
		if (
			this.matchesPlacementCache(
				cached,
				cards,
				fingerprint,
				centerX,
				y,
				hideHole,
			)
		) {
			return cached.placements;
		}

		const totalWidth =
			cards.length * CARD_SIZE.width + Math.max(0, cards.length - 1) * 18;
		let x = centerX - totalWidth / 2;
		const placements: CardPlacement[] = [];

		cards.forEach((card, index) => {
			placements.push({
				textureKey:
					hideHole && index === 1
						? this.textureKey('back')
						: this.textureKey(card),
				x,
				y,
				owner,
				index,
			});
			x += CARD_SIZE.width + 18;
		});
		this.placementCache.set(owner, {
			cards: Uint8Array.from(cards),
			fingerprint,
			centerX,
			y,
			hideHole,
			placements,
		});
		return placements;
	}

	private matchesPlacementCache(
		cached: PlacementCacheEntry | undefined,
		cards: readonly Card[],
		fingerprint: number,
		centerX: number,
		y: number,
		hideHole: boolean,
	): cached is PlacementCacheEntry {
		if (
			!cached ||
			cached.centerX !== centerX ||
			cached.y !== y ||
			cached.hideHole !== hideHole ||
			cached.fingerprint !== fingerprint ||
			cached.cards.length !== cards.length
		) {
			return false;
		}

		for (let i = 0; i < cards.length; i++) {
			if (cached.cards[i] !== cards[i]) return false;
		}
		return true;
	}
}
