import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface UiChromeState {
	phase: number;
	settings_open: boolean;
	overlay_open: boolean;
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
				!!chrome &&
					(chrome.phase === 0 ||
						chrome.settings_open ||
						chrome.overlay_open),
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

	const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		// Fire synchronously so AppKit still has the active mousedown when
		// the IPC reaches the Tauri backend. Awaiting an import first lets
		// the OS gesture complete before startDragging executes.
		getCurrentWindow()
			.startDragging()
			.catch((err) => console.warn('[drag] startDragging failed', err));
	};

	const onDoubleClick = () => {
		const w = getCurrentWindow();
		w.isMaximized()
			.then((max) => (max ? w.unmaximize() : w.maximize()))
			.catch((err) => console.warn('[drag] maximize toggle failed', err));
	};

	return (
		<div
			data-tauri-drag-region
			onPointerDown={onPointerDown}
			onDoubleClick={onDoubleClick}
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
