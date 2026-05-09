import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { openTooltip, closeTooltip, useTooltip } from '@kbve/astro';

type Status = 'live' | 'beta' | 'soon';

interface TipData {
	id: string;
	title: string;
	status: Status;
	description: string;
	tags: string[];
	cta: string;
	anchor: HTMLElement;
}

interface Position {
	top: number;
	left: number;
	placement: 'top' | 'bottom';
}

const TOOLTIP_HALF_WIDTH = 144;
const TOOLTIP_MIN_GAP = 12;
const STATUS_LABEL: Record<Status, string> = {
	live: 'PLAYABLE',
	beta: 'IN BETA',
	soon: 'COMING SOON',
};
const STATUS_CLASS: Record<Status, string> = {
	live: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
	beta: 'border-amber-400/40 bg-amber-400/15 text-amber-200',
	soon: 'border-slate-400/40 bg-slate-400/15 text-slate-300',
};

export default function ArcadeTooltipController() {
	const [tip, setTip] = useState<TipData | null>(null);
	const [pos, setPos] = useState<Position | null>(null);
	const { isOpen } = useTooltip();

	useEffect(() => {
		const cards =
			document.querySelectorAll<HTMLElement>('[data-arcade-card]');
		const cleanups: Array<() => void> = [];

		cards.forEach((card) => {
			const id = card.id;
			if (!id) return;

			const onEnter = () => {
				const status = (card.dataset.arcadeTooltipStatus ??
					'live') as Status;
				const data: TipData = {
					id,
					title: card.dataset.arcadeTooltipTitle ?? '',
					status,
					description: card.dataset.arcadeTooltipDesc ?? '',
					tags: (card.dataset.arcadeTooltipTags ?? '')
						.split('|')
						.filter(Boolean),
					cta: card.dataset.arcadeTooltipCta ?? '',
					anchor: card,
				};
				setTip(data);
				openTooltip(id);
				if (window.eventEngine) {
					window.eventEngine.emit('ui:tooltip:show', 'arcade', {
						id,
						title: data.title,
						status: data.status,
					});
				}
			};
			const onLeave = () => closeTooltip(id);

			card.addEventListener('mouseenter', onEnter);
			card.addEventListener('mouseleave', onLeave);
			card.addEventListener('focusin', onEnter);
			card.addEventListener('focusout', onLeave);
			cleanups.push(() => {
				card.removeEventListener('mouseenter', onEnter);
				card.removeEventListener('mouseleave', onLeave);
				card.removeEventListener('focusin', onEnter);
				card.removeEventListener('focusout', onLeave);
			});
		});
		return () => cleanups.forEach((fn) => fn());
	}, []);

	const open = tip !== null && isOpen(tip.id);

	useEffect(() => {
		if (!open || !tip) {
			setPos(null);
			return;
		}
		const compute = () => {
			const rect = tip.anchor.getBoundingClientRect();
			const placement: 'top' | 'bottom' =
				window.innerHeight - rect.bottom >= 220 ||
				window.innerHeight - rect.bottom >= rect.top
					? 'bottom'
					: 'top';
			let left = rect.left + rect.width / 2 + window.scrollX;
			left = Math.max(
				TOOLTIP_HALF_WIDTH + TOOLTIP_MIN_GAP,
				Math.min(
					left,
					window.innerWidth -
						TOOLTIP_HALF_WIDTH -
						TOOLTIP_MIN_GAP +
						window.scrollX,
				),
			);
			const top =
				placement === 'bottom'
					? rect.bottom + 12 + window.scrollY
					: rect.top - 12 + window.scrollY;
			setPos({ top, left, placement });
		};
		compute();
		window.addEventListener('scroll', compute, { passive: true });
		window.addEventListener('resize', compute);
		return () => {
			window.removeEventListener('scroll', compute);
			window.removeEventListener('resize', compute);
		};
	}, [open, tip]);

	if (typeof document === 'undefined') return null;

	const visible = open && pos && tip;
	const arrowOnTop = pos?.placement === 'bottom';

	return createPortal(
		<div
			role="tooltip"
			aria-hidden={!visible}
			style={{
				position: 'absolute',
				top: visible ? pos.top : -9999,
				left: visible ? pos.left : -9999,
				transform: visible
					? pos.placement === 'top'
						? 'translate(-50%, -100%)'
						: 'translate(-50%, 0)'
					: 'translate(-50%, 0)',
				zIndex: 9997,
				pointerEvents: 'none',
				opacity: visible ? 1 : 0,
				transition: 'opacity 150ms ease',
				width: 288,
			}}>
			{tip && (
				<div className="relative isolate overflow-hidden rounded-xl border border-purple-500/40 bg-slate-950/95 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7),0_0_22px_-4px_rgba(168,85,247,0.45)] backdrop-blur-md">
					{/* Layered arcade backdrop */}
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_15%,rgba(236,72,153,0.22)_0%,transparent_55%),radial-gradient(circle_at_82%_85%,rgba(56,189,248,0.18)_0%,transparent_55%)]"
					/>
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 -z-10 opacity-50 mix-blend-overlay bg-[repeating-linear-gradient(to_bottom,rgba(0,0,0,0.18)_0,rgba(0,0,0,0.18)_1px,transparent_1px,transparent_3px)]"
					/>

					{/* Caret */}
					<div
						aria-hidden="true"
						className={`absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border border-purple-500/40 bg-slate-950 ${
							arrowOnTop
								? '-top-1.5 border-r-0 border-b-0'
								: '-bottom-1.5 border-l-0 border-t-0'
						}`}
					/>

					<div className="flex items-center justify-between gap-2 border-b border-purple-500/20 px-4 pb-2 pt-3">
						<span className="truncate text-sm font-bold -tracking-[0.01em] text-white">
							{tip.title}
						</span>
						<span
							className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] ${STATUS_CLASS[tip.status]}`}>
							{STATUS_LABEL[tip.status]}
						</span>
					</div>

					{tip.description && (
						<p className="m-0 px-4 pb-2.5 pt-2.5 text-xs leading-relaxed text-slate-300">
							{tip.description}
						</p>
					)}

					{tip.tags.length > 0 && (
						<ul className="m-0 flex list-none flex-wrap gap-1.5 px-4 pb-2.5">
							{tip.tags.map((t) => (
								<li
									key={t}
									className="rounded border border-purple-500/30 bg-purple-500/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-purple-300">
									{t}
								</li>
							))}
						</ul>
					)}

					{tip.cta && (
						<div className="flex items-center justify-between border-t border-purple-500/20 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fuchsia-300">
							<span>{tip.cta}</span>
							{tip.status !== 'soon' && (
								<span aria-hidden="true">→</span>
							)}
						</div>
					)}
				</div>
			)}
		</div>,
		document.body,
	);
}
