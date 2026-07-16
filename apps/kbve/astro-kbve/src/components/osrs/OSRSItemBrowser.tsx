import { useEffect, useMemo, useRef, useState } from 'react';
import { List, type RowComponentProps } from 'react-window';

interface OSRSIndexEntry {
	id: number;
	name: string;
	slug: string;
	icon: string;
	value: number;
	highalch: number | null;
	limit: number | null;
	members: boolean;
	slot?: string;
	weapon?: string;
	tags: string[];
}

interface ItemsPayload {
	count: number;
	items: OSRSIndexEntry[];
}

const TAG_OPTIONS: { value: string; label: string }[] = [
	{ value: '', label: 'All' },
	{ value: 'equipment', label: 'Equipment' },
	{ value: 'food', label: 'Food' },
	{ value: 'potion', label: 'Potions' },
	{ value: 'quest', label: 'Quest' },
	{ value: 'drop', label: 'Drops' },
	{ value: 'farm', label: 'Farming' },
	{ value: 'gather', label: 'Gathering' },
	{ value: 'teleport', label: 'Teleport' },
	{ value: 'ammo', label: 'Ammunition' },
	{ value: 'prayer', label: 'Prayer' },
];

const ROW_HEIGHT = 56;
const ICON_BASE = 'https://oldschool.runescape.wiki/images/';

function iconUrl(icon: string): string {
	return ICON_BASE + encodeURIComponent(icon.replace(/ /g, '_'));
}

function formatGP(v: number | null | undefined): string {
	if (v === null || v === undefined || v === 0) return '—';
	return v.toLocaleString();
}

// Seed the initial filters from the URL so rail links like /osrs/?tag=potion
// land pre-filtered. Only whitelisted tags apply; unknown values fall back to
// the unfiltered default.
function initialParams(): {
	q: string;
	tag: string;
	members: 'all' | 'p2p' | 'f2p';
} {
	const fallback = { q: '', tag: '', members: 'all' as const };
	if (typeof window === 'undefined') return fallback;
	const p = new URLSearchParams(window.location.search);
	const tagRaw = p.get('tag') ?? '';
	const tag = TAG_OPTIONS.some((o) => o.value === tagRaw && o.value)
		? tagRaw
		: '';
	const m = p.get('members');
	const members = m === 'p2p' || m === 'f2p' ? m : 'all';
	return { q: p.get('q') ?? '', tag, members };
}

type RowExtra = { items: OSRSIndexEntry[] };

function Row({ index, style, items }: RowComponentProps<RowExtra>) {
	const item = items[index];
	const rowStyle: React.CSSProperties = {
		...style,
		// iOS Safari swallows taps on <a> elements that live inside a
		// momentum-scrolling virtualized container (react-window 2) unless
		// touchAction is set to `manipulation`; otherwise the browser
		// queues the tap as a possible scroll-start and never fires the
		// click. cursor + tap-highlight keep the affordance honest.
		touchAction: 'manipulation',
		WebkitTapHighlightColor: 'rgba(56, 189, 248, 0.18)',
		cursor: 'pointer',
	};
	return (
		<a
			href={`/osrs/${item.slug}/`}
			data-osrs-row
			data-osrs-slug={item.slug}
			style={rowStyle}
			className="flex items-center gap-3 border-b border-white/5 px-3 hover:bg-white/5 active:bg-white/10 transition-colors">
			<img
				src={iconUrl(item.icon)}
				alt=""
				loading="lazy"
				width={32}
				height={32}
				className="h-8 w-8 flex-shrink-0 object-contain pointer-events-none"
				onError={(e) => {
					(e.currentTarget as HTMLImageElement).style.visibility =
						'hidden';
				}}
			/>
			<div className="min-w-0 flex-1 pointer-events-none">
				<div className="flex items-center gap-2">
					<span className="truncate font-medium text-sm">
						{item.name}
					</span>
					{item.members && (
						<span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
							P2P
						</span>
					)}
					{item.slot && (
						<span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
							{item.slot}
						</span>
					)}
				</div>
				<div className="flex gap-3 text-[11px] text-white/60">
					<span>id {item.id}</span>
					<span>value {formatGP(item.value)}</span>
					{item.highalch !== null && (
						<span>alch {formatGP(item.highalch)}</span>
					)}
					{item.limit !== null && (
						<span>ge {formatGP(item.limit)}</span>
					)}
				</div>
			</div>
		</a>
	);
}

