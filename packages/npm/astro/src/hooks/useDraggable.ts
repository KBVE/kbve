import { useCallback, useRef, useState } from 'react';

export interface Position {
	x: number;
	y: number;
}

export interface UseDraggableOptions {
	initial?: Position;
	disabled?: boolean;
	onChange?: (p: Position) => void;
	/** Clamp the next position (e.g. keep the element inside the viewport). */
	clamp?: (p: Position) => Position;
	/** Fired once when a drag gesture starts (used to bring windows forward). */
	onStart?: () => void;
}

export interface UseDraggableResult {
	position: Position;
	setPosition: (p: Position) => void;
	dragging: boolean;
	/** Spread onto the drag handle (e.g. a window title bar). */
	handleProps: {
		onPointerDown: (e: React.PointerEvent) => void;
		style: { cursor: string; touchAction: string };
	};
}

/**
 * Pointer-driven dragging with viewport clamping. Transport-agnostic: it only
 * tracks a position and emits changes; the caller decides how to render it.
 */
export function useDraggable(
	options: UseDraggableOptions = {},
): UseDraggableResult {
	const {
		initial = { x: 0, y: 0 },
		disabled,
		onChange,
		clamp,
		onStart,
	} = options;
	const [position, setPositionState] = useState<Position>(initial);
	const [dragging, setDragging] = useState(false);
	const origin = useRef<{ px: number; py: number; x: number; y: number }>({
		px: 0,
		py: 0,
		x: 0,
		y: 0,
	});

	const setPosition = useCallback(
		(p: Position) => {
			const next = clamp ? clamp(p) : p;
			setPositionState(next);
			onChange?.(next);
		},
		[clamp, onChange],
	);

	const onPointerDown = useCallback(
		(e: React.PointerEvent) => {
			if (disabled || e.button !== 0) return;
			onStart?.();
			origin.current = {
				px: e.clientX,
				py: e.clientY,
				x: position.x,
				y: position.y,
			};
			setDragging(true);
			const target = e.currentTarget as HTMLElement;
			target.setPointerCapture(e.pointerId);

			const move = (ev: PointerEvent) => {
				const dx = ev.clientX - origin.current.px;
				const dy = ev.clientY - origin.current.py;
				setPosition({
					x: origin.current.x + dx,
					y: origin.current.y + dy,
				});
			};
			const up = (ev: PointerEvent) => {
				setDragging(false);
				target.releasePointerCapture?.(ev.pointerId);
				window.removeEventListener('pointermove', move);
				window.removeEventListener('pointerup', up);
			};
			window.addEventListener('pointermove', move);
			window.addEventListener('pointerup', up);
		},
		[disabled, position.x, position.y, setPosition, onStart],
	);

	return {
		position,
		setPosition,
		dragging,
		handleProps: {
			onPointerDown,
			style: {
				cursor: disabled ? 'default' : 'move',
				touchAction: 'none',
			},
		},
	};
}
