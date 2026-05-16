/** @jsxImportSource react */
import { useCallback, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	$authState,
	$idbReady,
	$bootError,
	PROVIDERS,
	USERNAME_SETUP_URL,
	type OAuthProvider,
} from '../auth';

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

const UsernameCard: React.FC = () => (
	<div className="kbve-chat__overlay-card">
		<h2 className="kbve-chat__overlay-title">Pick a username first</h2>
		<p className="kbve-chat__overlay-text">
			IRC needs a canonical username before you can join. Set one once on
			your KBVE profile and it will follow you everywhere.
		</p>
		<div className="kbve-chat__overlay-actions">
			<a
				href={USERNAME_SETUP_URL}
				target="_blank"
				rel="noopener noreferrer"
				className="kbve-chat__overlay-btn kbve-chat__overlay-btn--primary">
				Set a username on kbve.com
			</a>
		</div>
	</div>
);

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
