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
		<div className="absolute top-2 right-2 px-2.5 py-1 bg-glass rounded-slot text-[13px] pointer-events-auto">
			{fps} FPS
		</div>
	);
}
