import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@kbve/astro';
import {
	MarketApiError,
	listingDetail,
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
import { MCTextureImage } from '@/components/mcdb/MCTextureImage';
import {
	getWatchList,
	removeFromWatch,
	subscribe,
	type WatchEntry,
} from './watchlist';

type Tab = 'listings' | 'bids' | 'watching';

type ItemRefMeta = {
	kind: string;
	id: string;
};

type McManifestEntry = {
	ref: string;
	display_name: string;
	category: string;
};

let mcManifestPromise: Promise<Map<string, McManifestEntry>> | null = null;

function loadMcManifest(): Promise<Map<string, McManifestEntry>> {
	if (mcManifestPromise) return mcManifestPromise;
	mcManifestPromise = fetch('/api/mc-items.json')
		.then((r) => (r.ok ? r.json() : { items: [] }))
		.then((payload: { items?: McManifestEntry[] }) => {
			const m = new Map<string, McManifestEntry>();
			for (const it of payload.items ?? []) m.set(it.ref, it);
			return m;
		})
		.catch(() => new Map<string, McManifestEntry>());
	return mcManifestPromise;
}

function readItemRefMeta(itemRef: unknown): ItemRefMeta {
	const r = (itemRef ?? {}) as { kind?: unknown; id?: unknown };
	const kind = typeof r.kind === 'string' ? r.kind : '';
	const id =
		typeof r.id === 'string' || typeof r.id === 'number'
			? String(r.id)
			: '';
	return { kind, id };
}

function ItemThumb({
	itemRef,
	size = 40,
}: {
	itemRef: unknown;
	size?: number;
}) {
	const { kind, id } = readItemRefMeta(itemRef);
	if (kind === 'mc_item' && id) {
		return <MCTextureImage ref={id} size={size} />;
	}
	return null;
}

function ItemThumbPlaceholder({ size = 40 }: { size?: number }) {
	return (
		<span
			className="kbve-mcpicker__row-img kbve-mcpicker__row-img--missing"
			style={{ width: size, height: size }}
			aria-hidden="true">
			…
		</span>
	);
}

export function MarketProfileShell() {
	const { ready, authenticated } = useSession();
	const [tab, setTab] = useState<Tab>('listings');
	const [listings, setListings] = useState<MyListing[]>([]);
	const [bids, setBids] = useState<MyBid[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [bidRefs, setBidRefs] = useState<
		Map<number, Record<string, unknown>>
	>(() => new Map());
	const [watchEntries, setWatchEntries] = useState<WatchEntry[]>([]);
	const [mcManifest, setMcManifest] = useState<Map<
		string,
		McManifestEntry
	> | null>(null);

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

	useEffect(() => {
		setWatchEntries(getWatchList());
		const unsub = subscribe(() => setWatchEntries(getWatchList()));
		return unsub;
	}, []);

	useEffect(() => {
		void loadMcManifest().then(setMcManifest);
	}, []);

	useEffect(() => {
		if (bids.length === 0) return;
		let cancelled = false;
		const missing = Array.from(
			new Set(
				bids.map((b) => b.listing_id).filter((id) => !bidRefs.has(id)),
			),
		);
		if (missing.length === 0) return;
		(async () => {
			const pairs = await Promise.all(
				missing.map(async (id) => {
					try {
						const d = await listingDetail(id);
						return [id, d.item_ref] as const;
					} catch {
						return null;
					}
				}),
			);
			if (cancelled) return;
			setBidRefs((prev) => {
				const next = new Map(prev);
				for (const p of pairs) {
					if (p) next.set(p[0], p[1]);
				}
				return next;
			});
		})();
		return () => {
			cancelled = true;
		};
	}, [bids, bidRefs]);

	const activeListings = useMemo(
		() => listings.filter((r) => r.listing_status === 'active'),
		[listings],
	);
	const closedListings = useMemo(
		() => listings.filter((r) => r.listing_status !== 'active'),
		[listings],
	);

	const renderListingCard = (r: MyListing, closed: boolean = false) => {
		const meta = readItemRefMeta(r.item_ref);
		return (
			<a
				key={r.listing_id}
				href={`/market/listing/?id=${r.listing_id}`}
				className={
					'kbve-market__card kbve-market__card--tiled' +
					(closed ? ' kbve-market__card--closed' : '')
				}>
				<div className="kbve-market__card-thumb">
					{meta.kind === 'mc_item' && meta.id ? (
						<MCTextureImage ref={meta.id} size={40} />
					) : (
						<ItemThumb itemRef={r.item_ref} />
					)}
				</div>
				<div className="kbve-market__card-body">
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
				</div>
			</a>
		);
	};

	const watchedDisplay = useMemo(
		() =>
			watchEntries.map((e) => {
				const mc =
					e.kind === 'mc_item' && mcManifest
						? (mcManifest.get(e.ref) ?? null)
						: null;
				return { entry: e, mc };
			}),
		[watchEntries, mcManifest],
	);

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
					Listings ({activeListings.length})
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
					role="tab"
					aria-selected={tab === 'watching'}
					className={`kbve-market__tab${tab === 'watching' ? ' kbve-market__tab--active' : ''}`}
					onClick={() => setTab('watching')}>
					Watching ({watchEntries.length})
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
					{activeListings.length === 0 && !loading && (
						<div className="kbve-market__status">
							No active listings.{' '}
							<a href="/market/">Create one →</a>
						</div>
					)}
					{activeListings.map((r) => renderListingCard(r))}

					{closedListings.length > 0 && (
						<details className="kbve-market__history">
							<summary>
								Past listings ({closedListings.length})
							</summary>
							<div className="kbve-market__list kbve-market__list--closed">
								{closedListings.map((r) =>
									renderListingCard(r, true),
								)}
							</div>
						</details>
					)}
				</div>
			)}

			{tab === 'bids' && (
				<div className="kbve-market__list">
					{bids.length === 0 && !loading && (
						<div className="kbve-market__status">No bids yet.</div>
					)}
					{bids.map((b) => {
						const itemRef = bidRefs.get(b.listing_id);
						const meta = itemRef ? readItemRefMeta(itemRef) : null;
						return (
							<a
								key={b.bid_id}
								href={`/market/listing/?id=${b.listing_id}`}
								className="kbve-market__card kbve-market__card--tiled">
								<div className="kbve-market__card-thumb">
									{meta &&
									meta.kind === 'mc_item' &&
									meta.id ? (
										<MCTextureImage
											ref={meta.id}
											size={40}
										/>
									) : itemRef ? (
										<ItemThumb itemRef={itemRef} />
									) : (
										<ItemThumbPlaceholder />
									)}
								</div>
								<div className="kbve-market__card-body">
									<div className="kbve-market__card-head">
										<span className="kbve-market__card-item">
											{itemRef
												? itemRefLabel(itemRef)
												: `Listing #${b.listing_id}`}
											{itemRef && (
												<EnchantList
													itemRef={itemRef}
													compact
												/>
											)}
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
								</div>
							</a>
						);
					})}
				</div>
			)}

			{tab === 'watching' && (
				<div className="kbve-market__list">
					{watchEntries.length === 0 && (
						<div className="kbve-market__status">
							No items watched yet. Star any item to track it
							here.
						</div>
					)}
					{watchedDisplay.map(({ entry, mc }) => {
						const href =
							entry.kind === 'mc_item' && mc
								? `/mc/items/${mc.ref.replace(/^minecraft:/, '')}/`
								: null;
						const inner = (
							<>
								<div className="kbve-market__card-thumb">
									{entry.kind === 'mc_item' ? (
										<MCTextureImage
											ref={entry.ref}
											size={40}
											category={mc?.category}
										/>
									) : (
										<ItemThumbPlaceholder />
									)}
								</div>
								<div className="kbve-market__card-body">
									<div className="kbve-market__card-head">
										<span className="kbve-market__card-item">
											{entry.kind === 'mc_item' && mc
												? mc.display_name
												: entry.ref}
										</span>
										<span className="kbve-market__kind-pill">
											{entry.kind}
										</span>
									</div>
									<div className="kbve-market__card-prices">
										<span className="kbve-market__card-expiry">
											{entry.ref}
										</span>
										<button
											type="button"
											className="kbve-market__watch-remove"
											onClick={(ev) => {
												ev.preventDefault();
												ev.stopPropagation();
												removeFromWatch(entry);
											}}>
											Unwatch
										</button>
									</div>
								</div>
							</>
						);
						const key = `${entry.kind}::${entry.ref}`;
						return href ? (
							<a
								key={key}
								href={href}
								className="kbve-market__card kbve-market__card--tiled">
								{inner}
							</a>
						) : (
							<div
								key={key}
								className="kbve-market__card kbve-market__card--tiled">
								{inner}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

export default MarketProfileShell;
