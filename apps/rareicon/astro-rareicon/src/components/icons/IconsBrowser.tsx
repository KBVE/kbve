import { useEffect, useMemo, useRef, useState } from 'react';
import type { TermSummary } from '@/lib/icons/terms';

const PAGE_SIZE = 60;

interface Props {
	terms: TermSummary[];
	categories: string[];
	styles: string[];
	themes: string[];
	sources: string[];
	/** Synonym map keyed by base ref → list of search aliases. */
	synonyms: Record<string, string[]>;
	/** Base path for term detail links (no trailing slash). */
	basePath?: string;
}

/**
 * Walk the synonym map and return every base ref whose alias list
 * contains the query. Lets a search for "blade" match the term
 * `sword` when the ledger carries `{ sword: ["blade", ...] }`.
 */
function refsMatchingSynonym(
	q: string,
	synonyms: Record<string, string[]>,
): Set<string> {
	const out = new Set<string>();
	if (!q) return out;
	for (const [baseRef, aliases] of Object.entries(synonyms)) {
		if (baseRef.toLowerCase().includes(q)) out.add(baseRef);
		for (const a of aliases) {
			if (a.toLowerCase().includes(q)) {
				out.add(baseRef);
				break;
			}
		}
	}
	return out;
}

export default function IconsBrowser({
	terms,
	categories,
	styles,
	themes,
	sources,
	synonyms,
	basePath = '/icons',
}: Props) {
	const [query, setQuery] = useState('');
	const [activeCategory, setActiveCategory] = useState<string | null>(null);
	const [activeStyle, setActiveStyle] = useState<string | null>(null);
	const [activeTheme, setActiveTheme] = useState<string | null>(null);
	const [activeSource, setActiveSource] = useState<string | null>(null);
	const [multiSourceOnly, setMultiSourceOnly] = useState(false);
	const [attributionOnly, setAttributionOnly] = useState(false);

	const hasActiveFilter =
		!!query.trim() ||
		activeCategory !== null ||
		activeStyle !== null ||
		activeTheme !== null ||
		activeSource !== null ||
		multiSourceOnly ||
		attributionOnly;

	const featuredTerms = useMemo(
		() => terms.filter((t) => t.featured).slice(0, 12),
		[terms],
	);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		const synonymHits = refsMatchingSynonym(q, synonyms);
		return terms.filter((t) => {
			if (activeCategory && !t.categories.includes(activeCategory))
				return false;
			if (activeStyle && !t.styles.includes(activeStyle)) return false;
			if (activeTheme && !t.themes.includes(activeTheme)) return false;
			if (activeSource && !t.sourcePacks.includes(activeSource))
				return false;
			if (multiSourceOnly && !t.multiSource) return false;
			if (attributionOnly && !t.attributionRequired) return false;
			if (!q) return true;
			if (synonymHits.has(t.ref)) return true;
			const haystack = [
				t.ref,
				t.name,
				t.description ?? '',
				...t.categories,
				...t.tags,
				...t.variantTags,
				...t.themes,
				...t.sourcePacks,
				...t.keywords,
			]
				.join(' ')
				.toLowerCase();
			return haystack.includes(q);
		});
	}, [
		terms,
		query,
		activeCategory,
		activeStyle,
		activeTheme,
		activeSource,
		multiSourceOnly,
		attributionOnly,
		synonyms,
	]);

	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

	useEffect(() => {
		setVisibleCount(PAGE_SIZE);
	}, [
		query,
		activeCategory,
		activeStyle,
		activeTheme,
		activeSource,
		multiSourceOnly,
		attributionOnly,
	]);

	const sentinelRef = useRef<HTMLLIElement | null>(null);
	useEffect(() => {
		const el = sentinelRef.current;
		if (!el) return;
		const obs = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					setVisibleCount((c) =>
						Math.min(c + PAGE_SIZE, filtered.length),
					);
				}
			},
			{ rootMargin: '600px 0px' },
		);
		obs.observe(el);
		return () => obs.disconnect();
	}, [filtered.length, visibleCount]);

	const visible = filtered.slice(0, visibleCount);

	const toggle = <T extends string>(
		current: T | null,
		value: T,
		set: (v: T | null) => void,
	) => {
		set(current === value ? null : value);
	};

	return (
		<div className="ri-icons-browser">
			<div className="ri-icons-browser__controls">
				<input
					type="search"
					className="ri-icons-browser__search"
					placeholder="Search icons — e.g. sword, close, arrow"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					aria-label="Search icons"
				/>
				<div className="ri-icons-browser__count">
					{filtered.length} / {terms.length} terms
				</div>
			</div>

			<ChipRow
				label="Category"
				values={categories}
				active={activeCategory}
				onToggle={(v) => toggle(activeCategory, v, setActiveCategory)}
				linkBase="/icons/category"
			/>
			<ChipRow
				label="Style"
				values={styles}
				active={activeStyle}
				onToggle={(v) => toggle(activeStyle, v, setActiveStyle)}
			/>
			{themes.length > 0 && (
				<ChipRow
					label="Theme"
					values={themes}
					active={activeTheme}
					onToggle={(v) => toggle(activeTheme, v, setActiveTheme)}
				/>
			)}
			{sources.length > 0 && (
				<ChipRow
					label="Source"
					values={sources}
					active={activeSource}
					onToggle={(v) => toggle(activeSource, v, setActiveSource)}
				/>
			)}
			<div
				className="ri-icons-browser__chip-row"
				role="group"
				aria-label="Filters">
				<span className="ri-icons-browser__chip-label">Filters</span>
				<button
					type="button"
					className="ri-icons-browser__chip"
					data-active={multiSourceOnly ? 'true' : undefined}
					onClick={() => setMultiSourceOnly((v) => !v)}
					aria-pressed={multiSourceOnly}>
					Multi-source only
				</button>
				<button
					type="button"
					className="ri-icons-browser__chip"
					data-active={attributionOnly ? 'true' : undefined}
					onClick={() => setAttributionOnly((v) => !v)}
					aria-pressed={attributionOnly}>
					Attribution required (CC BY)
				</button>
			</div>

			{!hasActiveFilter && featuredTerms.length > 0 && (
				<section
					className="ri-icons-browser__featured"
					aria-label="Featured icons">
					<header className="ri-icons-browser__featured-header">
						<span className="ri-icons-browser__featured-label">
							Featured
						</span>
						<span className="ri-icons-browser__featured-hint">
							Hand-picked terms across the catalog
						</span>
					</header>
					<ul className="ri-icons-browser__grid">
						{featuredTerms.map((t) => (
							<li key={t.ref} className="ri-icons-browser__item">
								<a
									href={`${basePath}/${t.ref}/`}
									className="ri-icons-browser__card">
									<div
										className="ri-icons-browser__thumb"
										dangerouslySetInnerHTML={{
											__html: t.previewSvg ?? '',
										}}
									/>
									<div className="ri-icons-browser__meta">
										<span className="ri-icons-browser__name">
											{t.name}
										</span>
										<span className="ri-icons-browser__count-pill">
											{t.variantCount}
											{t.variantCount === 1
												? ' variant'
												: ' variants'}
										</span>
									</div>
								</a>
							</li>
						))}
					</ul>
				</section>
			)}

			{filtered.length === 0 ? (
				<div className="ri-icons-browser__empty">
					No icons match. Clear a filter or try a different query.
				</div>
			) : (
				<ul className="ri-icons-browser__grid">
					{visible.map((t) => (
						<li key={t.ref} className="ri-icons-browser__item">
							<a
								href={`${basePath}/${t.ref}/`}
								className="ri-icons-browser__card">
								<div
									className="ri-icons-browser__thumb"
									dangerouslySetInnerHTML={{
										__html: t.previewSvg ?? '',
									}}
								/>
								<div className="ri-icons-browser__meta">
									<span className="ri-icons-browser__name">
										{t.name}
									</span>
									{t.primary_category && (
										<span className="ri-icons-browser__chip">
											{t.primary_category}
										</span>
									)}
									<span className="ri-icons-browser__count-pill">
										{t.variantCount} variant
										{t.variantCount === 1 ? '' : 's'}
									</span>
								</div>
							</a>
						</li>
					))}
					{visibleCount < filtered.length && (
						<li
							ref={sentinelRef}
							className="ri-icons-browser__sentinel"
							aria-hidden="true">
							Loading {filtered.length - visibleCount} more…
						</li>
					)}
				</ul>
			)}
		</div>
	);
}

