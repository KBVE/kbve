import { useEffect, useMemo, useState } from 'react';
import { listActive, type MarketListing, MarketApiError } from './api';
import { formatKhash, formatRelative, itemRefLabel } from './format';
import MCTextureImage from '../mcdb/MCTextureImage';

type Props = {
	ref: string;
	excludeListingId?: number;
};

const PAGE_LIMIT = 100;
const CARD_LIMIT = 6;

type ItemRef = {
	kind?: unknown;
	id?: unknown;
	display_name?: unknown;
	category?: unknown;
};

function matches(itemRef: unknown, targetRef: string): boolean {
	if (!itemRef || typeof itemRef !== 'object') return false;
	const r = itemRef as ItemRef;
	if (r.kind !== 'mc_item') return false;
	if (r.id === null || r.id === undefined) return false;
	return String(r.id) === targetRef;
}

function buyNowSort(a: MarketListing, b: MarketListing): number {
	const av = a.buy_now_price;
	const bv = b.buy_now_price;
	if (av === null && bv === null) return 0;
	if (av === null) return 1;
	if (bv === null) return -1;
	return av - bv;
}

function median(sortedAsc: number[]): number | null {
	if (sortedAsc.length === 0) return null;
	const mid = Math.floor(sortedAsc.length / 2);
	if (sortedAsc.length % 2 === 1) return sortedAsc[mid];
	return Math.round((sortedAsc[mid - 1] + sortedAsc[mid]) / 2);
}

function extractDisplayName(itemRef: unknown): string {
	if (!itemRef || typeof itemRef !== 'object') return itemRefLabel(itemRef);
	const r = itemRef as ItemRef;
	if (typeof r.display_name === 'string' && r.display_name.length > 0)
		return r.display_name;
	if (typeof r.id === 'string' || typeof r.id === 'number')
		return String(r.id);
	return itemRefLabel(itemRef);
}

function extractCategory(itemRef: unknown): string | null {
	if (!itemRef || typeof itemRef !== 'object') return null;
	const r = itemRef as ItemRef;
	return typeof r.category === 'string' ? r.category : null;
}

