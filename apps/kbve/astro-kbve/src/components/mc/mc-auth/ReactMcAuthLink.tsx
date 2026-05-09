import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession, getAccessToken } from '@kbve/astro';
import { initSupa } from '@/lib/supa';
import {
	getLinkStatus,
	mojangLookup,
	requestLink,
	unlink,
	type LinkStatus,
	type MojangProfile,
} from './mcAuthService';

type Phase =
	| 'init'
	| 'anon'
	| 'unlinked'
	| 'lookup'
	| 'confirm'
	| 'requesting'
	| 'pending'
	| 'verified'
	| 'unlinking';

const POLL_INTERVAL_MS = 5_000;
const CODE_TTL_MS = 10 * 60 * 1000;

const styles = {
	container: {
		borderRadius: '0.5rem',
		border: '1px solid var(--sl-color-gray-5)',
		background: 'var(--sl-color-bg-nav)',
		padding: '1rem 1.25rem',
		marginBottom: '1.5rem',
	} as React.CSSProperties,
	header: {
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: '0.75rem',
		paddingBottom: '0.5rem',
		borderBottom: '1px solid var(--sl-color-gray-6)',
	} as React.CSSProperties,
	title: {
		margin: 0,
		fontSize: '1rem',
		fontWeight: 600,
		color: 'var(--sl-color-white)',
	} as React.CSSProperties,
	badge: {
		fontSize: '0.75rem',
		padding: '0.125rem 0.5rem',
		borderRadius: '9999px',
		fontWeight: 600,
	} as React.CSSProperties,
	badgeLinked: {
		background: 'rgba(34, 197, 94, 0.15)',
		color: 'rgb(34, 197, 94)',
	} as React.CSSProperties,
	badgePending: {
		background: 'rgba(234, 179, 8, 0.15)',
		color: 'rgb(234, 179, 8)',
	} as React.CSSProperties,
	badgeUnlinked: {
		background: 'rgba(156, 163, 175, 0.15)',
		color: 'var(--sl-color-gray-3)',
	} as React.CSSProperties,
	row: {
		display: 'flex',
		gap: '0.5rem',
		alignItems: 'center',
		flexWrap: 'wrap',
	} as React.CSSProperties,
	input: {
		flex: 1,
		minWidth: '180px',
		padding: '0.5rem 0.75rem',
		borderRadius: '0.375rem',
		border: '1px solid var(--sl-color-gray-5)',
		background: 'var(--sl-color-bg)',
		color: 'var(--sl-color-white)',
		fontSize: '0.9rem',
	} as React.CSSProperties,
	button: {
		padding: '0.5rem 1rem',
		borderRadius: '0.375rem',
		border: '1px solid var(--sl-color-accent)',
		background: 'var(--sl-color-accent)',
		color: 'var(--sl-color-white)',
		fontSize: '0.9rem',
		fontWeight: 600,
		cursor: 'pointer',
	} as React.CSSProperties,
	buttonGhost: {
		padding: '0.5rem 1rem',
		borderRadius: '0.375rem',
		border: '1px solid var(--sl-color-gray-5)',
		background: 'transparent',
		color: 'var(--sl-color-white)',
		fontSize: '0.9rem',
		cursor: 'pointer',
	} as React.CSSProperties,
	code: {
		display: 'inline-block',
		fontFamily:
			'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
		fontSize: '1.75rem',
		fontWeight: 700,
		letterSpacing: '0.25em',
		color: 'var(--sl-color-accent-high)',
		padding: '0.5rem 1rem',
		background: 'var(--sl-color-bg)',
		border: '1px dashed var(--sl-color-accent)',
		borderRadius: '0.375rem',
	} as React.CSSProperties,
	error: {
		color: 'rgb(248, 113, 113)',
		fontSize: '0.85rem',
		marginTop: '0.5rem',
	} as React.CSSProperties,
	muted: {
		color: 'var(--sl-color-gray-3)',
		fontSize: '0.85rem',
		marginTop: '0.5rem',
	} as React.CSSProperties,
	stack: {
		display: 'flex',
		flexDirection: 'column',
		gap: '0.5rem',
	} as React.CSSProperties,
};

