import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

/**
 * Captures keyboard/mouse events from the webview and forwards them
 * to Bevy via Tauri IPC. One batched call per animation frame.
 */
export function useInputBridge() {
	useEffect(() => {
		const keysDown = new Set<string>();
		const pendingPressed: string[] = [];
		const pendingReleased: string[] = [];
		const pendingMousePressed: number[] = [];
		const pendingMouseReleased: number[] = [];
		let cursorX = 0;
		let cursorY = 0;
		let cursorValid = false;
		let scrollY = 0;
		let rafId: number;

		const onKeyDown = (e: KeyboardEvent) => {
			if (!keysDown.has(e.code)) {
				keysDown.add(e.code);
				pendingPressed.push(e.code);
			}
		};

		const onKeyUp = (e: KeyboardEvent) => {
			keysDown.delete(e.code);
			pendingReleased.push(e.code);
		};

		const onMouseMove = (e: MouseEvent) => {
			cursorX = e.clientX;
			cursorY = e.clientY;
			cursorValid = true;
		};

		const onMouseDown = (e: MouseEvent) => {
			pendingMousePressed.push(e.button);
		};

		const onMouseUp = (e: MouseEvent) => {
			pendingMouseReleased.push(e.button);
		};

		const onWheel = (e: WheelEvent) => {
			scrollY += e.deltaY > 0 ? -1 : 1;
		};

		const flush = () => {
			if (
				pendingPressed.length ||
				pendingReleased.length ||
				cursorValid ||
				pendingMousePressed.length ||
				pendingMouseReleased.length ||
				scrollY !== 0
			) {
				invoke('on_input_frame', {
					keysPressed: pendingPressed.splice(0),
					keysReleased: pendingReleased.splice(0),
					cursorX,
					cursorY,
					cursorValid,
					mousePressed: pendingMousePressed.splice(0),
					mouseReleased: pendingMouseReleased.splice(0),
					scrollY,
				}).catch(() => {
					// IPC not ready yet — ignore
				});
				scrollY = 0;
			}
			rafId = requestAnimationFrame(flush);
		};

		rafId = requestAnimationFrame(flush);

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mousedown', onMouseDown);
		window.addEventListener('mouseup', onMouseUp);
		window.addEventListener('wheel', onWheel);

		return () => {
			cancelAnimationFrame(rafId);
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mousedown', onMouseDown);
			window.removeEventListener('mouseup', onMouseUp);
			window.removeEventListener('wheel', onWheel);
		};
	}, []);
}
