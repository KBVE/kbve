import { useEffect, useState } from 'react';
import { get_fps } from '../../wasm-pkg/isometric_game.js';

export function FPSCounter() {
	const [fps, setFps] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			try {
				setFps(get_fps());
			} catch {
				// WASM not ready yet
			}
		}, 1000);
		return () => clearInterval(interval);
	}, []);

	return (
		<div className="absolute top-2 right-2 md:top-3 md:right-3 px-2 py-1 md:px-3 md:py-1.5 bg-panel border border-panel-border text-[7px] md:text-[10px] text-text-muted pointer-events-auto">
			{fps} FPS
		</div>
	);
}