function badgeStyle(phase: Phase) {
	if (phase === 'verified') {
		return { ...styles.badge, ...styles.badgeLinked };
	}
	if (phase === 'pending') {
		return { ...styles.badge, ...styles.badgePending };
	}
	return { ...styles.badge, ...styles.badgeUnlinked };
}

function badgeLabel(phase: Phase) {
	if (phase === 'verified') return 'Linked';
	if (phase === 'pending') return 'Pending';
	if (phase === 'anon') return 'Sign in';
	return 'Not linked';
}

function formatRemaining(ms: number) {
	if (ms <= 0) return 'expired';
	const total = Math.floor(ms / 1000);
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${s.toString().padStart(2, '0')}`;
}

function statusToPhase(status: LinkStatus | null): Phase {
	if (!status) return 'unlinked';
	if (status.is_verified) return 'verified';
	if (status.is_pending) return 'pending';
	return 'unlinked';
}

export function ReactMcAuthLink() {
	const { ready, authenticated } = useSession();
	const [phase, setPhase] = useState<Phase>('init');
	const [error, setError] = useState<string | null>(null);
	const [profile, setProfile] = useState<MojangProfile | null>(null);
	const [code, setCode] = useState<number | null>(null);
	const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const [link, setLink] = useState<LinkStatus | null>(null);
	const [usernameInput, setUsernameInput] = useState('');
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		void initSupa().catch((err) => {
			console.error('[ReactMcAuthLink] initSupa failed', err);
			setError(err?.message ?? 'init failed');
		});
	}, []);

	const refreshStatus = useCallback(async () => {
		const token = await getAccessToken();
		if (!token) return;
		try {
			const status = await getLinkStatus(token);
			setLink(status);
			const next = statusToPhase(status);
			setPhase((prev) => {
				if (
					prev === 'lookup' ||
					prev === 'confirm' ||
					prev === 'requesting' ||
					prev === 'unlinking'
				) {
					return prev;
				}
				return next;
			});
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'status failed';
			setError(message);
			setPhase((prev) => (prev === 'init' ? 'unlinked' : prev));
		}
	}, []);

	useEffect(() => {
		if (!ready) return;
		if (!authenticated) {
			setPhase('anon');
			return;
		}
		void refreshStatus();
	}, [ready, authenticated, refreshStatus]);

	useEffect(() => {
		if (phase !== 'pending') {
			if (pollRef.current) {
				clearInterval(pollRef.current);
				pollRef.current = null;
			}
			return;
		}
		pollRef.current = setInterval(() => {
			void refreshStatus();
		}, POLL_INTERVAL_MS);
		return () => {
			if (pollRef.current) {
				clearInterval(pollRef.current);
				pollRef.current = null;
			}
		};
	}, [phase, refreshStatus]);

	useEffect(() => {
		if (!codeExpiresAt) return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [codeExpiresAt]);

	const onLookup = useCallback(async () => {
		const token = await getAccessToken();
		if (!token) return;
		setError(null);
		setPhase('lookup');
		try {
			const found = await mojangLookup(usernameInput.trim(), token);
			if (!found) {
				setError(
					`No Minecraft account found for "${usernameInput.trim()}". Check spelling.`,
				);
				setPhase('unlinked');
				return;
			}
			setProfile(found);
			setPhase('confirm');
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'lookup failed';
			setError(message);
			setPhase('unlinked');
		}
	}, [usernameInput]);

	const onRequestCode = useCallback(async () => {
		if (!profile) return;
		const token = await getAccessToken();
		if (!token) return;
		setError(null);
		setPhase('requesting');
		try {
			const v = await requestLink(profile.mc_uuid, token);
			setCode(v);
			setCodeExpiresAt(Date.now() + CODE_TTL_MS);
			setPhase('pending');
			void refreshStatus();
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'request failed';
			setError(message);
			setPhase('confirm');
		}
	}, [profile, refreshStatus]);

	const onUnlink = useCallback(async () => {
		const token = await getAccessToken();
		if (!token) return;
		setError(null);
		setPhase('unlinking');
		try {
			await unlink(token);
			setProfile(null);
			setCode(null);
			setCodeExpiresAt(null);
			setLink(null);
			setUsernameInput('');
			setPhase('unlinked');
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'unlink failed';
			setError(message);
			setPhase('verified');
		}
	}, []);

	if (phase === 'init') {
		return (
			<div style={styles.container}>
				<div style={styles.header}>
					<h3 style={styles.title}>Link your Minecraft account</h3>
				</div>
				<div style={styles.muted}>Loading…</div>
			</div>
		);
	}

	return (
		<div style={styles.container}>
			<div style={styles.header}>
				<h3 style={styles.title}>Link your Minecraft account</h3>
				<span style={badgeStyle(phase)}>{badgeLabel(phase)}</span>
			</div>

			{phase === 'anon' && (
				<div style={styles.stack}>
					<div style={styles.muted}>
						Sign in with your KBVE account to link a Minecraft
						profile.
					</div>
					<div>
						<a href="/login" style={styles.button}>
							Sign in
						</a>
					</div>
				</div>
			)}

			{(phase === 'unlinked' || phase === 'lookup') && (
				<div style={styles.stack}>
					<div style={styles.muted}>
						Enter your Minecraft username — we'll look up your UUID
						via Mojang.
					</div>
					<div style={styles.row}>
						<input
							type="text"
							placeholder="Notch"
							value={usernameInput}
							onChange={(e) => setUsernameInput(e.target.value)}
							style={styles.input}
							maxLength={16}
							disabled={phase === 'lookup'}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && usernameInput.trim()) {
									void onLookup();
								}
							}}
						/>
						<button
							type="button"
							onClick={onLookup}
							disabled={
								phase === 'lookup' || !usernameInput.trim()
							}
							style={styles.button}>
							{phase === 'lookup' ? 'Looking up…' : 'Look up'}
						</button>
					</div>
				</div>
			)}

			{(phase === 'confirm' || phase === 'requesting') && profile && (
				<div style={styles.stack}>
					<div style={styles.muted}>
						Found <strong>{profile.username}</strong> — UUID{' '}
						<code>{profile.mc_uuid}</code>. Confirm to generate a
						code.
					</div>
					<div style={styles.row}>
						<button
							type="button"
							onClick={onRequestCode}
							disabled={phase === 'requesting'}
							style={styles.button}>
							{phase === 'requesting'
								? 'Generating…'
								: 'Generate code'}
						</button>
						<button
							type="button"
							onClick={() => {
								setProfile(null);
								setPhase('unlinked');
							}}
							disabled={phase === 'requesting'}
							style={styles.buttonGhost}>
							Cancel
						</button>
					</div>
				</div>
			)}

			{phase === 'pending' && code !== null && (
				<div style={styles.stack}>
					<div style={styles.muted}>
						Join <strong>mc.kbve.com</strong> and run this in chat:
					</div>
					<div style={styles.row}>
						<span style={styles.code}>
							/link {code.toString().padStart(6, '0')}
						</span>
					</div>
					<div style={styles.muted}>
						Code expires in{' '}
						<strong>
							{codeExpiresAt
								? formatRemaining(codeExpiresAt - now)
								: 'unknown'}
						</strong>
						. We'll detect the link automatically.
					</div>
				</div>
			)}

			{(phase === 'verified' || phase === 'unlinking') && link && (
				<div style={styles.stack}>
					<div style={styles.muted}>
						Linked to MC UUID <code>{link.mc_uuid}</code>.
					</div>
					<div style={styles.row}>
						<button
							type="button"
							onClick={onUnlink}
							disabled={phase === 'unlinking'}
							style={styles.buttonGhost}>
							{phase === 'unlinking' ? 'Unlinking…' : 'Unlink'}
						</button>
					</div>
				</div>
			)}

			{error && <div style={styles.error}>{error}</div>}
		</div>
	);
}

export default ReactMcAuthLink;
