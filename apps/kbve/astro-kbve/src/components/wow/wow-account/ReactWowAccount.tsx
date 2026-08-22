import { useCallback, useEffect, useState } from 'react';
import { useSession, getAccessToken } from '@kbve/astro';
import { initSupa } from '@/lib/supa';
import {
	createAccount,
	getStatus,
	releaseClaim,
	setPassword,
	type WowAccount,
} from './wowAccountService';

type Phase =
	| 'init'
	| 'anon'
	| 'no-kbve-username'
	| 'none'
	| 'claimed'
	| 'provisioned'
	| 'resetting';

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

function validatePassword(password: string, confirm: string) {
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
	const [suggested, setSuggested] = useState<string | null>(null);
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
			const status = await getStatus(token);
			setAccount(status.account);
			setSuggested(status.suggestedUsername);
			if (status.needsKbveUsername) {
				setPhase('no-kbve-username');
				return;
			}
			// A row that exists but is not provisioned is a name reserved by a
			// create that never finished. It decides the next name the user can
			// get, so it gets its own state rather than being folded into 'none'.
			setPhase(
				status.account === null
					? 'none'
					: status.account.is_provisioned
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
		const invalid = validatePassword(password, confirm);
		if (invalid) {
			setError(invalid);
			return;
		}
		const token = await getAccessToken();
		if (!token) return;
		setError(null);
		setNotice(null);
		setBusy(true);
		try {
			const created = await createAccount(password, token);
			clearSecrets();
			setNotice(`Game account ${created} is ready. Log in and play.`);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'create failed');
		} finally {
			setBusy(false);
			await refresh();
		}
	}, [password, confirm, clearSecrets, refresh]);

	const onRelease = useCallback(async () => {
		const token = await getAccessToken();
		if (!token) return;
		setError(null);
		setNotice(null);
		setBusy(true);
		try {
			await releaseClaim(token);
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
		const invalid = validatePassword(password, confirm);
		if (invalid) {
			setError(invalid);
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

	// Shown while choosing a password. The reservation has not happened yet, so
	// a collision can still push the final name to a suffixed form — hence
	// "usually", rather than promising a name the server has not committed to.
	const passwordFields = (idPrefix: string) => (
		<>
			<label style={styles.label} htmlFor={`${idPrefix}-password`}>
				Game password
			</label>
			<input
				id={`${idPrefix}-password`}
				style={styles.input}
				type="password"
				value={password}
				maxLength={PASSWORD_MAX}
				autoComplete="new-password"
				onChange={(e) => setPasswordValue(e.target.value)}
			/>
			<label style={styles.label} htmlFor={`${idPrefix}-confirm`}>
				Confirm password
			</label>
			<input
				id={`${idPrefix}-confirm`}
				style={styles.input}
				type="password"
				value={confirm}
				maxLength={PASSWORD_MAX}
				autoComplete="new-password"
				onChange={(e) => setConfirm(e.target.value)}
			/>
		</>
	);

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
					login. Your game account name comes from your KBVE username.
				</p>
			)}

			{phase === 'no-kbve-username' && (
				<p style={styles.muted}>
					Set a KBVE username first — the game account name is derived
					from it, so there is nothing to build one out of yet.
				</p>
			)}

			{phase === 'none' && (
				<div style={styles.stack}>
					<span style={styles.name}>{suggested ?? '—'}</span>
					<p style={styles.muted}>
						Your game account name comes from your KBVE username,
						uppercased and cut to the 16 characters the 3.3.5a login
						box accepts. If someone shortened to the same name
						first, yours picks up a number.
					</p>
					{passwordFields('wow-new-account')}
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

			{phase === 'claimed' && account && (
				<div style={styles.stack}>
					<span style={styles.name}>{account.username}</span>
					<p style={styles.muted}>
						This name is reserved for you, but the account was never
						finished — the realm database could not be reached on
						the last attempt. Retrying is safe.
					</p>
					{passwordFields('wow-retry')}
					<div style={styles.row}>
						<button
							style={styles.button}
							disabled={busy}
							onClick={() => void onCreate()}>
							{busy ? 'Creating…' : 'Finish setup'}
						</button>
						<button
							style={styles.buttonGhost}
							disabled={busy}
							onClick={() => void onRelease()}>
							Release the name
						</button>
					</div>
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
							{passwordFields('wow-reset')}
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
