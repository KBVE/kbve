import { useCallback, useEffect, useState } from 'react';
import { listActive, type MarketListing, MarketApiError } from './api';
import { formatExpiry, formatKhash, itemRefLabel } from './format';

const PAGE_SIZE = 25;

export function MarketBrowse() {
	const [rows, setRows] = useState<MarketListing[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState(false);

	const load = useCallback(async (after?: MarketListing) => {
		setLoading(true);
		setError(null);
		try {
			const page = await listActive({
				limit: PAGE_SIZE,
				before_created_at: after?.created_at ?? null,
				before_id: after?.listing_id ?? null,
			});
			setRows((prev) => (after ? [...prev, ...page] : page));
			setHasMore(page.length === PAGE_SIZE);
		} catch (e) {
			setError(
				e instanceof MarketApiError
					? e.message
					: 'failed to load listings',
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const loadMore = () => {
		const tail = rows[rows.length - 1];
		if (tail) void load(tail);
	};

	if (loading && rows.length === 0) {
		return <div className="kbve-market__status">Loading listings…</div>;
	}
	if (error && rows.length === 0) {
		return (
			<div className="kbve-market__status kbve-market__status--error">
				{error}
			</div>
		);
	}
	if (rows.length === 0) {
		return (
			<div className="kbve-market__status">
				No active listings yet. Check back soon.
			</div>
		);
	}

	return (
		<div className="kbve-market__list">
			{rows.map((r) => (
				<a
					key={r.listing_id}
					href={`/market/listing/?id=${r.listing_id}`}
					className="kbve-market__card">
					<div className="kbve-market__card-head">
						<span className="kbve-market__card-item">
							{itemRefLabel(r.item_ref)}
						</span>
						<span className="kbve-market__card-expiry">
							{formatExpiry(r.expires_at)}
						</span>
					</div>
					<div className="kbve-market__card-prices">
						{r.buy_now_price !== null && (
							<span className="kbve-market__price">
								<span className="kbve-market__price-label">
									Buy Now
								</span>
								<span className="kbve-market__price-value">
									{formatKhash(r.buy_now_price)}
								</span>
							</span>
						)}
						{(r.current_bid !== null || r.min_bid !== null) && (
							<span className="kbve-market__price">
								<span className="kbve-market__price-label">
									{r.current_bid !== null ? 'Bid' : 'Min Bid'}
								</span>
								<span className="kbve-market__price-value">
									{formatKhash(r.current_bid ?? r.min_bid)}
								</span>
							</span>
						)}
					</div>
				</a>
			))}
			{hasMore && (
				<button
					type="button"
					className="kbve-market__load-more"
					onClick={loadMore}
					disabled={loading}>
					{loading ? 'Loading…' : 'Load more'}
				</button>
			)}
			{error && (
				<div className="kbve-market__status kbve-market__status--error">
					{error}
				</div>
			)}
		</div>
	);
}

export default MarketBrowse;
