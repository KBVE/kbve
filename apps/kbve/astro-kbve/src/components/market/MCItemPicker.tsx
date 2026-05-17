import { useEffect, useMemo, useState } from 'react';
import { mcTextureUrls } from '../mcdb/texture';

type MCItemIndexEntry = {
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

type Props = {
	value: string;
	onChange: (next: string) => void;
	disabled?: boolean;
	placeholder?: string;
};

const CACHE_KEY = 'kbve:mc-items:index:v1';
const ENDPOINT = '/api/mc-items.json';

type CachedPayload = { items: MCItemIndexEntry[]; cachedAt: number };

function readCache(): MCItemIndexEntry[] | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as CachedPayload;
		if (Date.now() - parsed.cachedAt > 1000 * 60 * 60 * 24) return null;
		return parsed.items;
	} catch {
		return null;
	}
}

function writeCache(items: MCItemIndexEntry[]) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(
			CACHE_KEY,
			JSON.stringify({
				items,
				cachedAt: Date.now(),
			} satisfies CachedPayload),
		);
	} catch {}
}

export function MCItemPicker({
	value,
	onChange,
	disabled,
	placeholder = 'diamond_sword',
}: Props) {
	const [items, setItems] = useState<MCItemIndexEntry[] | null>(null);
	const [query, setQuery] = useState(value);
	const [open, setOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setQuery(value);
	}, [value]);

	useEffect(() => {
		const cached = readCache();
		if (cached) setItems(cached);
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(ENDPOINT);
				if (!res.ok) throw new Error(`${res.status}`);
				const json = (await res.json()) as {
					items: MCItemIndexEntry[];
				};
				if (cancelled) return;
				setItems(json.items);
				writeCache(json.items);
			} catch (e) {
				if (!cancelled)
					setError(e instanceof Error ? e.message : 'load failed');
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const matches = useMemo(() => {
		if (!items) return [];
		const q = query.trim().toLowerCase();
		if (!q) return items.slice(0, 25);
		return items
			.filter(
				(it) =>
					it.ref.includes(q) ||
					it.display_name.toLowerCase().includes(q),
			)
			.slice(0, 25);
	}, [items, query]);

	const known = useMemo(() => {
		if (!items || !value) return null;
		return items.find((it) => it.ref === value) ?? null;
	}, [items, value]);

	const onPick = (ref: string) => {
		onChange(ref);
		setQuery(ref);
		setOpen(false);
	};

	const knownTex = known ? mcTextureUrls(known.ref, known.category) : null;

	return (
		<div className="kbve-mcpicker">
			<div className="kbve-mcpicker__input-row">
				{knownTex && (
					<img
						className="kbve-mcpicker__preview"
						src={knownTex.primary}
						alt={known?.display_name ?? ''}
						onError={(ev) => {
							const img = ev.currentTarget;
							if (img.dataset.fb === '1') return;
							img.dataset.fb = '1';
							img.src = knownTex.fallback;
						}}
						loading="lazy"
					/>
				)}
				<input
					type="text"
					className="kbve-market__input kbve-mcpicker__input"
					placeholder={placeholder}
					value={query}
					disabled={disabled}
					onChange={(e) => {
						setQuery(e.target.value);
						onChange(e.target.value);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					onBlur={() => window.setTimeout(() => setOpen(false), 150)}
					autoComplete="off"
					spellCheck={false}
				/>
			</div>
			{known && (
				<a
					className="kbve-mcpicker__known"
					href={`/mc/items/${known.slug}/`}
					target="_blank"
					rel="noopener"
					title={`${known.display_name} — open page`}>
					✓ {known.display_name}
				</a>
			)}
			{open && matches.length > 0 && (
				<ul className="kbve-mcpicker__list" role="listbox">
					{matches.map((it) => {
						const tex = mcTextureUrls(it.ref, it.category);
						return (
							<li key={it.ref} role="option">
								<button
									type="button"
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => onPick(it.ref)}>
									<img
										className="kbve-mcpicker__row-img"
										src={tex.primary}
										alt={it.display_name}
										onError={(ev) => {
											const img = ev.currentTarget;
											if (img.dataset.fb === '1') return;
											img.dataset.fb = '1';
											img.src = tex.fallback;
										}}
										loading="lazy"
									/>
									<span className="kbve-mcpicker__name">
										{it.display_name}
									</span>
									<span className="kbve-mcpicker__ref">
										{it.ref}
									</span>
									<span className="kbve-mcpicker__cat">
										{it.category}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			)}
			{open && items && matches.length === 0 && query.trim() && (
				<div className="kbve-mcpicker__empty">
					Unknown ref. You can still list <code>{query}</code> — but
					it won't link to a /mc/items page.
				</div>
			)}
			{error && (
				<div className="kbve-market__status kbve-market__status--error">
					item index failed: {error}
				</div>
			)}
		</div>
	);
}

export default MCItemPicker;
