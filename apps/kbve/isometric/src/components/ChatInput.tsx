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

async function loadWasmModule(): Promise<Record<string, unknown> | null> {
	try {
		return (await import('../../wasm-pkg/isometric_game.js')) as Record<
			string,
			unknown
		>;
	} catch {
		return null;
	}
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
	const mod = await loadWasmModule();
	if (!mod) return false;
	const fn = mod.send_chat as ((s: string) => boolean) | undefined;
	if (typeof fn !== 'function') return false;
	try {
		return fn(text);
	} catch (err) {
		console.warn('[chat] send_chat (wasm) threw', err);
		return false;
	}
}

async function fetchLog(): Promise<ChatLogEntry[]> {
	if (detectTauri()) {
		try {
			return await invoke<ChatLogEntry[]>('get_chat_log');
		} catch {
			return [];
		}
	}
	const mod = await loadWasmModule();
	if (!mod) return [];
	const fn = mod.get_chat_log_json as (() => string) | undefined;
	if (typeof fn !== 'function') return [];
	try {
		const json = fn();
		return json ? (JSON.parse(json) as ChatLogEntry[]) : [];
	} catch {
		return [];
	}
}

async function fetchSignin(): Promise<SignInState | null> {
	if (detectTauri()) {
		try {
			return await invoke<SignInState>('get_signin_state');
		} catch {
			return null;
		}
	}
	const mod = await loadWasmModule();
	if (!mod) return null;
	const fn = mod.get_signin_state_json as (() => string) | undefined;
	if (typeof fn !== 'function') return null;
	try {
		const json = fn();
		return json ? (JSON.parse(json) as SignInState) : null;
	} catch {
		return null;
	}
}

export function ChatInput() {
	const [signedIn, setSignedIn] = useState(false);
	const [username, setUsername] = useState<string | null>(null);
	const [log, setLog] = useState<ChatLogEntry[]>([]);
	// `openState` tracks both the visible state and the snapshot length the
	// player has acknowledged. Bundling them in one state object keeps the
	// "open the panel + clear unread" transition atomic and pure (no
	// during-render setState or ref mutation).
	const [openState, setOpenState] = useState<{ open: boolean; seen: number }>(
		{ open: false, seen: 0 },
	);
	const { open } = openState;
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

	const openChat = () => setOpenState({ open: true, seen: log.length });
	const closeChat = () => setOpenState({ open: false, seen: log.length });

	useEffect(() => {
		if (!open) return;
		const el = logRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [log, open]);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const tag = target?.tagName;
			const inEditable =
				tag === 'INPUT' ||
				tag === 'TEXTAREA' ||
				tag === 'SELECT' ||
				target?.isContentEditable === true;

			if (inEditable) {
				if (target === inputRef.current && e.key === 'Escape') {
					e.preventDefault();
					if (inputRef.current) inputRef.current.value = '';
					closeChat();
				}
				return;
			}

			const isOpenChat =
				e.code === 'KeyT' ||
				e.code === 'Slash' ||
				e.key === 'T' ||
				e.key === 't' ||
				e.key === '/';
			if (isOpenChat && !e.metaKey && !e.ctrlKey && !e.altKey) {
				e.preventDefault();
				e.stopPropagation();
				if (open) closeChat();
				else openChat();
			} else if (e.key === 'Escape' && open) {
				closeChat();
			}
		};
		window.addEventListener('keydown', onKeyDown, true);
		return () => window.removeEventListener('keydown', onKeyDown, true);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const el = inputRef.current;
		if (!el) return;
		const focus = () => el.focus();
		focus();
		const raf = requestAnimationFrame(focus);
		return () => cancelAnimationFrame(raf);
	}, [open]);

	const submit = useCallback(async () => {
		const el = inputRef.current;
		const text = (el?.value ?? '').trim();
		if (!text) return;
		const ok = await sendChat(text);
		if (!ok) console.warn('[chat] send failed (not connected or rejected)');
		if (el) {
			el.value = '';
		}
	}, []);

	if (!signedIn) return null;

	const unread = open ? 0 : Math.max(0, log.length - openState.seen);

	if (!open) {
		if (unread === 0) return null;
		return (
			<button
				type="button"
				onClick={openChat}
				style={{
					position: 'fixed',
					left: 12,
					top: 48,
					zIndex: 9999,
					pointerEvents: 'auto',
					padding: '4px 10px',
					background: 'rgba(10, 10, 16, 0.86)',
					border: '1px solid #b83030',
					borderRadius: 12,
					color: '#e8d8b8',
					fontFamily: 'monospace',
					fontSize: 11,
					cursor: 'pointer',
					display: 'flex',
					alignItems: 'center',
					gap: 6,
				}}
				title="Press T to open chat">
				<span style={{ color: '#b83030', fontWeight: 'bold' }}>
					{unread}
				</span>
				<span>chat</span>
			</button>
		);
	}

	return (
		<div
			style={{
				position: 'fixed',
				left: 12,
				top: 48,
				width: 'min(340px, calc(100vw - 24px))',
				height: 'min(260px, calc(100vh - 96px))',
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
					alignItems: 'center',
					gap: 8,
				}}>
				<span>#general</span>
				<span style={{ flex: 1, textAlign: 'right' }}>
					{username ?? ''}
				</span>
				<button
					type="button"
					onClick={closeChat}
					style={{
						background: 'transparent',
						border: 'none',
						color: '#a89878',
						cursor: 'pointer',
						fontSize: 14,
						lineHeight: 1,
						padding: '0 2px',
					}}
					title="Close (Esc)">
					×
				</button>
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
					placeholder="Enter to send — Esc to close"
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
