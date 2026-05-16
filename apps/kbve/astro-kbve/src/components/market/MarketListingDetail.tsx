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
import { formatKhash, formatRelative, itemRefLabel } from './format';
import { useCountdown, formatCountdown } from './countdown';
import { ItemIcon } from './ItemIcon';
import { EnchantList } from './EnchantList';

function readListingId(): number | null {
	if (typeof window === 'undefined') return null;
	const raw = new URLSearchParams(window.location.search).get('id');
	if (!raw) return null;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : null;
}

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

function shortId(uuid: string): string {
	return `${uuid.slice(0, 6)}…${uuid.slice(-4)}`;
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
	const [copied, setCopied] = useState(false);

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

	const countdown = useCountdown(row?.expires_at);

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

	const onCopy = async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		} catch {}
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
	const kind = String(
		((row.item_ref ?? {}) as { kind?: unknown }).kind ?? 'generic',
	);

	return (
		<div className="kbve-market__detail-v2">
			<nav className="kbve-market__breadcrumb">
				<a href="/market/">← Browse</a>
				<button
					type="button"
					className="kbve-market__copy"
					onClick={() => void onCopy()}>
					{copied ? '✓ Copied' : 'Share'}
				</button>
			</nav>

			<div className="kbve-market__hero">
				<aside className="kbve-market__hero-visual">
					<ItemIcon itemRef={row.item_ref} size={224} />
					<div className="kbve-market__hero-meta">
						<span className="kbve-market__kind-pill">{kind}</span>
						<span
							className={`kbve-market__badge kbve-market__badge--${row.listing_status}`}>
							{row.listing_status}
						</span>
					</div>
					<h1 className="kbve-market__item-title">
						{itemRefLabel(row.item_ref)}
					</h1>
					<EnchantList itemRef={row.item_ref} />
					<p className="kbve-market__hero-seller">
						Seller{' '}
						<code title={row.seller_account}>
							{shortId(row.seller_account)}
						</code>
					</p>
					<p className="kbve-market__hero-created">
						Listed {formatRelative(row.created_at)}
					</p>
				</aside>

				<section className="kbve-market__panel">
					<div className="kbve-market__panel-head">
						<div className="kbve-market__panel-countdown">
							<span className="kbve-market__panel-label">
								{active ? 'Ends in' : 'Closed'}
							</span>
							<span
								className={`kbve-market__panel-clock${countdown.totalMs < 60_000 && active ? ' kbve-market__panel-clock--urgent' : ''}`}>
								{active
									? formatCountdown(countdown)
									: row.settled_at
										? formatRelative(row.settled_at)
										: '—'}
							</span>
						</div>
					</div>

					<div className="kbve-market__panel-prices">
						{row.buy_now_price !== null && (
							<div className="kbve-market__panel-price kbve-market__panel-price--primary">
								<span className="kbve-market__panel-label">
									Buy Now
								</span>
								<span className="kbve-market__panel-value">
									{formatKhash(row.buy_now_price)}
								</span>
							</div>
						)}
						<div className="kbve-market__panel-price">
							<span className="kbve-market__panel-label">
								{row.current_bid !== null
									? 'Current Bid'
									: 'Min Bid'}
							</span>
							<span className="kbve-market__panel-value">
								{formatKhash(row.current_bid ?? row.min_bid)}
							</span>
						</div>
					</div>

					{ready && authenticated && active && !isSeller && (
						<div className="kbve-market__panel-actions">
							{row.buy_now_price !== null && (
								<button
									type="button"
									className="kbve-market__btn kbve-market__btn--primary kbve-market__btn--block"
									onClick={() => void onBuyNow()}
									disabled={actionBusy !== null}>
									{actionBusy === 'buy'
										? 'Buying…'
										: `Buy Now · ${formatKhash(row.buy_now_price)}`}
								</button>
							)}
							{row.min_bid !== null && (
								<div className="kbve-market__panel-bid">
									<input
										type="number"
										min={minNextBid}
										step={1}
										placeholder={`min ${minNextBid}`}
										value={bidInput}
										onChange={(e) =>
											setBidInput(e.target.value)
										}
										className="kbve-market__input"
									/>
									<button
										type="button"
										className="kbve-market__btn"
										onClick={() => void onBid()}
										disabled={actionBusy !== null}>
										{actionBusy === 'bid'
											? 'Bidding…'
											: 'Bid'}
									</button>
								</div>
							)}
							<p className="kbve-market__hint">
								Bids hold your KHash in escrow until you're
								outbid.
							</p>
						</div>
					)}

					{ready && authenticated && active && isSeller && (
						<div className="kbve-market__panel-actions">
							<button
								type="button"
								className="kbve-market__btn kbve-market__btn--danger kbve-market__btn--block"
								onClick={() => void onCancel()}
								disabled={actionBusy !== null}>
								{actionBusy === 'cancel'
									? 'Cancelling…'
									: 'Cancel Listing'}
							</button>
							<p className="kbve-market__hint">
								You're the seller. Cancelling refunds the active
								high bidder.
							</p>
						</div>
					)}

					{ready && !authenticated && active && (
						<a
							className="kbve-market__btn kbve-market__btn--primary kbve-market__btn--block"
							href="/login/">
							Sign in to bid or buy
						</a>
					)}

					{actionError && (
						<div className="kbve-market__status kbve-market__status--error">
							{actionError}
						</div>
					)}
				</section>
			</div>

			<section className="kbve-market__bids">
				<header className="kbve-market__bids-head">
					<h3>Bid History</h3>
					<span className="kbve-market__bids-count">
						{Array.isArray(row.bids) ? row.bids.length : 0}
					</span>
				</header>
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
									<span className="kbve-market__bid-amount">
										{amount !== null
											? formatKhash(amount)
											: '—'}
									</span>
									<span className="kbve-market__bid-meta">
										<span
											className={`kbve-market__badge kbve-market__badge--${status ?? 'unknown'}`}>
											{status ?? 'unknown'}
										</span>
										<span>
											{placedAt
												? formatRelative(placedAt)
												: '—'}
										</span>
									</span>
								</li>
							);
						})}
					</ol>
				) : (
					<div className="kbve-market__bids-empty">
						<p className="kbve-market__bids-empty-title">
							No bids yet
						</p>
						<p className="kbve-market__bids-empty-sub">
							{active && row.min_bid !== null
								? `Open at ${formatKhash(row.min_bid)} — be the first.`
								: 'Bidding closed.'}
						</p>
					</div>
				)}
			</section>
		</div>
	);
}

export default MarketListingDetail;
