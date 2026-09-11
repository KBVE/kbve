import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

function detectTauri(): boolean {
	return !!(
		(window as typeof window & { __TAURI_INTERNALS__?: unknown })
			.__TAURI_INTERNALS__ ||
		(window as typeof window & { __TAURI__?: unknown }).__TAURI__
	);
}

export function FPSCounter() {
	const [fps, setFps] = useState<number | null>(null);
	const [err, setErr] = useState<string | null>(null);

	useEffect(() => {
		const isTauri = detectTauri();
		let cancelled = false;

		const tick = async () => {
			if (cancelled) return;
			try {
				if (isTauri) {
					const v = await invoke<number>('get_fps');
					if (!cancelled) {
						setFps(v);
						setErr(null);
					}
				} else {
					const mod =
						await import('../../wasm-pkg/isometric_game.js');
					const fn = (mod as unknown as { get_fps?: () => number })
						.get_fps;
					if (typeof fn === 'function' && !cancelled) {
						setFps(fn());
						setErr(null);
					}
				}
			} catch (e) {
				if (!cancelled) {
					setErr(String(e));
					console.warn('[fps] tick failed', e);
				}
			}
		};

		void tick();
		const interval = setInterval(() => void tick(), 1000);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, []);

	return (
		<div
			style={{
				position: 'fixed',
				top: 40,
				left: 8,
				zIndex: 9998,
				padding: '4px 8px',
				background: 'rgba(0, 0, 0, 0.75)',
				border: '1px solid #4ade80',
				borderRadius: 4,
				color: '#4ade80',
				fontSize: 12,
				fontFamily: 'monospace',
				pointerEvents: 'auto',
			}}>
			{err ? `FPS ERR: ${err.slice(0, 40)}` : `${fps ?? '—'} FPS`}
		</div>
	);
}
