import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
	type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../utils/cn';

export type PopoverPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface PopoverProps {
	open: boolean;
	onClose?: () => void;
	/** Element the popover anchors to. */
	anchorRef: RefObject<HTMLElement | null>;
	placement?: PopoverPlacement;
	offset?: number;
	children?: ReactNode;
	className?: string;
}

/**
 * Interactive anchored popover: positions next to an element, clamps to the
 * viewport, and dismisses on outside-click or Escape. Starlight-safe
 * (`.not-content`), portal rendered. Unlike TooltipOverlay this is for
 * click-driven content (menus, pickers), not hover hints.
 */
export function Popover({
	open,
	onClose,
	anchorRef,
	placement = 'bottom',
	offset = 8,
	children,
	className,
}: PopoverProps) {
	const panelRef = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

	useLayoutEffect(() => {
		if (!open) {
			setPos(null);
			return;
		}
		const compute = () => {
			const a = anchorRef.current?.getBoundingClientRect();
			if (!a) return;
			const p = panelRef.current?.getBoundingClientRect();
			const pw = p?.width ?? 0;
			const ph = p?.height ?? 0;
			let top = 0;
			let left = 0;
			switch (placement) {
				case 'bottom':
					top = a.bottom + offset;
					left = a.left + a.width / 2 - pw / 2;
					break;
				case 'top':
					top = a.top - ph - offset;
					left = a.left + a.width / 2 - pw / 2;
					break;
				case 'right':
					left = a.right + offset;
					top = a.top + a.height / 2 - ph / 2;
					break;
				case 'left':
					left = a.left - pw - offset;
					top = a.top + a.height / 2 - ph / 2;
					break;
			}
			left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
			top = Math.max(8, Math.min(top, window.innerHeight - ph - 8));
			setPos({ top, left });
		};
		compute();
		window.addEventListener('resize', compute);
		window.addEventListener('scroll', compute, true);
		return () => {
			window.removeEventListener('resize', compute);
			window.removeEventListener('scroll', compute, true);
		};
	}, [open, placement, offset, anchorRef]);

	useEffect(() => {
		if (!open) return;
		const onDoc = (e: MouseEvent) => {
			const t = e.target as Node;
			if (panelRef.current?.contains(t)) return;
			if (anchorRef.current?.contains(t)) return;
			onClose?.();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose?.();
		};
		document.addEventListener('mousedown', onDoc);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDoc);
			document.removeEventListener('keydown', onKey);
		};
	}, [open, onClose, anchorRef]);

	if (!open) return null;

	const style: CSSProperties = {
		position: 'fixed',
		top: pos?.top ?? 0,
		left: pos?.left ?? 0,
		zIndex: 1100,
		visibility: pos ? 'visible' : 'hidden',
		minWidth: 120,
		borderRadius: 8,
		border: '1px solid rgba(255,255,255,0.1)',
		background: 'var(--sl-color-bg-nav, #18181b)',
		color: 'var(--sl-color-text, #f4f4f5)',
		boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
	};

	return createPortal(
		<div
			ref={panelRef}
			className={cn('not-content', className)}
			style={style}
			role="dialog">
			{children}
		</div>,
		document.body,
	);
}
