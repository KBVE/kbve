import { useCallback, useEffect, useRef, useState } from 'react';
import { closeTooltip, openTooltip } from '@kbve/droid';
import { mcTextureUrls } from './texture';

type ManifestEntry = {
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

type ManifestPayload = { count: number; items: ManifestEntry[] };

type HoverData = {
	ref: string;
	tagRef: string;
	qty: number;
	entry: ManifestEntry | null;
};

const TOOLTIP_ID = 'mc-link-tooltip';
let manifestPromise: Promise<Map<string, ManifestEntry>> | null = null;

function loadManifest(): Promise<Map<string, ManifestEntry>> {
	if (manifestPromise) return manifestPromise;
	manifestPromise = fetch('/api/mc-items.json')
		.then((r) => {
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			return r.json() as Promise<ManifestPayload>;
		})
		.then((payload) => {
			const map = new Map<string, ManifestEntry>();
			for (const it of payload.items) map.set(it.ref, it);
			return map;
		})
		.catch(() => new Map());
	return manifestPromise;
}

export function MCLinkTooltip() {
	const [data, setData] = useState<HoverData | null>(null);
	const [pos, setPos] = useState({ x: 0, y: 0 });
	const [visible, setVisible] = useState(false);
	const hideTimeout = useRef<number | undefined>(undefined);

	const show = useCallback((el: HTMLElement, e: MouseEvent) => {
		window.clearTimeout(hideTimeout.current);
		const ref = el.dataset.mcRef || '';
		const tagRef = el.dataset.mcTagRef || '';
		const qtyRaw = el.dataset.mcQty;
		const qty = qtyRaw ? Math.max(1, parseInt(qtyRaw, 10) || 1) : 1;

		setData({ ref, tagRef, qty, entry: null });
		setPos({ x: e.clientX, y: e.clientY });
		setVisible(true);
		openTooltip(TOOLTIP_ID);

		if (ref) {
			void loadManifest().then((map) => {
				const entry = map.get(ref) ?? null;
				setData((prev) =>
					prev && prev.ref === ref ? { ...prev, entry } : prev,
				);
			});
		}
	}, []);

	const hide = useCallback(() => {
		hideTimeout.current = window.setTimeout(() => {
			setVisible(false);
			setData(null);
			closeTooltip(TOOLTIP_ID);
		}, 100);
	}, []);

	const move = useCallback((e: MouseEvent) => {
		setPos({ x: e.clientX, y: e.clientY });
	}, []);

	useEffect(() => {
		const root = document.querySelector('.mcdb-panel') ?? document.body;

		const onEnter = (e: Event) => {
			const t = (e.target as HTMLElement | null)?.closest?.(
				'[data-mc-tooltip]',
			);
			if (t) show(t as HTMLElement, e as MouseEvent);
		};
		const onLeave = (e: Event) => {
			const t = (e.target as HTMLElement | null)?.closest?.(
				'[data-mc-tooltip]',
			);
			if (t) hide();
		};
		const onMove = (e: Event) => {
			if (visible) move(e as MouseEvent);
		};

		root.addEventListener('mouseenter', onEnter, true);
		root.addEventListener('mouseleave', onLeave, true);
		root.addEventListener('mousemove', onMove, true);
		return () => {
			root.removeEventListener('mouseenter', onEnter, true);
			root.removeEventListener('mouseleave', onLeave, true);
			root.removeEventListener('mousemove', onMove, true);
			window.clearTimeout(hideTimeout.current);
		};
	}, [show, hide, move, visible]);

	if (!visible || !data) return null;

	const label =
		data.entry?.display_name ||
		data.ref ||
		(data.tagRef ? `#${data.tagRef}` : 'Unknown');
	const tex = data.ref
		? mcTextureUrls(data.ref, data.entry?.category ?? null)
		: null;
	const offsetX = 18;
	const offsetY = 18;

	return (
		<div
			role="tooltip"
			className="mc-link-tooltip"
			style={{
				left: `${pos.x + offsetX}px`,
				top: `${pos.y + offsetY}px`,
			}}>
			<header className="mc-link-tooltip__head">
				{tex && (
					<img
						className="mc-link-tooltip__icon"
						src={tex.primary}
						onError={(ev) => {
							const img = ev.currentTarget;
							if (img.dataset.fb === '1') return;
							img.dataset.fb = '1';
							img.src = tex.fallback;
						}}
						alt={label}
					/>
				)}
				<div>
					<div className="mc-link-tooltip__name">{label}</div>
					{data.qty > 1 && (
						<div className="mc-link-tooltip__qty">× {data.qty}</div>
					)}
				</div>
			</header>
			<dl className="mc-link-tooltip__rows">
				{data.entry?.category && (
					<div>
						<dt>Category</dt>
						<dd>{data.entry.category}</dd>
					</div>
				)}
				{data.entry?.tier && (
					<div>
						<dt>Tier</dt>
						<dd>{data.entry.tier}</dd>
					</div>
				)}
				{data.entry?.stack_size != null && (
					<div>
						<dt>Stack</dt>
						<dd>{data.entry.stack_size}</dd>
					</div>
				)}
				{data.entry?.rarity && data.entry.rarity !== 'common' && (
					<div>
						<dt>Rarity</dt>
						<dd>{data.entry.rarity}</dd>
					</div>
				)}
				{!data.entry && data.ref && (
					<div>
						<dt>Ref</dt>
						<dd>{data.ref}</dd>
					</div>
				)}
				{!data.entry && data.tagRef && (
					<div>
						<dt>Tag</dt>
						<dd>#{data.tagRef}</dd>
					</div>
				)}
			</dl>
		</div>
	);
}

export default MCLinkTooltip;
