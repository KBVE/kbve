import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface UiChromeState {
	phase: number;
	settings_open: boolean;
}

function detectTauri(): boolean {
	return !!(
		(window as typeof window & { __TAURI_INTERNALS__?: unknown })
			.__TAURI_INTERNALS__ ||
		(window as typeof window & { __TAURI__?: unknown }).__TAURI__
	);
}

async function fetchChrome(): Promise<UiChromeState | null> {
	if (detectTauri()) {
		try {
			return await invoke<UiChromeState>('get_ui_chrome');
		} catch {
			return null;
		}
	}
	try {
		const mod =
			(await import('../../wasm-pkg/isometric_game.js')) as Record<
				string,
				unknown
			>;
		const fn = mod.get_ui_chrome_json as (() => string) | undefined;
		if (typeof fn !== 'function') return null;
		const json = fn();
		return json ? (JSON.parse(json) as UiChromeState) : null;
	} catch {
		return null;
	}
}

/**
 * Window drag handle shown only at Title (phase=0) or while the in-game
 * Settings modal is open. The rest of the time the chrome stays hidden so
 * gameplay feels like a windowless idle RPG. Tauri reads
 * `data-tauri-drag-region` and turns the element into a draggable area.
 */
export function DragBar() {
	const [visible, setVisible] = useState(false);
	const isTauri = detectTauri();

	useEffect(() => {
		if (!isTauri) return;
		let cancelled = false;
		const poll = async () => {
			if (cancelled) return;
			const chrome = await fetchChrome();
			if (cancelled) return;
			setVisible(
				!!chrome && (chrome.phase === 0 || chrome.settings_open),
			);
		};
		void poll();
		const id = setInterval(() => void poll(), 500);
		return () => {
			cancelled = true;
			clearInterval(id);
		};
	}, [isTauri]);

	if (!isTauri || !visible) return null;

	return (
		<div
			data-tauri-drag-region
			style={{
				position: 'fixed',
				top: 0,
				left: 0,
				right: 0,
				height: 28,
				zIndex: 100000,
				background: 'rgba(0, 0, 0, 0.25)',
				borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
				cursor: 'grab',
				pointerEvents: 'auto',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				color: '#a89878',
				fontFamily: 'monospace',
				fontSize: 10,
				userSelect: 'none',
				WebkitUserSelect: 'none',
			}}>
			drag to move
		</div>
	);
}
