import { useCallback, useEffect, useMemo, useState } from 'react';
import { listActive, type MarketListing, MarketApiError } from './api';
import { formatKhash, itemRefLabel } from './format';
import { useCountdown, formatCountdown } from './countdown';
import { ItemIcon } from './ItemIcon';
import { EnchantList } from './EnchantList';

const PAGE_SIZE = 25;

const KIND_FILTERS: { value: string; label: string }[] = [
	{ value: 'all', label: 'All kinds' },
	{ value: 'mc_item', label: 'Minecraft' },
	{ value: 'rareicon_item', label: 'Rareicon' },
	{ value: 'generic', label: 'Other' },
];

function ListingCard({ row }: { row: MarketListing }) {
	const countdown = useCountdown(row.expires_at);
	const urgent = countdown.totalMs < 60 * 60 * 1000;
	return (
		<a
			href={`/market/listing/?id=${row.listing_id}`}
			className="kbve-market__grid-card">
			<div className="kbve-market__grid-icon">
				<ItemIcon itemRef={row.item_ref} size={96} />
			</div>
			<div className="kbve-market__grid-body">
				<div className="kbve-market__grid-title">
					{itemRefLabel(row.item_ref)}
					<EnchantList itemRef={row.item_ref} compact />
				</div>
				<div className="kbve-market__grid-prices">
					{row.buy_now_price !== null && (
						<span className="kbve-market__grid-price kbve-market__grid-price--primary">
							<span className="kbve-market__grid-price-label">
								Buy
							</span>
							<span className="kbve-market__grid-price-value">
								{formatKhash(row.buy_now_price)}
							</span>
						</span>
					)}
					{(row.current_bid !== null || row.min_bid !== null) && (
						<span className="kbve-market__grid-price">
							<span className="kbve-market__grid-price-label">
								{row.current_bid !== null ? 'Bid' : 'Min'}
							</span>
							<span className="kbve-market__grid-price-value">
								{formatKhash(row.current_bid ?? row.min_bid)}
							</span>
						</span>
					)}
				</div>
				<div
					className={`kbve-market__grid-expiry${urgent ? ' kbve-market__grid-expiry--urgent' : ''}`}>
					{formatCountdown(countdown)}
				</div>
			</div>
		</a>
	);
}

export function MarketBrowse() {
	const [rows, setRows] = useState<MarketListing[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState(false);
	const [kindFilter, setKindFilter] = useState<string>('all');

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

	const filtered = useMemo(() => {
		if (kindFilter === 'all') return rows;
		return rows.filter((r) => {
			const k = (r.item_ref as { kind?: unknown })?.kind;
			return typeof k === 'string'
				? k === kindFilter
				: kindFilter === 'generic';
		});
	}, [rows, kindFilter]);

	return (
		<div>
			<div className="kbve-market__filters">
				<label className="kbve-market__filter">
					<span>Kind</span>
					<select
						className="kbve-market__input"
						value={kindFilter}
						onChange={(e) => setKindFilter(e.target.value)}>
						{KIND_FILTERS.map((k) => (
							<option key={k.value} value={k.value}>
								{k.label}
							</option>
						))}
					</select>
				</label>
				<span className="kbve-market__filter-count">
					{filtered.length} / {rows.length} shown
				</span>
				<button
					type="button"
					className="kbve-market__refresh"
					onClick={() => void load()}
					disabled={loading}>
					{loading ? '…' : '↻ Refresh'}
				</button>
			</div>

			{loading && rows.length === 0 && (
				<div className="kbve-market__status">Loading listings…</div>
			)}
			{error && rows.length === 0 && (
				<div className="kbve-market__status kbve-market__status--error">
					{error}
				</div>
			)}
			{!loading && rows.length === 0 && !error && (
				<div className="kbve-market__status">
					No active listings yet. Check back soon.
				</div>
			)}

			{filtered.length > 0 && (
				<div className="kbve-market__grid">
					{filtered.map((r) => (
						<ListingCard key={r.listing_id} row={r} />
					))}
				</div>
			)}

			{rows.length > 0 && filtered.length === 0 && (
				<div className="kbve-market__status">
					No active listings match this filter.
				</div>
			)}

			{hasMore && (
				<div className="kbve-market__pagination">
					<button
						type="button"
						className="kbve-market__btn"
						onClick={loadMore}
						disabled={loading}>
						{loading ? 'Loading…' : 'Load more'}
					</button>
				</div>
			)}
			{error && rows.length > 0 && (
				<div className="kbve-market__status kbve-market__status--error">
					{error}
				</div>
			)}
		</div>
	);
}

export default MarketBrowse;
