import { useEffect, useMemo, useState } from 'react';
import { mcTextureUrls } from './texture';

type BlockEntry = {
	id: number;
	ref: string;
	slug: string;
	display_name: string;
	material: string;
	hardness: number;
	blast_resistance: number;
	best_tool: string;
	required_tool_tier: number;
	tags: string[];
};

type ManifestPayload = { count: number; items: BlockEntry[] };

const PAGE_SIZE = 60;
const ENDPOINT = '/api/mc-blocks.json';

type Props = { lockedMaterial?: string };

function BlockCard({ b }: { b: BlockEntry }) {
	const tex = mcTextureUrls(b.ref, 'block');
	return (
		<a
			href={`/mc/blocks/${b.slug}/`}
			data-mc-card="block"
			data-mc-slug={b.slug}
			className="mcdb-browse__card">
			<div className="mcdb-browse__icon">
				<img
					src={tex.primary}
					alt={b.display_name}
					loading="lazy"
					onError={(ev) => {
						const img = ev.currentTarget;
						if (img.dataset.fb === '1') return;
						img.dataset.fb = '1';
						img.src = tex.fallback;
					}}
				/>
			</div>
			<div className="mcdb-browse__name">{b.display_name}</div>
			<div className="mcdb-browse__meta">
				<span className="mcdb-browse__cat">{b.material}</span>
				{b.best_tool && b.best_tool !== 'hand' && (
					<span className="mcdb-browse__tier">{b.best_tool}</span>
				)}
			</div>
		</a>
	);
}

export function MCBlocksBrowser({ lockedMaterial }: Props = {}) {
	const [items, setItems] = useState<BlockEntry[] | null>(null);
	const [query, setQuery] = useState('');
	const [material, setMaterial] = useState<string>(lockedMaterial ?? 'all');
	const [tool, setTool] = useState<string>('all');
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

	const materials = useMemo(() => {
		if (!items) return [];
		const set = new Set<string>();
		for (const b of items) set.add(b.material);
		return Array.from(set).sort();
	}, [items]);

	const tools = useMemo(() => {
		if (!items) return [];
		const set = new Set<string>();
		for (const b of items) if (b.best_tool) set.add(b.best_tool);
		return Array.from(set).sort();
	}, [items]);

	const filtered = useMemo(() => {
		if (!items) return [];
		const q = query.trim().toLowerCase();
		return items.filter((b) => {
			if (material !== 'all' && b.material !== material) return false;
			if (tool !== 'all' && b.best_tool !== tool) return false;
			if (
				q &&
				!b.ref.includes(q) &&
				!b.display_name.toLowerCase().includes(q)
			) {
				return false;
			}
			return true;
		});
	}, [items, query, material, tool]);

	useEffect(() => {
		setPage(0);
	}, [query, material, tool]);

	if (error)
		return (
			<div className="mcdb-browse__status mcdb-browse__status--error">
				{error}
			</div>
		);
	if (!items)
		return <div className="mcdb-browse__status">Loading blocks…</div>;

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
						placeholder="stone, oak, dirt…"
						className="mcdb-browse__input"
						autoComplete="off"
					/>
				</label>
				{!lockedMaterial && (
					<label className="mcdb-browse__filter">
						<span>Material</span>
						<select
							value={material}
							onChange={(ev) => setMaterial(ev.target.value)}
							className="mcdb-browse__input">
							<option value="all">All</option>
							{materials.map((m) => (
								<option key={m} value={m}>
									{m}
								</option>
							))}
						</select>
					</label>
				)}
				<label className="mcdb-browse__filter">
					<span>Tool</span>
					<select
						value={tool}
						onChange={(ev) => setTool(ev.target.value)}
						className="mcdb-browse__input">
						<option value="all">All</option>
						{tools.map((t) => (
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
						if (!lockedMaterial) setMaterial('all');
						setTool('all');
						setPage(0);
					}}>
					Reset
				</button>
			</div>

			<div className="mcdb-browse__count">
				{filtered.length.toLocaleString()} /{' '}
				{items.length.toLocaleString()} blocks
				{filtered.length > PAGE_SIZE && (
					<>
						{' '}
						· page {page + 1} of {totalPages}
					</>
				)}
			</div>

			{visible.length === 0 ? (
				<div className="mcdb-browse__status">No blocks match.</div>
			) : (
				<div className="mcdb-browse__grid">
					{visible.map((b) => (
						<BlockCard key={b.ref} b={b} />
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

export default MCBlocksBrowser;
