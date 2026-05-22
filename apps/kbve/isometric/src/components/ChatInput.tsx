import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GlassPanel } from '../ui/shared/GlassPanel';

function detectTauri(): boolean {
	return !!(
		(window as typeof window & { __TAURI_INTERNALS__?: unknown })
			.__TAURI_INTERNALS__ ||
		(window as typeof window & { __TAURI__?: unknown }).__TAURI__
	);
}

async function sendChat(text: string): Promise<boolean> {
	if (!text.trim()) return false;
	if (detectTauri()) {
		try {
			return await invoke<boolean>('send_chat', { text });
		} catch (err) {
			console.warn('[chat] send_chat (tauri) threw', err);
			return false;
		}
	}
	try {
		const mod = await import('../../wasm-pkg/isometric_game.js');
		const fn = (mod as unknown as { send_chat?: (s: string) => boolean })
			.send_chat;
		if (typeof fn !== 'function') return false;
		return fn(text);
	} catch (err) {
		console.warn('[chat] send_chat (wasm) threw', err);
		return false;
	}
}

/**
 * Chat input — focused via `T`, sent via Enter, cancelled via Esc.
 *
 * The Bevy side renders the log overlay; this component owns the text-entry
 * UI because Bevy has no native input widget. The input only renders while
 * focused so the rest of the game keeps keyboard control.
 */
export function ChatInput() {
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			// Ignore keystrokes while already typing into another input.
			const target = e.target as HTMLElement | null;
			if (target && target.tagName === 'INPUT') {
				if (target === inputRef.current && e.key === 'Escape') {
					setOpen(false);
					setValue('');
				}
				return;
			}
			if (e.key === 'T' || e.key === 't') {
				if (!e.metaKey && !e.ctrlKey && !e.altKey) {
					e.preventDefault();
					setOpen(true);
				}
			} else if (e.key === 'Escape' && open) {
				setOpen(false);
				setValue('');
			}
		};
		window.addEventListener('keydown', onKeyDown, true);
		return () => window.removeEventListener('keydown', onKeyDown, true);
	}, [open]);

	useEffect(() => {
		if (open) {
			inputRef.current?.focus();
		}
	}, [open]);

	const submit = useCallback(async () => {
		const text = value.trim();
		if (!text) {
			setOpen(false);
			return;
		}
		const ok = await sendChat(text);
		if (!ok) {
			console.warn('[chat] send failed (not connected or rejected)');
		}
		setValue('');
		setOpen(false);
	}, [value]);

	if (!open) return null;

	return (
		<div className="fixed left-4 bottom-[180px] z-[80] pointer-events-auto w-[320px]">
			<GlassPanel className="px-3 py-2">
				<input
					ref={inputRef}
					type="text"
					maxLength={300}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							void submit();
						}
					}}
					placeholder="Say something to #global..."
					className="w-full bg-transparent outline-none text-sm text-text placeholder:text-text-muted"
				/>
			</GlassPanel>
		</div>
	);
}
