import { useCallback, useRef, useState } from 'react';

export interface Size {
	width: number;
	height: number;
}

export interface UseResizableOptions {
	initial: Size;
	minWidth?: number;
	minHeight?: number;
	maxWidth?: number;
	maxHeight?: number;
	disabled?: boolean;
	onChange?: (s: Size) => void;
	onStart?: () => void;
}

export interface UseResizableResult {
	size: Size;
	setSize: (s: Size) => void;
	resizing: boolean;
	/** Spread onto a corner resize grip. */
	handleProps: {
		onPointerDown: (e: React.PointerEvent) => void;
		style: { cursor: string; touchAction: string };
	};
}

/**
 * Pointer-driven resize from a single (bottom-right) grip, clamped to
 * min/max bounds. Pairs with useDraggable for floating windows.
 */
export function useResizable(options: UseResizableOptions): UseResizableResult {
	const {
		initial,
		minWidth = 160,
		minHeight = 80,
		maxWidth = Infinity,
		maxHeight = Infinity,
		disabled,
		onChange,
		onStart,
	} = options;
	const [size, setSizeState] = useState<Size>(initial);
	const [resizing, setResizing] = useState(false);
	const origin = useRef<{ px: number; py: number; w: number; h: number }>({
		px: 0,
		py: 0,
		w: 0,
		h: 0,
	});

	const clampSize = useCallback(
		(s: Size): Size => ({
			width: Math.min(maxWidth, Math.max(minWidth, s.width)),
			height: Math.min(maxHeight, Math.max(minHeight, s.height)),
		}),
		[minWidth, minHeight, maxWidth, maxHeight],
	);

	const setSize = useCallback(
		(s: Size) => {
			const next = clampSize(s);
			setSizeState(next);
			onChange?.(next);
		},
		[clampSize, onChange],
	);

	const onPointerDown = useCallback(
		(e: React.PointerEvent) => {
			if (disabled || e.button !== 0) return;
			e.stopPropagation();
			onStart?.();
			origin.current = {
				px: e.clientX,
				py: e.clientY,
				w: size.width,
				h: size.height,
			};
			setResizing(true);
			const target = e.currentTarget as HTMLElement;
			target.setPointerCapture(e.pointerId);

			const move = (ev: PointerEvent) => {
				setSize({
					width: origin.current.w + (ev.clientX - origin.current.px),
					height: origin.current.h + (ev.clientY - origin.current.py),
				});
			};
			const up = (ev: PointerEvent) => {
				setResizing(false);
				target.releasePointerCapture?.(ev.pointerId);
				window.removeEventListener('pointermove', move);
				window.removeEventListener('pointerup', up);
			};
			window.addEventListener('pointermove', move);
			window.addEventListener('pointerup', up);
		},
		[disabled, size.width, size.height, setSize, onStart],
	);

	return {
		size,
		setSize,
		resizing,
		handleProps: {
			onPointerDown,
			style: {
				cursor: disabled ? 'default' : 'nwse-resize',
				touchAction: 'none',
			},
		},
	};
}
