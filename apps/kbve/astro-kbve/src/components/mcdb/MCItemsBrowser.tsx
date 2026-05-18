import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mcTextureUrls } from './texture';
import { WatchToggle } from '@/components/market/WatchToggle';

type ItemEntry = {
	id: number;
	ref: string;
	slug: string;
	display_name: string;
	category: string;
	rarity: string;
	stack_size: number;
	tier: string | null;
	tags: string[];
};

type ManifestPayload = { count: number; items: ItemEntry[] };

const PAGE_SIZE = 60;
const ENDPOINT = '/api/mc-items.json';

function ItemCard({ item }: { item: ItemEntry }) {
	const tex = mcTextureUrls(item.ref, item.category);
	const fbRef = useRef<HTMLImageElement | null>(null);
	return (
		<a
			href={`/mc/items/${item.slug}/`}
			className="mcdb-browse__card"
			data-mc-tooltip
			data-mc-ref={item.ref}>
			<div className="mcdb-browse__watch">
				<WatchToggle kind="mc_item" ref={item.ref} size="sm" />
			</div>
			<div className="mcdb-browse__icon">
				<img
					ref={fbRef}
					src={tex.primary}
					alt={item.display_name}
					loading="lazy"
					onError={(ev) => {
						const img = ev.currentTarget;
						if (img.dataset.fb === '1') return;
						img.dataset.fb = '1';
						img.src = tex.fallback;
					}}
				/>
			</div>
			<div className="mcdb-browse__name">{item.display_name}</div>
			<div className="mcdb-browse__meta">
				<span className="mcdb-browse__cat">{item.category}</span>
				{item.tier && (
					<span className="mcdb-browse__tier">{item.tier}</span>
				)}
			</div>
		</a>
	);
}

export function MCItemsBrowser() {
	const [items, setItems] = useState<ItemEntry[] | null>(null);
	const [query, setQuery] = useState('');
	const [category, setCategory] = useState<string>('all');
	const [tier, setTier] = useState<string>('all');
	const [page, setPage] = useState(0);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(ENDPOINT);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const payload = (await res.json()) as ManifestPayload;
				if (!cancelled) setItems(payload.items);
			} catch (e) {
				if (!cancelled)
					setError(e instanceof Error ? e.message : 'load failed');
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const categories = useMemo(() => {
		if (!items) return [];
		const set = new Set<string>();
		for (const it of items) set.add(it.category);
		return Array.from(set).sort();
	}, [items]);

	const tiers = useMemo(() => {
		if (!items) return [];
		const set = new Set<string>();
		for (const it of items) if (it.tier) set.add(it.tier);
		return Array.from(set).sort();
	}, [items]);

	const filtered = useMemo(() => {
		if (!items) return [];
		const q = query.trim().toLowerCase();
		return items.filter((it) => {
			if (category !== 'all' && it.category !== category) return false;
			if (tier !== 'all' && it.tier !== tier) return false;
			if (
				q &&
				!it.ref.includes(q) &&
				!it.display_name.toLowerCase().includes(q)
			) {
				return false;
			}
			return true;
		});
	}, [items, query, category, tier]);

	const resetPage = useCallback(() => setPage(0), []);

	useEffect(() => {
		setPage(0);
	}, [query, category, tier]);

	if (error)
		return (
			<div className="mcdb-browse__status mcdb-browse__status--error">
				{error}
			</div>
		);
	if (!items)
		return <div className="mcdb-browse__status">Loading items…</div>;

	const pageStart = page * PAGE_SIZE;
	const pageEnd = pageStart + PAGE_SIZE;
	const visible = filtered.slice(pageStart, pageEnd);
	const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

	return (
		<div className="mcdb-browse">
			<div className="mcdb-browse__filters">
				<label className="mcdb-browse__filter mcdb-browse__filter--search">
					<span>Search</span>
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="diamond, sword, oak…"
						className="mcdb-browse__input"
						autoComplete="off"
					/>
				</label>
				<label className="mcdb-browse__filter">
					<span>Category</span>
					<select
						value={category}
						onChange={(e) => setCategory(e.target.value)}
						className="mcdb-browse__input">
						<option value="all">All</option>
						{categories.map((c) => (
							<option key={c} value={c}>
								{c}
							</option>
						))}
					</select>
				</label>
				<label className="mcdb-browse__filter">
					<span>Tier</span>
					<select
						value={tier}
						onChange={(e) => setTier(e.target.value)}
						className="mcdb-browse__input">
						<option value="all">All</option>
						{tiers.map((t) => (
							<option key={t} value={t}>
								{t}
							</option>
						))}
					</select>
				</label>
				<button
					type="button"
					className="mcdb-browse__reset"
					onClick={() => {
						setQuery('');
						setCategory('all');
						setTier('all');
						resetPage();
					}}>
					Reset
				</button>
			</div>

			<div className="mcdb-browse__count">
				{filtered.length.toLocaleString()} /{' '}
				{items.length.toLocaleString()} items
				{filtered.length > PAGE_SIZE && (
					<>
						{' '}
						· page {page + 1} of {totalPages}
					</>
				)}
			</div>

			{visible.length === 0 ? (
				<div className="mcdb-browse__status">No items match.</div>
			) : (
				<div className="mcdb-browse__grid">
					{visible.map((it) => (
						<ItemCard key={it.ref} item={it} />
					))}
				</div>
			)}

			{filtered.length > PAGE_SIZE && (
				<div className="mcdb-browse__pager">
					<button
						type="button"
						className="mcdb-browse__page-btn"
						disabled={page === 0}
						onClick={() => setPage((p) => Math.max(0, p - 1))}>
						← Prev
					</button>
					<span className="mcdb-browse__page-info">
						{page + 1} / {totalPages}
					</span>
					<button
						type="button"
						className="mcdb-browse__page-btn"
						disabled={page >= totalPages - 1}
						onClick={() =>
							setPage((p) => Math.min(totalPages - 1, p + 1))
						}>
						Next →
					</button>
				</div>
			)}
		</div>
	);
}

export default MCItemsBrowser;
