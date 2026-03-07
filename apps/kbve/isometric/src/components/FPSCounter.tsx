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
		<div
			style={{
				position: 'absolute',
				top: 8,
				right: 8,
				padding: '4px 10px',
				background: 'rgba(0,0,0,0.5)',
				borderRadius: 4,
				fontSize: 13,
				pointerEvents: 'auto',
			}}>
			{fps} FPS
		</div>
	);
}
