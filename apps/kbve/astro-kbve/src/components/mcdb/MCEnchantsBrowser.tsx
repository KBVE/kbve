import { useEffect, useMemo, useState } from 'react';

type EnchantEntry = {
	id: number;
	ref: string;
	slug: string;
	display_name: string;
	rarity: string;
	max_level: number;
	weight: number;
	treasure: boolean;
	curse: boolean;
	targets: string[];
	tags: string[];
};

type ManifestPayload = { count: number; items: EnchantEntry[] };

const PAGE_SIZE = 60;
const ENDPOINT = '/api/mc-enchants.json';

type GroupFilter =
	| 'all'
	| 'armor'
	| 'weapon'
	| 'tool'
	| 'ranged'
	| 'fishing'
	| 'treasure'
	| 'curse';

type Props = { lockedGroup?: GroupFilter };

function matchesGroup(e: EnchantEntry, group: GroupFilter): boolean {
	if (group === 'all') return true;
	if (group === 'treasure') return e.treasure;
	if (group === 'curse') return e.curse;
	if (group === 'armor')
		return e.targets.some(
			(t) =>
				t === 'armor' ||
				t === 'armor_head' ||
				t === 'armor_chest' ||
				t === 'armor_legs' ||
				t === 'armor_feet' ||
				t === 'wearable',
		);
	if (group === 'weapon')
		return e.targets.some((t) => t === 'weapon' || t === 'mace');
	if (group === 'tool')
		return e.targets.some((t) => t === 'digger' || t === 'breakable');
	if (group === 'ranged')
		return e.targets.some(
			(t) => t === 'bow' || t === 'crossbow' || t === 'trident',
		);
	if (group === 'fishing') return e.targets.includes('fishing_rod');
	return false;
}

function EnchantCard({ e }: { e: EnchantEntry }) {
	return (
		<a href={`/mc/enchants/${e.slug}/`} className="mcdb-browse__card">
			<div className="mcdb-browse__icon mcdb-browse__icon--text">
				<span>{e.display_name.charAt(0)}</span>
			</div>
			<div className="mcdb-browse__name">{e.display_name}</div>
			<div className="mcdb-browse__meta">
				<span className="mcdb-browse__cat">
					{e.rarity.replace('_', ' ')}
				</span>
				{e.treasure && (
					<span className="mcdb-browse__tier">treasure</span>
				)}
				{e.curse && <span className="mcdb-browse__tier">curse</span>}
				<span className="mcdb-browse__tier">L{e.max_level}</span>
			</div>
		</a>
	);
}

export function MCEnchantsBrowser({ lockedGroup }: Props = {}) {
	const [items, setItems] = useState<EnchantEntry[] | null>(null);
	const [query, setQuery] = useState('');
	const [group, setGroup] = useState<GroupFilter>(lockedGroup ?? 'all');
	const [rarity, setRarity] = useState<string>('all');
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

	const rarities = useMemo(() => {
		if (!items) return [];
		const set = new Set<string>();
		for (const e of items) set.add(e.rarity);
		return Array.from(set).sort();
	}, [items]);

	const filtered = useMemo(() => {
		if (!items) return [];
		const q = query.trim().toLowerCase();
		return items.filter((e) => {
			if (!matchesGroup(e, group)) return false;
			if (rarity !== 'all' && e.rarity !== rarity) return false;
			if (
				q &&
				!e.ref.includes(q) &&
				!e.display_name.toLowerCase().includes(q)
			) {
				return false;
			}
			return true;
		});
	}, [items, query, group, rarity]);

	useEffect(() => {
		setPage(0);
	}, [query, group, rarity]);

	if (error)
		return (
			<div className="mcdb-browse__status mcdb-browse__status--error">
				{error}
			</div>
		);
	if (!items)
		return <div className="mcdb-browse__status">Loading enchants…</div>;

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
						onChange={(ev) => setQuery(ev.target.value)}
						placeholder="sharpness, looting, mending…"
						className="mcdb-browse__input"
						autoComplete="off"
					/>
				</label>
				{!lockedGroup && (
					<label className="mcdb-browse__filter">
						<span>Group</span>
						<select
							value={group}
							onChange={(ev) =>
								setGroup(ev.target.value as GroupFilter)
							}
							className="mcdb-browse__input">
							<option value="all">All</option>
							<option value="armor">Armor</option>
							<option value="weapon">Weapon</option>
							<option value="tool">Tool</option>
							<option value="ranged">Ranged</option>
							<option value="fishing">Fishing</option>
							<option value="treasure">Treasure</option>
							<option value="curse">Curse</option>
						</select>
					</label>
				)}
				<label className="mcdb-browse__filter">
					<span>Rarity</span>
					<select
						value={rarity}
						onChange={(ev) => setRarity(ev.target.value)}
						className="mcdb-browse__input">
						<option value="all">All</option>
						{rarities.map((r) => (
							<option key={r} value={r}>
								{r.replace('_', ' ')}
							</option>
						))}
					</select>
				</label>
				<button
					type="button"
					className="mcdb-browse__reset"
					onClick={() => {
						setQuery('');
						if (!lockedGroup) setGroup('all');
						setRarity('all');
						setPage(0);
					}}>
					Reset
				</button>
			</div>

			<div className="mcdb-browse__count">
				{filtered.length.toLocaleString()} /{' '}
				{items.length.toLocaleString()} enchants
				{filtered.length > PAGE_SIZE && (
					<>
						{' '}
						· page {page + 1} of {totalPages}
					</>
				)}
			</div>

			{visible.length === 0 ? (
				<div className="mcdb-browse__status">No enchants match.</div>
			) : (
				<div className="mcdb-browse__grid">
					{visible.map((e) => (
						<EnchantCard key={e.ref} e={e} />
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

export default MCEnchantsBrowser;
