/**
 * BentoTooltip — Single off-canvas tooltip element for bento card controls.
 *
 * Uses @kbve/droid's tooltip system (nanostore + DroidEvents).
 * One instance renders a portal; any bento control can trigger it
 * by calling `showBentoTooltip(anchorEl, message)`.
 */

import { useEffect, useState, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';

// ── Tooltip state (local to bento, lightweight) ──

interface BentoTooltipState {
	message: string;
	x: number;
	y: number;
	visible: boolean;
}

export const $bentoTooltip = atom<BentoTooltipState>({
	message: '',
	x: 0,
	y: 0,
	visible: false,
});

let hideTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Show a tooltip near a DOM element.
 * Auto-hides after `duration` ms (default 2000).
 */
export function showBentoTooltip(
	anchor: HTMLElement,
	message: string,
	duration = 2000,
) {
	if (hideTimer) clearTimeout(hideTimer);

	const rect = anchor.getBoundingClientRect();
	$bentoTooltip.set({
		message,
		x: rect.left + rect.width / 2,
		y: rect.top - 8, // above the element
		visible: true,
	});

	hideTimer = setTimeout(() => {
		$bentoTooltip.set({ ...$bentoTooltip.get(), visible: false });
	}, duration);
}

export function hideBentoTooltip() {
	if (hideTimer) clearTimeout(hideTimer);
	$bentoTooltip.set({ ...$bentoTooltip.get(), visible: false });
}

// ── React component ──

export default function BentoTooltip() {
	const state = useStore($bentoTooltip);
	const [mounted, setMounted] = useState(false);
	const tooltipRef = useRef<HTMLDivElement>(null);
	const [adjustedPos, setAdjustedPos] = useState({ x: 0, y: 0 });

	useEffect(() => {
		setMounted(true);
	}, []);

	// Adjust position to keep tooltip on screen
	useEffect(() => {
		if (!state.visible || !tooltipRef.current) {
			setAdjustedPos({ x: state.x, y: state.y });
			return;
		}

		const el = tooltipRef.current;
		const rect = el.getBoundingClientRect();
		let x = state.x;
		let y = state.y;

		// Clamp horizontally
		const halfW = rect.width / 2;
		if (x - halfW < 8) x = halfW + 8;
		if (x + halfW > window.innerWidth - 8)
			x = window.innerWidth - halfW - 8;

		// If tooltip would go above viewport, show below instead
		if (y - rect.height < 8) {
			y = state.y + 16 + rect.height; // flip below
		}

		setAdjustedPos({ x, y });
	}, [state.visible, state.x, state.y, state.message]);

	if (!mounted) return null;

	const style: CSSProperties = {
		position: 'fixed',
		zIndex: 9999,
		padding: '6px 10px',
		borderRadius: '6px',
		backgroundColor: 'rgba(0, 0, 0, 0.85)',
		backdropFilter: 'blur(8px)',
		color: '#e4e4e7',
		fontSize: '0.7rem',
		fontWeight: 500,
		lineHeight: 1.3,
		letterSpacing: '0.01em',
		boxShadow:
			'0 4px 12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.06)',
		transform: 'translateX(-50%) translateY(-100%)',
		pointerEvents: 'none',
		whiteSpace: 'nowrap',
		transition: 'opacity 0.15s ease, transform 0.15s ease',
		opacity: state.visible ? 1 : 0,
		top: adjustedPos.y,
		left: adjustedPos.x,
	};

	return createPortal(
		<div
			ref={tooltipRef}
			role="tooltip"
			aria-hidden={!state.visible}
			style={style}>
			{state.message}
		</div>,
		document.body,
	);
}
