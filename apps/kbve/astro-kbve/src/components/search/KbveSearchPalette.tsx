import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mcTextureUrls } from '../mcdb/texture';

type MCItem = {
	id: number;
	ref: string;
	slug: string;
	display_name: string;
	category: string;
	rarity: string;
};

type RareiconItem = {
	id: string;
	key: number;
	ref: string;
	name?: string;
	img?: string;
	rarity?: string;
};

type OSRSItem = {
	id: number;
	name: string;
	slug: string;
	icon: string;
};

type Kind = 'mc' | 'rareicon' | 'osrs';

type SearchResult = {
	kind: Kind;
	ref: string;
	name: string;
	href: string;
	thumb: string | null;
	thumbFallback: string | null;
	sub: string | null;
};

type ManifestState<T> = {
	items: T[] | null;
	failed: boolean;
};

type CachedPayload<T> = { items: T[]; cachedAt: number };

const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const CACHE_PREFIX = 'kbve:search';
const MAX_RESULTS = 50;
const TOP_PER_KIND = 10;

const KIND_LABELS: Record<Kind, string> = {
	mc: 'Minecraft',
	rareicon: 'Rareicon',
	osrs: 'OSRS',
};

function readCache<T>(key: string): T[] | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as CachedPayload<T>;
		if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
		return parsed.items;
	} catch {
		return null;
	}
}

function writeCache<T>(key: string, items: T[]) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(
			key,
			JSON.stringify({
				items,
				cachedAt: Date.now(),
			} satisfies CachedPayload<T>),
		);
	} catch {}
}

const OSRS_ICON_BASE = 'https://oldschool.runescape.wiki/images/';

function osrsIcon(icon: string | null | undefined): string | null {
	if (!icon) return null;
	if (icon.startsWith('http') || icon.startsWith('/')) return icon;
	return OSRS_ICON_BASE + encodeURIComponent(icon.replace(/ /g, '_'));
}

function rareiconImg(img: string | null | undefined): string | null {
	if (!img) return null;
	if (img.startsWith('http') || img.startsWith('/')) return img;
	return `/${img}`;
}

function mcResult(item: MCItem): SearchResult {
	const tex = mcTextureUrls(item.ref, item.category);
	return {
		kind: 'mc',
		ref: item.ref,
		name: item.display_name,
		href: `/mc/items/${item.slug}/`,
		thumb: tex.primary,
		thumbFallback: tex.fallback,
		sub: item.category || null,
	};
}

function rareiconResult(item: RareiconItem): SearchResult {
	return {
		kind: 'rareicon',
		ref: item.ref,
		name: item.name || item.ref,
		href: `/itemdb/${item.ref}/`,
		thumb: rareiconImg(item.img),
		thumbFallback: null,
		sub: item.rarity || null,
	};
}

function osrsResult(item: OSRSItem): SearchResult {
	return {
		kind: 'osrs',
		ref: item.slug,
		name: item.name,
		href: `/osrs/${item.slug}/`,
		thumb: osrsIcon(item.icon),
		thumbFallback: null,
		sub: null,
	};
}

function rankScore(name: string, ref: string, q: string): number {
	const n = name.toLowerCase();
	const r = ref.toLowerCase();
	if (r === q) return 0;
	if (n === q) return 1;
	if (n.startsWith(q)) return 2;
	if (n.includes(q)) return 3;
	if (r.includes(q)) return 4;
	return 99;
}

function fmtSub(kind: Kind, sub: string | null): string | null {
	if (!sub) return null;
	if (kind === 'mc') return sub;
	if (kind === 'rareicon') return `rarity: ${sub}`;
	return sub;
}

