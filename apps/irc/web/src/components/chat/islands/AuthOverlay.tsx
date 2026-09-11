/** @jsxImportSource react */
import { useCallback, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	$authState,
	$authToken,
	$idbReady,
	$bootError,
	PROVIDERS,
	refreshAuth,
	setUsername,
	type OAuthProvider,
} from '../auth';

const USERNAME_REGEX = /^[a-z][a-z0-9_]*$/;

function validateUsername(raw: string): string | null {
	const v = raw.trim().toLowerCase();
	if (v.length < 3) return 'Must be at least 3 characters';
	if (v.length > 24) return 'Must be 24 characters or fewer';
	if (!USERNAME_REGEX.test(v))
		return 'Letters, numbers, underscores; must start with a letter';
	return null;
}

const LoginCard: React.FC = () => {
	const [loading, setLoading] = useState<OAuthProvider | null>(null);
	const idbReady = useStore($idbReady);
	const bootError = useStore($bootError);

	const handleLogin = useCallback(
		async (provider: OAuthProvider) => {
			if (!idbReady) return;
			setLoading(provider);
			try {
				const { authBridge } = await import('../../../lib/supa');
				await authBridge.signInWithOAuth(provider);
			} catch {
				setLoading(null);
			}
		},
		[idbReady],
	);

	const disabled = loading !== null || !idbReady;

	return (
		<div className="kbve-chat__overlay-card">
			<h2 className="kbve-chat__overlay-title">Sign in to chat</h2>
			<p className="kbve-chat__overlay-text">
				{bootError
					? `Boot error: ${bootError}`
					: idbReady
						? 'Pick a provider to join the IRC chat.'
						: 'Initializing chat infrastructure…'}
			</p>
			<div className="kbve-chat__overlay-actions">
				{PROVIDERS.map(({ id, label }) => (
					<button
						key={id}
						type="button"
						onClick={() => handleLogin(id)}
						disabled={disabled}
						className="kbve-chat__overlay-btn kbve-chat__overlay-btn--primary">
						{loading === id
							? 'Redirecting…'
							: !idbReady
								? `Waiting… (${label})`
								: `Continue with ${label}`}
					</button>
				))}
			</div>
		</div>
	);
};

const UsernameCard: React.FC = () => {
	const token = useStore($authToken);
	const [value, setValue] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [serverError, setServerError] = useState<string | null>(null);

	const normalized = value.trim().toLowerCase();
	const clientError = value.length > 0 ? validateUsername(value) : null;
	const canSubmit =
		!submitting && normalized.length >= 3 && clientError === null;

	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();
			if (!canSubmit || !token) return;
			setServerError(null);
			setSubmitting(true);
			const result = await setUsername(normalized, token);
			if (!result.ok) {
				setServerError(result.error);
				setSubmitting(false);
				return;
			}
			const next = await refreshAuth();
			if (next !== 'auth') {
				setServerError(
					'Username saved but session did not refresh. Try reloading.',
				);
				setSubmitting(false);
			}
		},
		[canSubmit, token, normalized],
	);

	return (
		<div className="kbve-chat__overlay-card">
			<h2 className="kbve-chat__overlay-title">Pick a username</h2>
			<p className="kbve-chat__overlay-text">
				One canonical username for every KBVE service. Letters, numbers,
				underscores. 3–24 characters.
			</p>
			<form
				onSubmit={handleSubmit}
				className="kbve-chat__overlay-actions">
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 6,
						padding: '10px 12px',
						background: 'var(--chat-elev-2)',
						border: '1px solid var(--sl-color-border)',
						borderRadius: 10,
					}}>
					<span style={{ color: 'var(--sl-color-gray-3)' }}>@</span>
					<input
						type="text"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder="your_handle"
						maxLength={24}
						autoFocus
						autoComplete="off"
						spellCheck={false}
						disabled={submitting || !token}
						style={{
							flex: 1,
							background: 'transparent',
							border: 'none',
							outline: 'none',
							color: 'var(--sl-color-text)',
							fontFamily: 'ui-monospace, monospace',
							fontSize: 14,
						}}
					/>
				</div>
				<div
					style={{
						fontSize: 12,
						color: clientError
							? '#ef4444'
							: 'var(--sl-color-gray-4)',
						textAlign: 'left',
						minHeight: 16,
					}}>
					{clientError ??
						'3–24 chars · letters, numbers, underscores'}
				</div>
				{serverError && (
					<div
						style={{
							fontSize: 12,
							color: '#ef4444',
							textAlign: 'left',
						}}>
						{serverError}
					</div>
				)}
				<button
					type="submit"
					disabled={!canSubmit || !token}
					className="kbve-chat__overlay-btn kbve-chat__overlay-btn--primary">
					{submitting ? 'Claiming…' : 'Claim username'}
				</button>
			</form>
		</div>
	);
};

const LoadingCard: React.FC = () => (
	<div className="kbve-chat__overlay-card">
		<div className="kbve-chat__spinner" style={{ margin: '0 auto 16px' }} />
		<p className="kbve-chat__overlay-text" style={{ margin: 0 }}>
			Connecting…
		</p>
	</div>
);

export const AuthOverlay: React.FC = () => {
	const state = useStore($authState);

	if (state === 'auth') return null;

	return (
		<div className="kbve-chat__overlay">
			{state === 'loading' && <LoadingCard />}
			{state === 'anon' && <LoginCard />}
			{state === 'no-username' && <UsernameCard />}
		</div>
	);
};
