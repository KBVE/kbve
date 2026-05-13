import { CARD_SIZE } from '../config';
import type { Card } from '../cards';
import type { CardPlacement, HandOwner } from '../animation/dealerAnimation';

interface PlacementCacheEntry {
	cards: Card[];
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
		if (this.matchesPlacementCache(cached, cards, centerX, y, hideHole)) {
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
			cards: cards.slice(),
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
		centerX: number,
		y: number,
		hideHole: boolean,
	): cached is PlacementCacheEntry {
		if (
			!cached ||
			cached.centerX !== centerX ||
			cached.y !== y ||
			cached.hideHole !== hideHole ||
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
