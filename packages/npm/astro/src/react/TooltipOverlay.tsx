import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTooltip } from '../hooks/useTooltip';
import { cn } from '../utils/cn';

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

	if (!open) return null;

	return createPortal(
		<div
			role="tooltip"
			className={cn(
				'absolute z-[9997] px-3 py-2 rounded-lg bg-zinc-800 text-zinc-200 text-sm shadow-lg',
				'transform -translate-x-1/2',
				className,
			)}
			style={pos ? { top: pos.top, left: pos.left } : undefined}>
			{children ?? content ?? null}
		</div>,
		document.body,
	);
}
