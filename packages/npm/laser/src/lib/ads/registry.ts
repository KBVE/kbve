import type { AdCreative } from './types';

/**
 * Weighted pick from a creative pool. Rotation only (not gameplay state), so the
 * RNG is injectable but defaults to Math.random — no simgrid determinism contract.
 * Returns null for an empty/all-zero-weight pool so callers can render nothing.
 */
export function pickAd(
	ads: readonly AdCreative[],
	rand: () => number = Math.random,
): AdCreative | null {
	if (ads.length === 0) return null;
	const weights = ads.map((a) =>
		a.weight == null ? 1 : Math.max(0, a.weight),
	);
	const total = weights.reduce((s, w) => s + w, 0);
	if (total <= 0) return null;
	let roll = rand() * total;
	for (let i = 0; i < ads.length; i++) {
		roll -= weights[i];
		if (roll < 0) return ads[i];
	}
	return ads[ads.length - 1];
}

/**
 * Mutable cross-promo pool. Games register their creatives once and let the boot
 * screen pull a weighted pick each load; future ads need only a register() call.
 */
export class AdRegistry {
	private readonly ads = new Map<string, AdCreative>();

	register(...creatives: AdCreative[]): this {
		for (const c of creatives) this.ads.set(c.id, c);
		return this;
	}

	remove(id: string): this {
		this.ads.delete(id);
		return this;
	}

	clear(): this {
		this.ads.clear();
		return this;
	}

	list(): AdCreative[] {
		return [...this.ads.values()];
	}

	pick(rand: () => number = Math.random): AdCreative | null {
		return pickAd(this.list(), rand);
	}
}

/** Shared registry instance for games that want a single global ad pool. */
export const laserAds = new AdRegistry();