interface ChipRowProps {
	label: string;
	values: string[];
	active: string | null;
	onToggle: (value: string) => void;
	linkBase?: string;
}

function ChipRow({ label, values, active, onToggle, linkBase }: ChipRowProps) {
	if (values.length === 0) return null;

	const handleChipClick = (e: React.MouseEvent, value: string) => {
		if (
			linkBase &&
			(e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)
		) {
			return;
		}
		if (!linkBase) {
			e.preventDefault();
			onToggle(value);
		}
	};

	return (
		<div
			className="ri-icons-browser__chip-row"
			role="group"
			aria-label={label}>
			<span className="ri-icons-browser__chip-label">{label}</span>
			{values.map((v) => {
				const isActive = active === v;
				if (linkBase) {
					return (
						<a
							key={v}
							href={`${linkBase}/${v}/`}
							className="ri-icons-browser__chip"
							data-active={isActive ? 'true' : undefined}
							onClick={(e) => handleChipClick(e, v)}
							onAuxClick={(e) => handleChipClick(e, v)}>
							{v}
						</a>
					);
				}
				return (
					<button
						key={v}
						type="button"
						className="ri-icons-browser__chip"
						data-active={isActive ? 'true' : undefined}
						onClick={() => onToggle(v)}
						aria-pressed={isActive}>
						{v}
					</button>
				);
			})}
		</div>
	);
}
