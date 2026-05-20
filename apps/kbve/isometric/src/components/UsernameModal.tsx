import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GlassPanel } from '../ui/shared/GlassPanel';

interface SignInState {
	jwt_valid: boolean;
	username: string | null;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function detectTauri(): boolean {
	return !!(
		(window as typeof window & { __TAURI_INTERNALS__?: unknown })
			.__TAURI_INTERNALS__ ||
		(window as typeof window & { __TAURI__?: unknown }).__TAURI__
	);
}

async function fetchSignInState(): Promise<SignInState | null> {
	if (detectTauri()) {
		try {
			return await invoke<SignInState>('get_signin_state');
		} catch {
			return null;
		}
	}
	try {
		const mod = await import('../../wasm-pkg/isometric_game.js');
		const fn = (mod as unknown as { get_signin_state_json?: () => string })
			.get_signin_state_json;
		if (typeof fn !== 'function') return null;
		const json = fn();
		if (!json) return null;
		return JSON.parse(json) as SignInState;
	} catch {
		return null;
	}
}

async function submitUsername(username: string): Promise<void> {
	if (detectTauri()) {
		await invoke('set_username', { username });
		return;
	}
	const mod = await import('../../wasm-pkg/isometric_game.js');
	const fn = (mod as unknown as { set_username?: (u: string) => void })
		.set_username;
	if (typeof fn === 'function') {
		fn(username);
	}
}

export function UsernameModal() {
	const [state, setState] = useState<SignInState | null>(null);
	const [input, setInput] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		let cancelled = false;
		const poll = async () => {
			const s = await fetchSignInState();
			if (!cancelled) setState(s);
		};
		poll();
		const t = setInterval(poll, 1500);
		return () => {
			cancelled = true;
			clearInterval(t);
		};
	}, []);

	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();
			const trimmed = input.trim();
			if (!USERNAME_RE.test(trimmed)) {
				setError('3–20 chars, letters / numbers / underscore only.');
				return;
			}
			setSubmitting(true);
			setError(null);
			try {
				await submitUsername(trimmed);
			} catch (err) {
				setError(String((err as Error)?.message ?? err));
			} finally {
				setSubmitting(false);
			}
		},
		[input],
	);

	if (!state || !state.jwt_valid || state.username) return null;

	return (
		<div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 pointer-events-auto">
			<GlassPanel className="px-6 py-5 max-w-sm w-[92%] flex flex-col gap-3">
				<h2 className="text-base font-semibold">
					Choose your KBVE username
				</h2>
				<p className="text-xs text-text-muted">
					This is the name other players will see in chat and on the
					leaderboards. 3–20 characters, letters / numbers /
					underscore.
				</p>
				<form onSubmit={handleSubmit} className="flex flex-col gap-2">
					<input
						type="text"
						autoFocus
						maxLength={20}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder="e.g. h0lybyte"
						className="bg-black/40 border border-glass-border rounded-glass px-3 py-2 text-sm outline-none focus:border-accent"
						disabled={submitting}
					/>
					{error && (
						<div className="text-xs text-red-400">{error}</div>
					)}
					<button
						type="submit"
						disabled={submitting || !input.trim()}
						className="bg-accent/80 hover:bg-accent disabled:opacity-50 text-white text-sm font-medium rounded-glass px-4 py-2 transition">
						{submitting ? 'Submitting…' : 'Set username'}
					</button>
				</form>
			</GlassPanel>
		</div>
	);
}
