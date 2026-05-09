import { useMemo, useState } from 'react';
import type { TermSummary } from '@/lib/icons/terms';

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

			{filtered.length === 0 ? (
				<div className="ri-icons-browser__empty">
					No icons match. Clear a filter or try a different query.
				</div>
			) : (
				<ul className="ri-icons-browser__grid">
					{filtered.map((t) => (
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
}

function ChipRow({ label, values, active, onToggle }: ChipRowProps) {
	if (values.length === 0) return null;
	return (
		<div
			className="ri-icons-browser__chip-row"
			role="group"
			aria-label={label}>
			<span className="ri-icons-browser__chip-label">{label}</span>
			{values.map((v) => {
				const isActive = active === v;
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
