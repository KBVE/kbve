import { useEffect, useState } from 'react';
import { useSession } from '@kbve/astro';
import { MarketApiError, myBids, myListings } from './api';

type Counts = {
	activeListings: number;
	soldListings: number;
	activeBids: number;
	wonBids: number;
};

const EMPTY: Counts = {
	activeListings: 0,
	soldListings: 0,
	activeBids: 0,
	wonBids: 0,
};

export function MarketAccountSummary() {
	const { ready, authenticated } = useSession();
	const [counts, setCounts] = useState<Counts>(EMPTY);
	const [error, setError] = useState<string | null>(null);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		if (!ready || !authenticated) {
			setCounts(EMPTY);
			setLoaded(false);
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const [ls, bs] = await Promise.all([
					myListings({ limit: 100 }),
					myBids({ limit: 100 }),
				]);
				if (cancelled) return;
				setCounts({
					activeListings: ls.filter(
						(l) => l.listing_status === 'active',
					).length,
					soldListings: ls.filter((l) => l.listing_status === 'sold')
						.length,
					activeBids: bs.filter((b) => b.bid_status === 'active')
						.length,
					wonBids: bs.filter((b) => b.bid_status === 'won').length,
				});
				setError(null);
				setLoaded(true);
			} catch (e) {
				if (!cancelled)
					setError(
						e instanceof MarketApiError
							? e.message
							: 'market summary failed',
					);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [ready, authenticated]);

	if (!ready || !authenticated) return null;

	return (
		<section className="kbve-market-summary">
			<header className="kbve-market-summary__head">
				<h2>Marketplace</h2>
				<a
					className="kbve-market-summary__link"
					href="/profile/market/">
					Open →
				</a>
			</header>
			<dl className="kbve-market-summary__grid">
				<div>
					<dt>Active listings</dt>
					<dd>{loaded ? counts.activeListings : '—'}</dd>
				</div>
				<div>
					<dt>Sold</dt>
					<dd>{loaded ? counts.soldListings : '—'}</dd>
				</div>
				<div>
					<dt>Active bids</dt>
					<dd>{loaded ? counts.activeBids : '—'}</dd>
				</div>
				<div>
					<dt>Won</dt>
					<dd>{loaded ? counts.wonBids : '—'}</dd>
				</div>
			</dl>
			{error && <div className="kbve-market-summary__error">{error}</div>}
		</section>
	);
}

export default MarketAccountSummary;
