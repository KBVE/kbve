import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTooltip } from '../hooks/useTooltip';

export interface TooltipOverlayProps {
	id: string;
	content?: string;
	anchorId?: string;
	className?: string;
	children?: React.ReactNode;
}

export function TooltipOverlay({
	id,
	content,
	anchorId,
	className,
	children,
}: TooltipOverlayProps) {
	const { isOpen } = useTooltip();
	const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
	const open = isOpen(id);

	useEffect(() => {
		if (!open || !anchorId) {
			setPos(null);
			return;
		}
		const anchor = document.getElementById(anchorId);
		if (!anchor) {
			setPos(null);
			return;
		}
		const rect = anchor.getBoundingClientRect();
		setPos({
			top: rect.bottom + 8 + window.scrollY,
			left: rect.left + rect.width / 2 + window.scrollX,
		});
	}, [open, anchorId]);

	const visible = open && pos;

	const tooltipStyle: CSSProperties = {
		position: 'absolute',
		zIndex: 9997,
		paddingInline: 12,
		paddingBlock: 8,
		borderRadius: 8,
		backgroundColor: 'var(--sl-color-gray-5, #27272a)',
		color: 'var(--sl-color-text, #e4e4e7)',
		fontSize: 'var(--sl-text-sm, 0.875rem)',
		boxShadow: 'var(--sl-shadow-md, 0 4px 6px -1px rgba(0,0,0,0.3))',
		transform: 'translateX(-50%)',
		transition: 'opacity 150ms ease',
		...(visible
			? {
					opacity: 1,
					visibility: 'visible' as const,
					top: pos.top,
					left: pos.left,
				}
			: {
					opacity: 0,
					visibility: 'hidden' as const,
					pointerEvents: 'none' as const,
					top: -9999,
					left: -9999,
				}),
	};

	return createPortal(
		<div
			role="tooltip"
			aria-hidden={!open}
			className={className}
			style={tooltipStyle}>
			{children ?? content ?? null}
		</div>,
		document.body,
	);
}
