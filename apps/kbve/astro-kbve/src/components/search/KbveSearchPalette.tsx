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

type Kind = 'mc' | 'rareicon' | 'osrs' | 'docs';

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
	docs: 'Pages',
};

const PAGEFIND_MAX = 8;

// Search priority: docs/pages lead (handled separately), then itemdb, then
// the lower-tier game catalogs (Minecraft, OSRS).
const KIND_TIER: Record<Kind, number> = {
	docs: 0,
	rareicon: 1,
	mc: 2,
	osrs: 2,
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

type PagefindData = {
	url: string;
	excerpt?: string;
	meta?: { title?: string; image?: string };
};

type PagefindModule = {
	init?: () => Promise<void>;
	options?: (opts: Record<string, unknown>) => Promise<void>;
	debouncedSearch: (
		q: string,
	) => Promise<{
		results: Array<{ data: () => Promise<PagefindData> }>;
	} | null>;
};

function stripHtml(s: string): string {
	return s
		.replace(/<[^>]*>/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function docsResult(d: PagefindData): SearchResult {
	const url = d.url.replace(/\.html$/, '');
	const title = d.meta?.title || url;
	return {
		kind: 'docs',
		ref: url,
		name: title,
		href: url,
		thumb: d.meta?.image || null,
		thumbFallback: null,
		sub: d.excerpt ? stripHtml(d.excerpt).slice(0, 120) : null,
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
	const [docsResults, setDocsResults] = useState<SearchResult[]>([]);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	const loadedRef = useRef(false);
	const pagefindRef = useRef<PagefindModule | null>(null);
	const pagefindFailedRef = useRef(false);

	const loadPagefind =
		useCallback(async (): Promise<PagefindModule | null> => {
			if (pagefindRef.current) return pagefindRef.current;
			if (pagefindFailedRef.current) return null;
			try {
				const base = import.meta.env.BASE_URL || '/';
				const url = `${base.replace(/\/$/, '')}/pagefind/pagefind.js`;
				const mod = (await import(
					/* @vite-ignore */ url
				)) as PagefindModule;
				await mod.init?.();
				pagefindRef.current = mod;
				return mod;
			} catch {
				pagefindFailedRef.current = true;
				return null;
			}
		}, []);

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
			return [...b, ...a, ...c];
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
			const ta = KIND_TIER[a.result.kind];
			const tb = KIND_TIER[b.result.kind];
			if (ta !== tb) return ta - tb;
			if (a.score !== b.score) return a.score - b.score;
			return a.result.name.localeCompare(b.result.name);
		});

		return scored.slice(0, MAX_RESULTS).map((s) => s.result);
	}, [query, mc.items, rareicon.items, osrs.items]);

	useEffect(() => {
		const q = query.trim();
		if (!open || q.length < 2) {
			setDocsResults([]);
			return;
		}
		let cancelled = false;
		void (async () => {
			const pf = await loadPagefind();
			if (!pf || cancelled) return;
			const search = await pf.debouncedSearch(q);
			if (!search || cancelled) return;
			const top = await Promise.all(
				search.results.slice(0, PAGEFIND_MAX).map((r) => r.data()),
			);
			if (cancelled) return;
			setDocsResults(top.map(docsResult));
		})();
		return () => {
			cancelled = true;
		};
	}, [query, open, loadPagefind]);

	const allResults = useMemo<SearchResult[]>(
		() => [...docsResults, ...results],
		[results, docsResults],
	);

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
	}, [selected, open, allResults.length]);

	const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setSelected((s) =>
				Math.min(s + 1, Math.max(0, allResults.length - 1)),
			);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setSelected((s) => Math.max(s - 1, 0));
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const r = allResults[selected];
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
		allResults.forEach((r, i) => {
			if ((showGroups || r.kind === 'docs') && r.kind !== lastGroup) {
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
						placeholder="Search pages, MC, Rareicon, OSRS…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={onKeyDown}
						autoComplete="off"
						spellCheck={false}
					/>
					<kbd className="kbve-search__esc">Esc</kbd>
					<button
						type="button"
						className="kbve-search__close"
						onClick={closePalette}
						aria-label="Close search">
						<svg
							viewBox="0 0 24 24"
							width="20"
							height="20"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>
				<div ref={listRef} className="kbve-search__list" role="listbox">
					{loading && (
						<div className="kbve-search__empty">
							Loading indexes…
						</div>
					)}
					{!loading && allResults.length === 0 && (
						<div className="kbve-search__empty">
							{query.trim()
								? `No matches for "${query.trim()}"`
								: 'No items indexed.'}
						</div>
					)}
					{rendered}
				</div>
				<footer className="kbve-search__footer">
					<span className="kbve-search__kbdhints">
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
					</span>
					<span className="kbve-search__touchhint">
						Tap a result to open
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