export function KbveSearchPalette() {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [selected, setSelected] = useState(0);
	const [mc, setMc] = useState<ManifestState<MCItem>>({
		items: null,
		failed: false,
	});
	const [rareicon, setRareicon] = useState<ManifestState<RareiconItem>>({
		items: null,
		failed: false,
	});
	const [osrs, setOsrs] = useState<ManifestState<OSRSItem>>({
		items: null,
		failed: false,
	});
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	const loadedRef = useRef(false);

	const loadManifests = useCallback(() => {
		if (loadedRef.current) return;
		loadedRef.current = true;

		const mcCached = readCache<MCItem>(`${CACHE_PREFIX}:mc:v1`);
		if (mcCached) setMc({ items: mcCached, failed: false });
		const rareiconCached = readCache<RareiconItem>(
			`${CACHE_PREFIX}:rareicon:v1`,
		);
		if (rareiconCached)
			setRareicon({ items: rareiconCached, failed: false });
		const osrsCached = readCache<OSRSItem>(`${CACHE_PREFIX}:osrs:v1`);
		if (osrsCached) setOsrs({ items: osrsCached, failed: false });

		void fetch('/api/mc-items.json')
			.then((r) => {
				if (!r.ok) throw new Error(`${r.status}`);
				return r.json() as Promise<{ items: MCItem[] }>;
			})
			.then((json) => {
				setMc({ items: json.items, failed: false });
				writeCache(`${CACHE_PREFIX}:mc:v1`, json.items);
			})
			.catch(() => {
				setMc((prev) =>
					prev.items ? prev : { items: null, failed: true },
				);
			});

		void fetch('/api/itemdb.json')
			.then((r) => {
				if (!r.ok) throw new Error(`${r.status}`);
				return r.json() as Promise<{ items: RareiconItem[] }>;
			})
			.then((json) => {
				setRareicon({ items: json.items, failed: false });
				writeCache(`${CACHE_PREFIX}:rareicon:v1`, json.items);
			})
			.catch(() => {
				setRareicon((prev) =>
					prev.items ? prev : { items: null, failed: true },
				);
			});

		void fetch('/api/osrs.json')
			.then((r) => {
				if (!r.ok) throw new Error(`${r.status}`);
				return r.json() as Promise<{ items: OSRSItem[] }>;
			})
			.then((json) => {
				setOsrs({ items: json.items, failed: false });
				writeCache(`${CACHE_PREFIX}:osrs:v1`, json.items);
			})
			.catch(() => {
				setOsrs((prev) =>
					prev.items ? prev : { items: null, failed: true },
				);
			});
	}, []);

	const openPalette = useCallback(() => {
		setOpen(true);
		setQuery('');
		setSelected(0);
		loadManifests();
	}, [loadManifests]);

	const closePalette = useCallback(() => {
		setOpen(false);
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const inField =
				target &&
				(target.tagName === 'INPUT' ||
					target.tagName === 'TEXTAREA' ||
					target.tagName === 'SELECT' ||
					(target as HTMLElement).isContentEditable);

			const isToggle =
				(e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);
			if (isToggle) {
				e.preventDefault();
				if (open) closePalette();
				else openPalette();
				return;
			}
			if (e.key === '/' && !inField && !open) {
				e.preventDefault();
				openPalette();
				return;
			}
			if (e.key === 'Escape' && open) {
				e.preventDefault();
				closePalette();
			}
		};
		const onOpenEvent = () => openPalette();
		window.addEventListener('keydown', onKey);
		window.addEventListener(
			'kbve:search:open',
			onOpenEvent as EventListener,
		);
		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener(
				'kbve:search:open',
				onOpenEvent as EventListener,
			);
		};
	}, [open, openPalette, closePalette]);

	useEffect(() => {
		if (open) {
			const t = window.setTimeout(() => inputRef.current?.focus(), 30);
			document.documentElement.style.overflow = 'hidden';
			return () => {
				window.clearTimeout(t);
				document.documentElement.style.overflow = '';
			};
		}
	}, [open]);

	const results = useMemo<SearchResult[]>(() => {
		const q = query.trim().toLowerCase();
		const mcItems = mc.items ?? [];
		const rareiconItems = rareicon.items ?? [];
		const osrsItems = osrs.items ?? [];

		if (!q) {
			const a = mcItems
				.slice()
				.sort((x, y) => x.display_name.localeCompare(y.display_name))
				.slice(0, TOP_PER_KIND)
				.map(mcResult);
			const b = rareiconItems
				.slice()
				.sort((x, y) =>
					(x.name ?? x.ref).localeCompare(y.name ?? y.ref),
				)
				.slice(0, TOP_PER_KIND)
				.map(rareiconResult);
			const c = osrsItems
				.slice()
				.sort((x, y) => x.name.localeCompare(y.name))
				.slice(0, TOP_PER_KIND)
				.map(osrsResult);
			return [...a, ...b, ...c];
		}

		type Scored = { score: number; result: SearchResult };
		const scored: Scored[] = [];

		for (const it of mcItems) {
			const s = rankScore(it.display_name, it.ref, q);
			if (s < 99) scored.push({ score: s, result: mcResult(it) });
		}
		for (const it of rareiconItems) {
			const s = rankScore(it.name ?? it.ref, it.ref, q);
			if (s < 99) scored.push({ score: s, result: rareiconResult(it) });
		}
		for (const it of osrsItems) {
			const s = rankScore(it.name, it.slug, q);
			if (s < 99) scored.push({ score: s, result: osrsResult(it) });
		}

		scored.sort((a, b) => {
			if (a.score !== b.score) return a.score - b.score;
			return a.result.name.localeCompare(b.result.name);
		});

		return scored.slice(0, MAX_RESULTS).map((s) => s.result);
	}, [query, mc.items, rareicon.items, osrs.items]);

	useEffect(() => {
		setSelected(0);
	}, [query]);

	useEffect(() => {
		if (!open) return;
		const list = listRef.current;
		if (!list) return;
		const row = list.querySelector<HTMLElement>(
			`[data-row-index="${selected}"]`,
		);
		if (row) row.scrollIntoView({ block: 'nearest' });
	}, [selected, open, results.length]);

	const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setSelected((s) =>
				Math.min(s + 1, Math.max(0, results.length - 1)),
			);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setSelected((s) => Math.max(s - 1, 0));
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const r = results[selected];
			if (r) {
				closePalette();
				window.location.assign(r.href);
			}
		}
	};

	if (!open) return null;

	const showGroups = query.trim().length === 0;
	const failureNotes: string[] = [];
	if (mc.failed && !mc.items) failureNotes.push('(MC index unavailable)');
	if (rareicon.failed && !rareicon.items)
		failureNotes.push('(Rareicon index unavailable)');
	if (osrs.failed && !osrs.items)
		failureNotes.push('(OSRS index unavailable)');

	const loading =
		!mc.items &&
		!rareicon.items &&
		!osrs.items &&
		failureNotes.length === 0;

	const rendered: ReactNode[] = [];
	{
		let lastGroup: Kind | null = null;
		results.forEach((r, i) => {
			if (showGroups && r.kind !== lastGroup) {
				rendered.push(
					<div key={`h-${r.kind}`} className="kbve-search__group">
						{KIND_LABELS[r.kind]}
					</div>,
				);
				lastGroup = r.kind;
			}
			const isSelected = i === selected;
			const sub = fmtSub(r.kind, r.sub);
			rendered.push(
				<button
					type="button"
					key={`${r.kind}:${r.ref}:${i}`}
					data-row-index={i}
					className={
						'kbve-search__row' +
						(isSelected ? ' kbve-search__row--active' : '')
					}
					onMouseEnter={() => setSelected(i)}
					onClick={() => {
						closePalette();
						window.location.assign(r.href);
					}}>
					<span
						className={
							'kbve-search__thumb kbve-search__thumb--' + r.kind
						}>
						{r.thumb ? (
							<img
								src={r.thumb}
								alt=""
								loading="lazy"
								onError={(ev) => {
									const img = ev.currentTarget;
									if (
										img.dataset.fb === '1' ||
										!r.thumbFallback
									) {
										img.style.visibility = 'hidden';
										return;
									}
									img.dataset.fb = '1';
									img.src = r.thumbFallback;
								}}
							/>
						) : (
							<span className="kbve-search__thumb-fallback">
								{r.name.slice(0, 1).toUpperCase()}
							</span>
						)}
					</span>
					<span className="kbve-search__body">
						<span className="kbve-search__name">{r.name}</span>
						<span className="kbve-search__meta">
							<span className="kbve-search__ref">{r.ref}</span>
							{sub && (
								<span className="kbve-search__sub">{sub}</span>
							)}
						</span>
					</span>
					<span
						className={
							'kbve-search__kind kbve-search__kind--' + r.kind
						}>
						{KIND_LABELS[r.kind]}
					</span>
				</button>,
			);
		});
	}

	return (
		<div
			className="kbve-search"
			role="dialog"
			aria-modal="true"
			aria-label="KBVE search"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) closePalette();
			}}>
			<div
				className="kbve-search__modal"
				onMouseDown={(e) => e.stopPropagation()}>
				<div className="kbve-search__input-row">
					<svg
						className="kbve-search__icon"
						viewBox="0 0 24 24"
						width="20"
						height="20"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true">
						<circle cx="11" cy="11" r="7" />
						<path d="m20 20-3-3" />
					</svg>
					<input
						ref={inputRef}
						className="kbve-search__input"
						type="text"
						placeholder="Search MC, Rareicon, OSRS…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={onKeyDown}
						autoComplete="off"
						spellCheck={false}
					/>
					<kbd className="kbve-search__esc">Esc</kbd>
				</div>
				<div ref={listRef} className="kbve-search__list" role="listbox">
					{loading && (
						<div className="kbve-search__empty">
							Loading indexes…
						</div>
					)}
					{!loading && results.length === 0 && (
						<div className="kbve-search__empty">
							{query.trim()
								? `No matches for "${query.trim()}"`
								: 'No items indexed.'}
						</div>
					)}
					{rendered}
				</div>
				<footer className="kbve-search__footer">
					<span>
						<kbd>↑</kbd>
						<kbd>↓</kbd> navigate
					</span>
					<span>
						<kbd>Enter</kbd> open
					</span>
					<span>
						<kbd>Esc</kbd> close
					</span>
					{failureNotes.length > 0 && (
						<span className="kbve-search__warn">
							{failureNotes.join(' ')}
						</span>
					)}
				</footer>
			</div>
		</div>
	);
}

export default KbveSearchPalette;
