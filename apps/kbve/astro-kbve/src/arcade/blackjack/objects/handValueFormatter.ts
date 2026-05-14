import {
	cardPoints,
	handFingerprint,
	type Card,
	type HandValue,
} from '../cards';

interface HandValueCacheEntry {
	fingerprint: number;
	visibleCount: number;
	cards: Uint8Array;
	label: string;
}

const CARD_BYTE_MASK = 0b111111;
const RANK_MASK = 0b1111;

export class HandValueFormatter {
	private readonly labelCache = new Map<string, HandValueCacheEntry>();

	label(
		cacheKey: string,
		prefix: string,
		cards: readonly Card[],
		visibleCount = cards.length,
	): string {
		const cappedVisibleCount = Math.min(visibleCount, cards.length);
		if (cappedVisibleCount === 0) return `${prefix}: -`;

		const cached = this.labelCache.get(cacheKey);
		const fingerprint = this.visibleFingerprint(cards, cappedVisibleCount);
		if (this.matchesCache(cached, cards, cappedVisibleCount, fingerprint)) {
			return cached.label;
		}

		const value = this.valueVisible(cards, cappedVisibleCount);
		const natural =
			cappedVisibleCount === 2 && value.total === 21 ? ' blackjack' : '';
		const label = `${prefix}  ${value.total}${value.soft ? ' soft' : ''}${natural}`;
		this.labelCache.set(cacheKey, {
			fingerprint,
			visibleCount: cappedVisibleCount,
			cards: this.snapshot(cards, cappedVisibleCount),
			label,
		});
		return label;
	}

	private visibleFingerprint(
		cards: readonly Card[],
		visibleCount: number,
	): number {
		if (visibleCount === cards.length) return handFingerprint(cards);

		let fingerprint = visibleCount & 0xff;
		const packedCards = Math.min(visibleCount, 4);
		for (let i = 0; i < packedCards; i++) {
			fingerprint |= (cards[i] & CARD_BYTE_MASK) << (8 + i * 6);
		}
		for (let i = packedCards; i < visibleCount; i++) {
			fingerprint = Math.imul(
				fingerprint ^ (cards[i] & CARD_BYTE_MASK),
				16777619,
			);
		}
		return fingerprint >>> 0;
	}

	private valueVisible(
		cards: readonly Card[],
		visibleCount: number,
	): HandValue {
		let total = 0;
		let aces = 0;
		for (let i = 0; i < visibleCount; i++) {
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

	private matchesCache(
		cached: HandValueCacheEntry | undefined,
		cards: readonly Card[],
		visibleCount: number,
		fingerprint: number,
	): cached is HandValueCacheEntry {
		if (
			!cached ||
			cached.visibleCount !== visibleCount ||
			cached.fingerprint !== fingerprint ||
			cached.cards.length !== visibleCount
		) {
			return false;
		}

		for (let i = 0; i < visibleCount; i++) {
			if (cached.cards[i] !== cards[i]) return false;
		}
		return true;
	}

	private snapshot(cards: readonly Card[], visibleCount: number): Uint8Array {
		const snapshot = new Uint8Array(visibleCount);
		for (let i = 0; i < visibleCount; i++) {
			snapshot[i] = cards[i];
		}
		return snapshot;
	}
}
