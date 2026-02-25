import { useRef, useEffect } from 'react';
import type { OverlayManager } from '@kbve/droid';

export interface CanvasOverlayProps {
	overlayManager: OverlayManager;
	dbGet: (key: string) => Promise<string | null>;
	zIndex?: number;
}

export function CanvasOverlay({
	overlayManager,
	dbGet,
	zIndex = 9999,
}: CanvasOverlayProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		// Size to viewport
		const resize = () => {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
		};
		resize();
		window.addEventListener('resize', resize);

		// Transfer to worker
		void overlayManager.bindCanvas(canvas, dbGet);

		return () => {
			window.removeEventListener('resize', resize);
			void overlayManager.destroy();
		};
	}, [overlayManager, dbGet]);

	return (
		<canvas
			ref={canvasRef}
			style={{
				position: 'fixed',
				top: 0,
				left: 0,
				width: '100vw',
				height: '100vh',
				pointerEvents: 'none',
				zIndex,
			}}
			aria-hidden="true"
		/>
	);
}
