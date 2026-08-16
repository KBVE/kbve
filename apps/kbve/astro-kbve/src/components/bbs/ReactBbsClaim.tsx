import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@kbve/astro';
import { initSupa, getSupa } from '@/lib/supa';

type Board = {
	online: number;
	host: string;
	petscii_port: number;
	ansi_port: number;
};

type Phase = 'idle' | 'sending' | 'linked' | 'error';

async function getToken(): Promise<string | null> {
	try {
		await initSupa();
		const result = await getSupa()
			.getSession()
			.catch(() => null);
		return result?.session?.access_token ?? null;
	} catch {
		return null;
	}
}

function normalize(raw: string): string {
	return raw
		.toUpperCase()
		.replace(/[^0-9A-Z]/g, '')
		.slice(0, 8);
}

function format(code: string): string {
	return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export default function ReactBbsClaim() {
	const { ready, authenticated, username } = useSession();
	const [board, setBoard] = useState<Board | null>(null);
	const [code, setCode] = useState('');
	const [phase, setPhase] = useState<Phase>('idle');
	const [message, setMessage] = useState('');

	useEffect(() => {
		let live = true;
		fetch('/api/v1/bbs/status')
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (live && data) setBoard(data as Board);
			})
			.catch(() => undefined);
		return () => {
			live = false;
		};
	}, []);

	const submit = useCallback(
		async (event: React.FormEvent) => {
			event.preventDefault();
			const normalized = normalize(code);
			if (normalized.length < 6) {
				setPhase('error');
				setMessage('Enter the full code shown on the terminal.');
				return;
			}
			setPhase('sending');
			setMessage('');
			const token = await getToken();
			if (!token) {
				setPhase('error');
				setMessage('Session expired — sign in again.');
				return;
			}
			try {
				const res = await fetch('/api/v1/bbs/claim', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({ code: normalized }),
				});
				if (res.ok) {
					setPhase('linked');
					setMessage('Terminal authenticated. Head back to the BBS.');
					setCode('');
					return;
				}
				const body = await res.json().catch(() => null);
				setPhase('error');
				setMessage(
					res.status === 429
						? 'Too many attempts — wait a minute.'
						: (body?.error ?? 'That code is unknown or expired.'),
				);
			} catch {
				setPhase('error');
				setMessage('Network error — try again.');
			}
		},
		[code],
	);

	if (!ready) return null;

	const host = board?.host ?? 'bbs.kbve.com';
	const petscii = board?.petscii_port ?? 6400;
	const ansi = board?.ansi_port ?? 6401;

	return (
		<div className="bento-board bento-board--cols-2">
			<div className="bento-cell bento-stat bento-card bento-card--glass">
				<span className="bento-stat__value">{host}</span>
				<span className="bento-stat__label">
					{petscii} petscii · {ansi} ansi
				</span>
				<span className="bento-stat__detail bbs-line">
					{board ? (
						<>
							<span
								className="bento-live-dot"
								aria-hidden="true"
							/>
							{board.online} caller
							{board.online === 1 ? '' : 's'} online
						</>
					) : (
						'checking the line…'
					)}
				</span>
			</div>

			<div className="bento-cell bento-card bento-card--glass bbs-claim">
				{!authenticated ? (
					<>
						<p className="bbs-claim__lede">
							Sign in to link a terminal to your account.
						</p>
						<a
							className="bento-btn bento-btn--primary"
							href="/login/">
							Sign in
						</a>
					</>
				) : (
					<form className="bbs-claim__form" onSubmit={submit}>
						<label className="bento-eyebrow" htmlFor="bbs-code">
							Code shown on the terminal
						</label>
						<input
							id="bbs-code"
							className="bbs-claim__input"
							value={format(code)}
							onChange={(e) =>
								setCode(
									normalize(
										(e.target as HTMLInputElement).value,
									),
								)
							}
							placeholder="K7XP-42RM"
							autoComplete="off"
							spellCheck={false}
							inputMode="text"
						/>
						<button
							className="bento-btn bento-btn--primary"
							type="submit"
							disabled={phase === 'sending'}>
							{phase === 'sending' ? 'Linking…' : 'Link terminal'}
						</button>
						{message ? (
							<p
								className={
									phase === 'linked'
										? 'bbs-claim__msg bbs-claim__msg--ok'
										: 'bbs-claim__msg bbs-claim__msg--err'
								}>
								{message}
							</p>
						) : null}
						{username ? (
							<p className="bbs-claim__who">
								signed in as {username}
							</p>
						) : null}
					</form>
				)}
			</div>
		</div>
	);
}
