import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ChatLogEntry {
	sender: string;
	content: string;
	channel: string;
	kind: string;
	ts_unix: number;
}

interface SignInState {
	jwt_valid: boolean;
	username: string | null;
}

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

async function fetchLog(): Promise<ChatLogEntry[]> {
	if (!detectTauri()) return [];
	try {
		return await invoke<ChatLogEntry[]>('get_chat_log');
	} catch {
		return [];
	}
}

async function fetchSignin(): Promise<SignInState | null> {
	if (!detectTauri()) return null;
	try {
		return await invoke<SignInState>('get_signin_state');
	} catch {
		return null;
	}
}

export function ChatInput() {
	const [signedIn, setSignedIn] = useState(false);
	const [username, setUsername] = useState<string | null>(null);
	const [log, setLog] = useState<ChatLogEntry[]>([]);
	const inputRef = useRef<HTMLInputElement>(null);
	const logRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let cancelled = false;
		const poll = async () => {
			if (cancelled) return;
			const [s, l] = await Promise.all([fetchSignin(), fetchLog()]);
			if (cancelled) return;
			if (s) {
				setSignedIn(s.jwt_valid && !!s.username);
				setUsername(s.username);
			}
			setLog(l);
		};
		void poll();
		const id = setInterval(() => void poll(), 1000);
		return () => {
			cancelled = true;
			clearInterval(id);
		};
	}, []);

	useEffect(() => {
		const el = logRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [log]);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const tag = target?.tagName;
			const inEditable =
				tag === 'INPUT' ||
				tag === 'TEXTAREA' ||
				tag === 'SELECT' ||
				target?.isContentEditable === true;
			if (inEditable) return;
			const isFocus =
				e.code === 'KeyT' ||
				e.code === 'Slash' ||
				e.key === 'T' ||
				e.key === 't' ||
				e.key === '/';
			if (isFocus && !e.metaKey && !e.ctrlKey && !e.altKey) {
				e.preventDefault();
				e.stopPropagation();
				inputRef.current?.focus();
			}
		};
		window.addEventListener('keydown', onKeyDown, true);
		return () => window.removeEventListener('keydown', onKeyDown, true);
	}, []);

	const submit = useCallback(async () => {
		const el = inputRef.current;
		const text = (el?.value ?? '').trim();
		if (!text) return;
		const ok = await sendChat(text);
		if (!ok) console.warn('[chat] send failed (not connected or rejected)');
		if (el) {
			el.value = '';
			el.blur();
		}
	}, []);

	if (!signedIn) return null;

	return (
		<div
			style={{
				position: 'fixed',
				left: 16,
				bottom: 180,
				width: 340,
				height: 240,
				zIndex: 9999,
				pointerEvents: 'auto',
				background: 'rgba(10, 10, 16, 0.86)',
				border: '1px solid rgba(255, 255, 255, 0.18)',
				borderRadius: 6,
				boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
				display: 'flex',
				flexDirection: 'column',
				color: '#e8d8b8',
				fontFamily: 'monospace',
				fontSize: 12,
			}}>
			<div
				style={{
					padding: '4px 8px',
					borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
					fontSize: 11,
					color: '#a89878',
					display: 'flex',
					justifyContent: 'space-between',
				}}>
				<span>#general</span>
				<span>{username ?? ''}</span>
			</div>
			<div
				ref={logRef}
				style={{
					flex: 1,
					overflowY: 'auto',
					padding: '6px 8px',
					display: 'flex',
					flexDirection: 'column',
					gap: 2,
				}}>
				{log.length === 0 ? (
					<div style={{ color: '#665a3a' }}>(no messages yet)</div>
				) : (
					log.map((e, i) => (
						<div key={i} style={{ lineHeight: 1.3 }}>
							<span style={{ color: '#7eb55b' }}>{e.sender}</span>
							<span style={{ color: '#a89878' }}>: </span>
							<span>{e.content}</span>
						</div>
					))
				)}
			</div>
			<div
				style={{
					padding: '6px 8px',
					borderTop: '1px solid rgba(255, 255, 255, 0.1)',
				}}>
				<input
					ref={inputRef}
					type="text"
					maxLength={300}
					defaultValue=""
					autoComplete="off"
					spellCheck={false}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							void submit();
						}
					}}
					placeholder="Press T to focus — Enter to send"
					style={{
						width: '100%',
						background: 'rgba(0, 0, 0, 0.4)',
						border: '1px solid rgba(255, 255, 255, 0.15)',
						borderRadius: 4,
						outline: 'none',
						color: '#e8d8b8',
						fontSize: 12,
						fontFamily: 'inherit',
						caretColor: '#e8d8b8',
						padding: '4px 6px',
					}}
				/>
			</div>
		</div>
	);
}