const LIST_HEIGHT = 600;

export default function OSRSItemBrowser() {
	const [data, setData] = useState<OSRSIndexEntry[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [query, setQuery] = useState(() => initialParams().q);
	const [tag, setTag] = useState(() => initialParams().tag);
	const [membersOnly, setMembersOnly] = useState<'all' | 'p2p' | 'f2p'>(
		() => initialParams().members,
	);
	const [width, setWidth] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			for (const e of entries) setWidth(e.contentRect.width);
		});
		ro.observe(el);
		setWidth(el.clientWidth);
		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		let cancelled = false;
		fetch('/api/osrs.json')
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then((payload: ItemsPayload) => {
				if (!cancelled) setData(payload.items);
			})
			.catch((e: Error) => {
				if (!cancelled) setError(e.message);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const filtered = useMemo(() => {
		if (!data) return [];
		const q = query.trim().toLowerCase();
		const qNum = Number(q);
		const isNum = q !== '' && !Number.isNaN(qNum);
		return data.filter((it) => {
			if (membersOnly === 'p2p' && !it.members) return false;
			if (membersOnly === 'f2p' && it.members) return false;
			if (tag && !it.tags.includes(tag)) return false;
			if (q) {
				if (isNum && it.id === qNum) return true;
				if (it.name.toLowerCase().includes(q)) return true;
				if (it.slug.includes(q)) return true;
				return false;
			}
			return true;
		});
	}, [data, query, tag, membersOnly]);

	return (
		<div className="not-content my-6 rounded-lg border border-white/10 bg-black/20 p-4">
			<div className="mb-3 flex flex-wrap gap-2">
				<input
					type="search"
					placeholder="Search by name or item id…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-sky-400"
				/>
				<select
					value={tag}
					onChange={(e) => setTag(e.target.value)}
					className="rounded border border-white/10 bg-black/40 px-2 py-2 text-sm">
					{TAG_OPTIONS.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
				<select
					value={membersOnly}
					onChange={(e) =>
						setMembersOnly(e.target.value as 'all' | 'p2p' | 'f2p')
					}
					className="rounded border border-white/10 bg-black/40 px-2 py-2 text-sm">
					<option value="all">All worlds</option>
					<option value="p2p">Members</option>
					<option value="f2p">Free</option>
				</select>
			</div>

			<div className="mb-2 text-xs text-white/60">
				{error && (
					<span className="text-red-400">
						Error loading items: {error}
					</span>
				)}
				{!error && !data && <span>Loading items…</span>}
				{!error && data && (
					<span>
						{filtered.length.toLocaleString()} of{' '}
						{data.length.toLocaleString()} items
					</span>
				)}
			</div>

			<div
				ref={containerRef}
				style={{ height: LIST_HEIGHT }}
				className="rounded border border-white/10 bg-black/30">
				{data && filtered.length > 0 && width > 0 ? (
					<List
						defaultHeight={LIST_HEIGHT}
						rowCount={filtered.length}
						rowHeight={ROW_HEIGHT}
						rowComponent={Row}
						rowProps={{ items: filtered }}
						overscanCount={6}
						style={{ width, height: LIST_HEIGHT }}
					/>
				) : (
					<div className="flex h-full items-center justify-center text-sm text-white/50">
						{data ? 'No items match the current filters.' : ''}
					</div>
				)}
			</div>
		</div>
	);
}