export function MCItemMarketSidecar({ ref, excludeListingId }: Props) {
	const [rows, setRows] = useState<MarketListing[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		(async () => {
			try {
				const first = await listActive({ limit: PAGE_LIMIT });
				let combined = first;
				if (first.length >= PAGE_LIMIT) {
					const last = first[first.length - 1];
					const second = await listActive({
						limit: PAGE_LIMIT,
						before_created_at: last.created_at,
						before_id: last.listing_id,
					});
					combined = first.concat(second);
				}
				if (!cancelled) {
					setRows(combined);
					setLoading(false);
				}
			} catch (e) {
				if (cancelled) return;
				setError(
					e instanceof MarketApiError
						? e.message
						: 'failed to load market listings',
				);
				setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [ref]);

	const filtered = useMemo(() => {
		if (!rows) return [];
		return rows.filter(
			(r) =>
				matches(r.item_ref, ref) && r.listing_id !== excludeListingId,
		);
	}, [rows, ref, excludeListingId]);

	const stats = useMemo(() => {
		if (filtered.length === 0) return null;
		const buyNows = filtered
			.map((r) => r.buy_now_price)
			.filter((v): v is number => v !== null)
			.sort((a, b) => a - b);
		const currentBids = filtered
			.map((r) => r.current_bid)
			.filter((v): v is number => v !== null)
			.sort((a, b) => a - b);
		const now = Date.now();
		const futureExpiries = filtered
			.map((r) => new Date(r.expires_at).getTime())
			.filter((t) => Number.isFinite(t) && t > now)
			.sort((a, b) => a - b);
		return {
			count: filtered.length,
			minBuyNow: buyNows.length > 0 ? buyNows[0] : null,
			maxBuyNow: buyNows.length > 0 ? buyNows[buyNows.length - 1] : null,
			medianBuyNow: median(buyNows),
			currentBidMin: currentBids.length > 0 ? currentBids[0] : null,
			currentBidMax:
				currentBids.length > 0
					? currentBids[currentBids.length - 1]
					: null,
			nextExpiry:
				futureExpiries.length > 0
					? new Date(futureExpiries[0]).toISOString()
					: null,
		};
	}, [filtered]);

	const cards = useMemo(() => {
		const sorted = filtered.slice().sort(buyNowSort);
		return sorted.slice(0, CARD_LIMIT);
	}, [filtered]);

	if (loading) {
		return (
			<section className="kbve-market__sidecar mcdb-panel">
				<header className="kbve-market__sidecar-head">
					<h3>Other live listings for this item</h3>
				</header>
				<div className="kbve-market__sidecar-skeleton">
					<div className="kbve-market__sidecar-skeleton-row" />
					<div className="kbve-market__sidecar-skeleton-row" />
					<div className="kbve-market__sidecar-skeleton-row" />
				</div>
			</section>
		);
	}

	if (error) {
		return (
			<section className="kbve-market__sidecar mcdb-panel">
				<header className="kbve-market__sidecar-head">
					<h3>Other live listings for this item</h3>
				</header>
				<div className="kbve-market__status kbve-market__status--error">
					{error}
				</div>
			</section>
		);
	}

	if (!stats || filtered.length === 0) {
		return (
			<section className="kbve-market__sidecar mcdb-panel">
				<header className="kbve-market__sidecar-head">
					<h3>Other live listings for this item</h3>
				</header>
				<div className="kbve-market__sidecar-empty">
					No other active listings for this item.
				</div>
			</section>
		);
	}

	return (
		<section className="kbve-market__sidecar mcdb-panel">
			<header className="kbve-market__sidecar-head">
				<h3>Other live listings for this item</h3>
				<span className="kbve-market__sidecar-count">
					{stats.count}
				</span>
			</header>

			<dl className="kbve-market__sidecar-stats">
				<div>
					<dt>Listings</dt>
					<dd>{stats.count}</dd>
				</div>
				<div>
					<dt>Min Buy Now</dt>
					<dd>{formatKhash(stats.minBuyNow)}</dd>
				</div>
				<div>
					<dt>Median Buy Now</dt>
					<dd>{formatKhash(stats.medianBuyNow)}</dd>
				</div>
				<div>
					<dt>Max Buy Now</dt>
					<dd>{formatKhash(stats.maxBuyNow)}</dd>
				</div>
				<div>
					<dt>Bid Range</dt>
					<dd>
						{stats.currentBidMin === null
							? '—'
							: stats.currentBidMin === stats.currentBidMax
								? formatKhash(stats.currentBidMin)
								: `${formatKhash(stats.currentBidMin)} – ${formatKhash(stats.currentBidMax)}`}
					</dd>
				</div>
				<div>
					<dt>Next Expiry</dt>
					<dd>
						{stats.nextExpiry
							? formatRelative(stats.nextExpiry)
							: '—'}
					</dd>
				</div>
			</dl>

			<div className="kbve-market__sidecar-grid">
				{cards.map((r) => {
					const title = extractDisplayName(r.item_ref);
					const category = extractCategory(r.item_ref);
					return (
						<a
							key={r.listing_id}
							href={`/market/listing/?id=${r.listing_id}`}
							className="kbve-market__sidecar-card">
							<div className="kbve-market__sidecar-card-icon">
								<MCTextureImage
									ref={ref}
									category={category}
									alt={title}
									size={48}
								/>
							</div>
							<div className="kbve-market__sidecar-card-body">
								<div className="kbve-market__sidecar-card-title">
									{title}
								</div>
								<div className="kbve-market__sidecar-card-prices">
									<span className="kbve-market__sidecar-card-buy">
										{formatKhash(r.buy_now_price)}
									</span>
									<span className="kbve-market__sidecar-card-bid">
										Bid {formatKhash(r.current_bid)}
									</span>
								</div>
								<div className="kbve-market__sidecar-card-foot">
									{formatRelative(r.created_at)}
								</div>
							</div>
						</a>
					);
				})}
			</div>
		</section>
	);
}

export default MCItemMarketSidecar;
