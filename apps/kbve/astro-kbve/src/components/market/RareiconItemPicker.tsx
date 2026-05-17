import { useEffect, useMemo, useState } from 'react';

type RareiconItem = {
	id: string;
	key: number;
	ref: string;
	name?: string;
	img?: string;
	rarity?: string;
	type_flags?: number;
};

type Props = {
	value: string;
	onChange: (next: string) => void;
	disabled?: boolean;
	placeholder?: string;
};

const CACHE_KEY = 'kbve:rareicon-items:index:v1';
const ENDPOINT = '/api/itemdb.json';

type CachedPayload = { items: RareiconItem[]; cachedAt: number };

function readCache(): RareiconItem[] | null {
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

function writeCache(items: RareiconItem[]) {
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

export function RareiconItemPicker({
	value,
	onChange,
	disabled,
	placeholder = 'coal',
}: Props) {
	const [items, setItems] = useState<RareiconItem[] | null>(null);
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
				const json = (await res.json()) as { items: RareiconItem[] };
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
					it.ref.toLowerCase().includes(q) ||
					(it.name?.toLowerCase().includes(q) ?? false),
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

	return (
		<div className="kbve-mcpicker">
			<div className="kbve-mcpicker__input-row">
				{known?.img && (
					<img
						className="kbve-mcpicker__preview"
						src={known.img}
						alt={known.name ?? known.ref}
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
					href={`/itemdb/${known.ref}/`}
					target="_blank"
					rel="noopener"
					title={`${known.name ?? known.ref} — open page`}>
					✓ {known.name ?? known.ref}
				</a>
			)}
			{open && matches.length > 0 && (
				<ul className="kbve-mcpicker__list" role="listbox">
					{matches.map((it) => (
						<li key={it.ref} role="option">
							<button
								type="button"
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => onPick(it.ref)}>
								{it.img ? (
									<img
										className="kbve-mcpicker__row-img"
										src={it.img}
										alt={it.name ?? it.ref}
										loading="lazy"
									/>
								) : (
									<span
										className="kbve-mcpicker__row-img kbve-mcpicker__row-img--missing"
										aria-hidden>
										{(it.name ?? it.ref)
											.charAt(0)
											.toUpperCase()}
									</span>
								)}
								<span className="kbve-mcpicker__name">
									{it.name ?? it.ref}
								</span>
								<span className="kbve-mcpicker__ref">
									{it.ref}
								</span>
								{it.rarity && (
									<span className="kbve-mcpicker__cat">
										{it.rarity}
									</span>
								)}
							</button>
						</li>
					))}
				</ul>
			)}
			{open && items && matches.length === 0 && query.trim() && (
				<div className="kbve-mcpicker__empty">
					Unknown ref. You can still list <code>{query}</code> — but
					it won't link to a /itemdb page.
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

export default RareiconItemPicker;
