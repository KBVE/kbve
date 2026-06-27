import { useEffect, useRef, type RefObject } from 'react';

/** Normalized cursor position, -1..1 from screen center (x right, y down). */
export interface Pointer {
	nx: number;
	ny: number;
	/** true once the mouse has moved — lets a scene fall back to keys until then. */
	active: boolean;
}

/**
 * Window cursor → normalized [-1,1] for the 3D space controls. Read from the R3F
 * frame loop via the returned ref (no re-renders). Recentres on blur so a lost
 * focus doesn't leave the ship banked.
 */
export function usePointer(): RefObject<Pointer> {
	const p = useRef<Pointer>({ nx: 0, ny: 0, active: false });
	useEffect(() => {
		const move = (e: MouseEvent) => {
			p.current.nx = (e.clientX / window.innerWidth) * 2 - 1;
			p.current.ny = (e.clientY / window.innerHeight) * 2 - 1;
			p.current.active = true;
		};
		const reset = () => {
			p.current.nx = 0;
			p.current.ny = 0;
		};
		window.addEventListener('mousemove', move);
		window.addEventListener('blur', reset);
		return () => {
			window.removeEventListener('mousemove', move);
			window.removeEventListener('blur', reset);
		};
	}, []);
	return p;
}
