import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function FPSCounter() {
	const [fps, setFps] = useState(0);

	useEffect(() => {
		const interval = setInterval(async () => {
			try {
				const value = await invoke<number>('get_fps');
				setFps(value);
			} catch {
				// IPC not ready yet
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
