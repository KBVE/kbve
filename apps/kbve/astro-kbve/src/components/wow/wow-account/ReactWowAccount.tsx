import { useCallback, useEffect, useState } from 'react';
import { useSession, getAccessToken } from '@kbve/astro';
import { initSupa } from '@/lib/supa';
import {
	createAccount,
	getAccount,
	releaseClaim,
	setPassword,
	type WowAccount,
} from './wowAccountService';

type Phase =
	| 'init'
	| 'anon'
	| 'none'
	| 'claimed'
	| 'creating'
	| 'provisioned'
	| 'resetting';

const USERNAME_RE = /^[A-Z0-9_-]{3,16}$/;

// 3.3.5a uppercases both halves of the credential before hashing, so the
// password is effectively case-insensitive and capped by the client's own
// input field. Enforcing that here keeps the failure at the form rather than
// at a login screen that just says "wrong password".
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 16;

const styles = {
	container: {
		borderRadius: '0.5rem',
		border: '1px solid var(--sl-color-gray-5)',
		background: 'var(--sl-color-bg-nav)',
		padding: '1rem 1.25rem',
		marginBottom: '1.5rem',
		minHeight: '220px',
		display: 'flex',
		flexDirection: 'column',
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
	badgeLive: {
		background: 'rgba(34, 197, 94, 0.15)',
		color: 'rgb(34, 197, 94)',
	} as React.CSSProperties,
	badgeIdle: {
		background: 'rgba(156, 163, 175, 0.15)',
		color: 'var(--sl-color-gray-3)',
	} as React.CSSProperties,
	stack: {
		display: 'flex',
		flexDirection: 'column',
		gap: '0.5rem',
	} as React.CSSProperties,
	label: {
		fontSize: '0.8rem',
		fontWeight: 600,
		color: 'var(--sl-color-gray-2)',
	} as React.CSSProperties,
	input: {
		width: '100%',
		padding: '0.5rem 0.75rem',
		borderRadius: '0.375rem',
		border: '1px solid var(--sl-color-gray-5)',
		background: 'var(--sl-color-bg)',
		color: 'var(--sl-color-white)',
		fontSize: '0.9rem',
	} as React.CSSProperties,
	row: {
		display: 'flex',
		gap: '0.5rem',
		alignItems: 'center',
		flexWrap: 'wrap',
		marginTop: '0.25rem',
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
	name: {
		fontFamily:
			'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
		fontSize: '1.5rem',
		fontWeight: 700,
		letterSpacing: '0.08em',
		color: 'var(--sl-color-accent-high)',
	} as React.CSSProperties,
	error: {
		color: 'rgb(248, 113, 113)',
		fontSize: '0.85rem',
		marginTop: '0.5rem',
	} as React.CSSProperties,
	ok: {
		color: 'rgb(34, 197, 94)',
		fontSize: '0.85rem',
		marginTop: '0.5rem',
	} as React.CSSProperties,
	muted: {
		color: 'var(--sl-color-gray-3)',
		fontSize: '0.85rem',
		marginTop: '0.5rem',
	} as React.CSSProperties,
};

function validate(username: string, password: string, confirm: string) {
	const upper = username.trim().toUpperCase();
	if (!USERNAME_RE.test(upper)) {
		return 'Username must be 3-16 characters of A-Z, 0-9, _ or -.';
	}
	if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
		return `Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters.`;
	}
	if (password !== confirm) {
		return 'Passwords do not match.';
	}
	return null;
}

export function ReactWowAccount() {
	const { ready, authenticated } = useSession();
	const [phase, setPhase] = useState<Phase>('init');
	const [account, setAccount] = useState<WowAccount | null>(null);
	const [username, setUsername] = useState('');
	const [password, setPasswordValue] = useState('');
	const [confirm, setConfirm] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		void initSupa().catch((err) => {
			console.error('[ReactWowAccount] initSupa failed', err);
			setError(err?.message ?? 'init failed');
		});
	}, []);

	const refresh = useCallback(async () => {
		const token = await getAccessToken();
		if (!token) return;
		try {
			const found = await getAccount(token);
			setAccount(found);
			// A row that exists but is not provisioned is a username reserved by
			// a create that never finished. It blocks a second name, so it gets
			// its own state rather than being folded into 'none'.
			setPhase(
				found === null
					? 'none'
					: found.is_provisioned
						? 'provisioned'
						: 'claimed',
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'status failed');
			setPhase('none');
		}
	}, []);

	useEffect(() => {
		if (!ready) return;
		if (!authenticated) {
			setPhase('anon');
			return;
		}
		void refresh();
	}, [ready, authenticated, refresh]);

	const clearSecrets = useCallback(() => {
		setPasswordValue('');
		setConfirm('');
	}, []);

	const onCreate = useCallback(async () => {
		const invalid = validate(username, password, confirm);
		if (invalid) {
			setError(invalid);
			return;
		}
		const token = await getAccessToken();
		if (!token) return;
		setError(null);
		setNotice(null);
		setBusy(true);
		setPhase('creating');
		try {
			const created = await createAccount(username, password, token);
			clearSecrets();
			setNotice(`Game account ${created} is ready. Log in and play.`);
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'create failed');
			await refresh();
		} finally {
			setBusy(false);
		}
	}, [username, password, confirm, clearSecrets, refresh]);

	const onRelease = useCallback(async () => {
		const token = await getAccessToken();
		if (!token) return;
		setError(null);
		setNotice(null);
		setBusy(true);
		try {
			await releaseClaim(token);
			setUsername('');
			clearSecrets();
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'release failed');
		} finally {
			setBusy(false);
		}
	}, [clearSecrets, refresh]);

	const onReset = useCallback(async () => {
		if (!account) return;
		if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
			setError(
				`Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters.`,
			);
			return;
		}
		if (password !== confirm) {
			setError('Passwords do not match.');
			return;
		}
		const token = await getAccessToken();
		if (!token) return;
		setError(null);
		setNotice(null);
		setBusy(true);
		try {
			await setPassword(account.username, password, token);
			clearSecrets();
			setPhase('provisioned');
			setNotice('Password updated. Any active session was signed out.');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'reset failed');
		} finally {
			setBusy(false);
		}
	}, [account, password, confirm, clearSecrets]);

	const live = phase === 'provisioned' || phase === 'resetting';

	return (
		<div style={styles.container}>
			<div style={styles.header}>
				<h3 style={styles.title}>Game account</h3>
				<span
					style={{
						...styles.badge,
						...(live ? styles.badgeLive : styles.badgeIdle),
					}}>
					{phase === 'anon'
						? 'Sign in'
						: live
							? 'Active'
							: phase === 'claimed'
								? 'Reserved'
								: 'Not created'}
				</span>
			</div>

			{phase === 'init' && <p style={styles.muted}>Checking…</p>}

			{phase === 'anon' && (
				<p style={styles.muted}>
					Sign in to your KBVE account to create a World of Warcraft
					login. You need a KBVE username set before the game account
					can be created.
				</p>
			)}

			{phase === 'claimed' && account && (
				<div style={styles.stack}>
					<span style={styles.name}>{account.username}</span>
					<p style={styles.muted}>
						This name is reserved for you, but the account was never
						finished — the realm database could not be reached on
						the last attempt. Retrying is safe.
					</p>
					<div style={styles.row}>
						<button
							style={styles.buttonGhost}
							disabled={busy}
							onClick={() => {
								setUsername(account.username);
								setPhase('none');
							}}>
							Retry with this name
						</button>
						<button
							style={styles.buttonGhost}
							disabled={busy}
							onClick={() => void onRelease()}>
							{busy ? 'Releasing…' : 'Release the name'}
						</button>
					</div>
				</div>
			)}

			{(phase === 'none' || phase === 'creating') && (
				<div style={styles.stack}>
					<label style={styles.label} htmlFor="wow-username">
						Game username
					</label>
					<input
						id="wow-username"
						style={styles.input}
						value={username}
						maxLength={16}
						autoComplete="off"
						placeholder="ARTHAS"
						onChange={(e) =>
							setUsername(e.target.value.toUpperCase())
						}
					/>
					<label style={styles.label} htmlFor="wow-password">
						Game password
					</label>
					<input
						id="wow-password"
						style={styles.input}
						type="password"
						value={password}
						maxLength={PASSWORD_MAX}
						autoComplete="new-password"
						onChange={(e) => setPasswordValue(e.target.value)}
					/>
					<label style={styles.label} htmlFor="wow-confirm">
						Confirm password
					</label>
					<input
						id="wow-confirm"
						style={styles.input}
						type="password"
						value={confirm}
						maxLength={PASSWORD_MAX}
						autoComplete="new-password"
						onChange={(e) => setConfirm(e.target.value)}
					/>
					<div style={styles.row}>
						<button
							style={styles.button}
							disabled={busy}
							onClick={() => void onCreate()}>
							{busy ? 'Creating…' : 'Create account'}
						</button>
					</div>
					<p style={styles.muted}>
						This login is separate from your KBVE password. The
						3.3.5a client uppercases both fields, so the game
						password is case-insensitive and capped at{' '}
						{PASSWORD_MAX} characters — do not reuse a password that
						matters.
					</p>
				</div>
			)}

			{live && account && (
				<div style={styles.stack}>
					<span style={styles.name}>{account.username}</span>
					<p style={styles.muted}>
						Set <code>realmlist tocloud9.kbve.com</code> in your
						3.3.5a client and log in with this username.
					</p>

					{phase === 'provisioned' && (
						<div style={styles.row}>
							<button
								style={styles.buttonGhost}
								onClick={() => {
									setError(null);
									setNotice(null);
									setPhase('resetting');
								}}>
								Change password
							</button>
						</div>
					)}

					{phase === 'resetting' && (
						<>
							<label style={styles.label} htmlFor="wow-new">
								New password
							</label>
							<input
								id="wow-new"
								style={styles.input}
								type="password"
								value={password}
								maxLength={PASSWORD_MAX}
								autoComplete="new-password"
								onChange={(e) =>
									setPasswordValue(e.target.value)
								}
							/>
							<label style={styles.label} htmlFor="wow-new-2">
								Confirm new password
							</label>
							<input
								id="wow-new-2"
								style={styles.input}
								type="password"
								value={confirm}
								maxLength={PASSWORD_MAX}
								autoComplete="new-password"
								onChange={(e) => setConfirm(e.target.value)}
							/>
							<div style={styles.row}>
								<button
									style={styles.button}
									disabled={busy}
									onClick={() => void onReset()}>
									{busy ? 'Saving…' : 'Save password'}
								</button>
								<button
									style={styles.buttonGhost}
									disabled={busy}
									onClick={() => {
										clearSecrets();
										setError(null);
										setPhase('provisioned');
									}}>
									Cancel
								</button>
							</div>
						</>
					)}
				</div>
			)}

			{error && <p style={styles.error}>{error}</p>}
			{notice && <p style={styles.ok}>{notice}</p>}
		</div>
	);
}

export default ReactWowAccount;
