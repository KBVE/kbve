import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@kbve/astro';
import {
	MarketApiError,
	type MyBid,
	type MyListing,
	myBids,
	myListings,
} from './api';
import {
	formatExpiry,
	formatKhash,
	formatRelative,
	itemRefLabel,
} from './format';
import { EnchantList } from './EnchantList';

type Tab = 'listings' | 'bids';

export function MarketProfileShell() {
	const { ready, authenticated } = useSession();
	const [tab, setTab] = useState<Tab>('listings');
	const [listings, setListings] = useState<MyListing[]>([]);
	const [bids, setBids] = useState<MyBid[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [ls, bs] = await Promise.all([
				myListings({ limit: 50 }),
				myBids({ limit: 50 }),
			]);
			setListings(ls);
			setBids(bs);
		} catch (e) {
			setError(
				e instanceof MarketApiError ? e.message : 'failed to load',
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (ready && authenticated) void refresh();
	}, [ready, authenticated, refresh]);

	if (!ready) return null;
	if (!authenticated) {
		return (
			<div className="kbve-market__status">
				Sign in to view your marketplace activity.
			</div>
		);
	}

	return (
		<div className="kbve-market__profile">
			<div className="kbve-market__tabs" role="tablist">
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'listings'}
					className={`kbve-market__tab${tab === 'listings' ? ' kbve-market__tab--active' : ''}`}
					onClick={() => setTab('listings')}>
					Listings ({listings.length})
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'bids'}
					className={`kbve-market__tab${tab === 'bids' ? ' kbve-market__tab--active' : ''}`}
					onClick={() => setTab('bids')}>
					Bids ({bids.length})
				</button>
				<button
					type="button"
					className="kbve-market__refresh"
					onClick={() => void refresh()}
					disabled={loading}>
					{loading ? '…' : '↻'}
				</button>
			</div>

			{error && (
				<div className="kbve-market__status kbve-market__status--error">
					{error}
				</div>
			)}

			{tab === 'listings' && (
				<div className="kbve-market__list">
					{listings.length === 0 && !loading && (
						<div className="kbve-market__status">
							No listings yet. <a href="/market/">Create one →</a>
						</div>
					)}
					{listings.map((r) => (
						<a
							key={r.listing_id}
							href={`/market/listing/?id=${r.listing_id}`}
							className="kbve-market__card">
							<div className="kbve-market__card-head">
								<span className="kbve-market__card-item">
									{itemRefLabel(r.item_ref)}
									<EnchantList itemRef={r.item_ref} compact />
								</span>
								<span
									className={`kbve-market__badge kbve-market__badge--${r.listing_status}`}>
									{r.listing_status}
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
								{r.current_bid !== null && (
									<span className="kbve-market__price">
										<span className="kbve-market__price-label">
											Bid
										</span>
										<span className="kbve-market__price-value">
											{formatKhash(r.current_bid)}
										</span>
									</span>
								)}
								<span className="kbve-market__card-expiry">
									{r.listing_status === 'active'
										? formatExpiry(r.expires_at)
										: r.settled_at
											? formatRelative(r.settled_at)
											: '—'}
								</span>
							</div>
						</a>
					))}
				</div>
			)}

			{tab === 'bids' && (
				<div className="kbve-market__list">
					{bids.length === 0 && !loading && (
						<div className="kbve-market__status">No bids yet.</div>
					)}
					{bids.map((b) => (
						<a
							key={b.bid_id}
							href={`/market/listing/?id=${b.listing_id}`}
							className="kbve-market__card">
							<div className="kbve-market__card-head">
								<span className="kbve-market__card-item">
									Listing #{b.listing_id}
								</span>
								<span
									className={`kbve-market__badge kbve-market__badge--${b.bid_status}`}>
									{b.bid_status}
								</span>
							</div>
							<div className="kbve-market__card-prices">
								<span className="kbve-market__price">
									<span className="kbve-market__price-label">
										Amount
									</span>
									<span className="kbve-market__price-value">
										{formatKhash(b.amount)}
									</span>
								</span>
								<span className="kbve-market__card-expiry">
									{formatRelative(b.placed_at)}
								</span>
							</div>
						</a>
					))}
				</div>
			)}
		</div>
	);
}

export default MarketProfileShell;
