/**
 * OSRSLinkTooltip — Global tooltip for OSRS item links
 *
 * Attaches to all <a> tags with data-osrs-tooltip attribute inside the
 * OSRS panel. Shows item preview (name, icon, stats) on hover.
 * Uses @kbve/droid global tooltip state for coordination.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { openTooltip, closeTooltip } from '@kbve/droid';

interface TooltipData {
	name: string;
	icon: string;
	slug: string;
	members?: boolean;
	highalch?: number | null;
	value?: number;
	relationship?: string;
}

const RELATIONSHIP_LABELS: Record<string, { label: string; color: string }> = {
	upgrade: { label: 'Upgrade', color: '#22c55e' },
	downgrade: { label: 'Downgrade', color: '#ef4444' },
	product: { label: 'Product', color: '#3b82f6' },
	component: { label: 'Component', color: '#f97316' },
	variant: { label: 'Variant', color: '#a855f7' },
	'set-piece': { label: 'Set Piece', color: '#eab308' },
	alternative: { label: 'Alternative', color: '#64748b' },
};

const TOOLTIP_ID = 'osrs-item-preview';

export default function OSRSLinkTooltip() {
	const tooltipRef = useRef<HTMLDivElement>(null);
	const [data, setData] = useState<TooltipData | null>(null);
	const [visible, setVisible] = useState(false);
	const [pos, setPos] = useState({ x: 0, y: 0 });
	const hideTimeout = useRef<number>(0);

	const show = useCallback((el: HTMLElement, e: MouseEvent) => {
		window.clearTimeout(hideTimeout.current);

		const name = el.dataset.osrsName || el.textContent || '';
		const icon = el.dataset.osrsIcon || '';
		const slug = el.dataset.osrsSlug || '';
		const members = el.dataset.osrsMembers === 'true';
		const highalch = el.dataset.osrsHighalch
			? parseInt(el.dataset.osrsHighalch, 10)
			: null;
		const value = el.dataset.osrsValue
			? parseInt(el.dataset.osrsValue, 10)
			: undefined;
		const relationship = el.dataset.osrsRelationship || undefined;

		setData({ name, icon, slug, members, highalch, value, relationship });
		setPos({ x: e.clientX, y: e.clientY });
		setVisible(true);
		openTooltip(TOOLTIP_ID);
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
		const panel = document.querySelector('.osrs-panel');
		if (!panel) return;

		const handleEnter = (e: Event) => {
			const target = (e.target as HTMLElement).closest?.(
				'[data-osrs-tooltip]',
			) as HTMLElement | null;
			if (target) show(target, e as MouseEvent);
		};

		const handleLeave = (e: Event) => {
			const target = (e.target as HTMLElement).closest?.(
				'[data-osrs-tooltip]',
			);
			if (target) hide();
		};

		const handleMove = (e: Event) => {
			if (visible) move(e as MouseEvent);
		};

		panel.addEventListener('mouseenter', handleEnter, true);
		panel.addEventListener('mouseleave', handleLeave, true);
		panel.addEventListener('mousemove', handleMove, true);

		return () => {
			panel.removeEventListener('mouseenter', handleEnter, true);
			panel.removeEventListener('mouseleave', handleLeave, true);
			panel.removeEventListener('mousemove', handleMove, true);
			window.clearTimeout(hideTimeout.current);
		};
	}, [show, hide, move, visible]);

	if (!visible || !data) return null;

	const relInfo = data.relationship
		? RELATIONSHIP_LABELS[data.relationship]
		: null;
	const iconUrl = data.icon
		? `https://oldschool.runescape.wiki/images/${data.icon.replace(/ /g, '_')}`
		: null;

	return (
		<div
			ref={tooltipRef}
			role="tooltip"
			style={{
				position: 'fixed',
				left: `${pos.x + 12}px`,
				top: `${pos.y - 8}px`,
				zIndex: 9999,
				pointerEvents: 'none',
				background: 'var(--sl-color-bg-nav, #111)',
				border: '1px solid var(--sl-color-gray-4, #333)',
				borderRadius: '0.5rem',
				padding: '0.5rem 0.75rem',
				boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
				maxWidth: '220px',
				fontSize: '0.75rem',
				color: 'var(--sl-color-white, #fff)',
				display: 'flex',
				alignItems: 'center',
				gap: '0.5rem',
			}}>
			{iconUrl && (
				<img
					src={iconUrl}
					alt=""
					width={32}
					height={32}
					style={{
						imageRendering: 'pixelated',
						flexShrink: 0,
					}}
				/>
			)}
			<div>
				<div
					style={{
						fontWeight: 600,
						fontSize: '0.8125rem',
						lineHeight: 1.2,
					}}>
					{data.name}
				</div>
				{relInfo && (
					<span
						style={{
							fontSize: '0.5625rem',
							fontWeight: 500,
							padding: '0.0625rem 0.25rem',
							borderRadius: '0.125rem',
							background: `${relInfo.color}33`,
							color: relInfo.color,
							display: 'inline-block',
							marginTop: '0.125rem',
						}}>
						{relInfo.label}
					</span>
				)}
				{data.highalch != null && (
					<div
						style={{
							fontSize: '0.625rem',
							color: 'var(--sl-color-gray-3, #999)',
							marginTop: '0.125rem',
						}}>
						HA: {data.highalch.toLocaleString()} gp
					</div>
				)}
			</div>
		</div>
	);
}
