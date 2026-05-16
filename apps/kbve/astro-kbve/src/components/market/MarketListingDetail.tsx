import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAccessToken, useSession } from '@kbve/astro';
import {
	buyNow,
	cancelListing,
	listingDetail,
	placeBid,
	type MarketListingDetail as MarketListingDetailRow,
	MarketApiError,
} from './api';
import {
	formatExpiry,
	formatKhash,
	formatRelative,
	itemRefLabel,
} from './format';

async function fetchMyAccountId(): Promise<string | null> {
	const token = await getAccessToken();
	if (!token) return null;
	const res = await fetch('/api/v1/wallet/me/balance', {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!res.ok) return null;
	const b = (await res.json()) as { account_id?: string };
	return b.account_id ?? null;
}

function readListingId(): number | null {
	if (typeof window === 'undefined') return null;
	const raw = new URLSearchParams(window.location.search).get('id');
	if (!raw) return null;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : null;
}

export function MarketListingDetail() {
	const { ready, authenticated } = useSession();
	const [listingId, setListingId] = useState<number | null>(null);
	const [row, setRow] = useState<MarketListingDetailRow | null>(null);
	const [myAccount, setMyAccount] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [actionError, setActionError] = useState<string | null>(null);
	const [actionBusy, setActionBusy] = useState<string | null>(null);
	const [bidInput, setBidInput] = useState('');

	useEffect(() => {
		setListingId(readListingId());
	}, []);

	useEffect(() => {
		if (!ready || !authenticated) {
			setMyAccount(null);
			return;
		}
		void fetchMyAccountId().then(setMyAccount);
	}, [ready, authenticated]);

	const refresh = useCallback(async () => {
		if (listingId == null) return;
		setLoading(true);
		try {
			const d = await listingDetail(listingId);
			setRow(d);
			setError(null);
		} catch (e) {
			setError(
				e instanceof MarketApiError
					? e.message
					: 'failed to load listing',
			);
		} finally {
			setLoading(false);
		}
	}, [listingId]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const isSeller = useMemo(() => {
		if (!row || !myAccount) return false;
		return row.seller_account === myAccount;
	}, [row, myAccount]);

	const onBid = async () => {
		if (!row) return;
		const amount = Number(bidInput);
		if (!Number.isFinite(amount) || amount <= 0) {
			setActionError('bid must be a positive integer');
			return;
		}
		setActionBusy('bid');
		setActionError(null);
		try {
			await placeBid(row.listing_id, {
				amount: Math.floor(amount),
				idempotency_key: crypto.randomUUID(),
			});
			setBidInput('');
			await refresh();
		} catch (e) {
			setActionError(
				e instanceof MarketApiError ? e.message : 'bid failed',
			);
		} finally {
			setActionBusy(null);
		}
	};

	const onBuyNow = async () => {
		if (!row) return;
		setActionBusy('buy');
		setActionError(null);
		try {
			await buyNow(row.listing_id, {
				idempotency_key: crypto.randomUUID(),
			});
			await refresh();
		} catch (e) {
			setActionError(
				e instanceof MarketApiError ? e.message : 'buy-now failed',
			);
		} finally {
			setActionBusy(null);
		}
	};

	const onCancel = async () => {
		if (!row) return;
		setActionBusy('cancel');
		setActionError(null);
		try {
			await cancelListing(row.listing_id, { reason: null });
			await refresh();
		} catch (e) {
			setActionError(
				e instanceof MarketApiError ? e.message : 'cancel failed',
			);
		} finally {
			setActionBusy(null);
		}
	};

	if (listingId == null) {
		return (
			<div className="kbve-market__status">
				Missing or invalid <code>?id=</code> query parameter.
			</div>
		);
	}
	if (loading && !row)
		return <div className="kbve-market__status">Loading listing…</div>;
	if (error && !row)
		return (
			<div className="kbve-market__status kbve-market__status--error">
				{error}
			</div>
		);
	if (!row) return null;

	const active = row.listing_status === 'active';
	const minNextBid =
		(row.current_bid ?? (row.min_bid !== null ? row.min_bid - 1 : 0)) + 1;

	return (
		<div className="kbve-market__detail">
			<header className="kbve-market__detail-head">
				<div>
					<div className="kbve-market__detail-item">
						{itemRefLabel(row.item_ref)}
					</div>
					<div className="kbve-market__detail-status">
						<span
							className={`kbve-market__badge kbve-market__badge--${row.listing_status}`}>
							{row.listing_status}
						</span>
						<span>
							{active
								? formatExpiry(row.expires_at)
								: `closed ${row.settled_at ? formatRelative(row.settled_at) : ''}`}
						</span>
					</div>
				</div>
				<a href="/market/" className="kbve-market__back">
					← Browse
				</a>
			</header>

			<dl className="kbve-market__detail-prices">
				<div>
					<dt>Buy Now</dt>
					<dd>
						{row.buy_now_price !== null
							? formatKhash(row.buy_now_price)
							: '—'}
					</dd>
				</div>
				<div>
					<dt>Current Bid</dt>
					<dd>
						{row.current_bid !== null
							? formatKhash(row.current_bid)
							: '—'}
					</dd>
				</div>
				<div>
					<dt>Min Bid</dt>
					<dd>
						{row.min_bid !== null ? formatKhash(row.min_bid) : '—'}
					</dd>
				</div>
			</dl>

			{ready && authenticated && active && !isSeller && (
				<div className="kbve-market__actions">
					<div className="kbve-market__bid-row">
						<input
							type="number"
							min={minNextBid}
							step={1}
							placeholder={`min ${minNextBid}`}
							value={bidInput}
							onChange={(e) => setBidInput(e.target.value)}
							className="kbve-market__input"
						/>
						<button
							type="button"
							className="kbve-market__btn"
							onClick={() => void onBid()}
							disabled={actionBusy !== null}>
							{actionBusy === 'bid' ? 'Bidding…' : 'Place Bid'}
						</button>
					</div>
					{row.buy_now_price !== null && (
						<button
							type="button"
							className="kbve-market__btn kbve-market__btn--primary"
							onClick={() => void onBuyNow()}
							disabled={actionBusy !== null}>
							{actionBusy === 'buy'
								? 'Buying…'
								: `Buy Now ${formatKhash(row.buy_now_price)}`}
						</button>
					)}
				</div>
			)}

			{ready && authenticated && active && isSeller && (
				<div className="kbve-market__actions">
					<button
						type="button"
						className="kbve-market__btn kbve-market__btn--danger"
						onClick={() => void onCancel()}
						disabled={actionBusy !== null}>
						{actionBusy === 'cancel'
							? 'Cancelling…'
							: 'Cancel Listing'}
					</button>
					<p className="kbve-market__hint">
						Cancelling refunds the active high bidder's escrow.
					</p>
				</div>
			)}

			{ready && !authenticated && active && (
				<div className="kbve-market__status">
					Sign in to bid or buy.
				</div>
			)}

			{actionError && (
				<div className="kbve-market__status kbve-market__status--error">
					{actionError}
				</div>
			)}

			<section className="kbve-market__bids">
				<h3>Recent Bids</h3>
				{Array.isArray(row.bids) && row.bids.length > 0 ? (
					<ol className="kbve-market__bid-list">
						{row.bids.slice(0, 25).map((b, i) => {
							const amount =
								typeof (b as { amount?: number }).amount ===
								'number'
									? (b as { amount: number }).amount
									: null;
							const placedAt = (b as { placed_at?: string })
								.placed_at;
							const status = (b as { bid_status?: string })
								.bid_status;
							return (
								<li key={i}>
									<span>
										{amount !== null
											? formatKhash(amount)
											: '—'}
									</span>
									<span className="kbve-market__bid-meta">
										{status ?? 'unknown'} ·{' '}
										{placedAt
											? formatRelative(placedAt)
											: '—'}
									</span>
								</li>
							);
						})}
					</ol>
				) : (
					<p className="kbve-market__hint">No bids yet.</p>
				)}
			</section>
		</div>
	);
}

export default MarketListingDetail;
