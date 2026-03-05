import { useEffect, useState } from 'react';
import { authBridge, initSupa } from '../../lib/supa';

type Status = 'processing' | 'success' | 'error';

export default function CallbackHandler() {
	const [status, setStatus] = useState<Status>('processing');
	const [message, setMessage] = useState('Completing sign-in...');

	useEffect(() => {
		let cancelled = false;

		(async () => {
			try {
				const session = await authBridge.handleCallback();

				if (cancelled) return;

				if (session) {
					setStatus('success');
					setMessage('Signed in! Redirecting...');

					// Boot the gateway so syncAuthBridgeSession() propagates
					// the IDB session into $auth before we land on home.
					try {
						await initSupa();
					} catch {
						// Non-fatal — home page will retry
					}

					// Brief pause for IDB write + auth sync
					await new Promise((r) => setTimeout(r, 400));
					window.location.href = '/';
				} else {
					setStatus('error');
					setMessage('Authentication failed');
					setTimeout(() => {
						window.location.href = '/';
					}, 2000);
				}
			} catch (err) {
				console.error('Auth callback error:', err);
				if (cancelled) return;
				setStatus('error');
				setMessage('Authentication failed');
				setTimeout(() => {
					window.location.href = '/';
				}, 2000);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				minHeight: '60vh',
				flexDirection: 'column',
				gap: '16px',
			}}>
			{status === 'processing' && (
				<div
					style={{
						width: 48,
						height: 48,
						border: '4px solid var(--sl-color-gray-5, rgba(255,255,255,0.3))',
						borderTopColor: 'var(--sl-color-accent, #0ea5e9)',
						borderRadius: '50%',
						animation: 'spin 1s linear infinite',
					}}
				/>
			)}
			<p
				style={{
					fontSize: 18,
					color: 'var(--sl-color-white, #e2e8f0)',
					margin: 0,
				}}>
				{message}
			</p>
			{status === 'error' && (
				<p
					style={{
						fontSize: 14,
						color: 'var(--sl-color-gray-2, #a1a1aa)',
						margin: 0,
					}}>
					Redirecting...
				</p>
			)}
			<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
		</div>
	);
}
