import { useEffect, useState } from 'react';
import { authBridge } from '@/components/auth';
import { cn } from '@/lib/utils';

const DESKTOP_REDIRECT_KEY = 'kbve_desktop_redirect';
const ALLOWED_PROVIDERS = ['github', 'twitch', 'discord'] as const;
type AllowedProvider = (typeof ALLOWED_PROVIDERS)[number];

function parseRedirect(raw: string | null): string | null {
	if (!raw) return null;
	try {
		const u = new URL(raw);
		if (u.protocol === 'http:' && u.hostname === '127.0.0.1')
			return u.toString();
		if (u.protocol === 'http:' && u.hostname === 'localhost')
			return u.toString();
		if (u.protocol === 'kbve:') return u.toString();
	} catch {
		// not a valid URL
	}
	return null;
}

export default function ReactDesktopBouncer() {
	const [message, setMessage] = useState('Preparing sign-in...');
	const [subMessage, setSubMessage] = useState('Please wait');
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const run = async () => {
			const params = new URLSearchParams(window.location.search);
			const providerRaw = (params.get('provider') ?? '').toLowerCase();
			const redirectRaw = params.get('redirect');

			if (!ALLOWED_PROVIDERS.includes(providerRaw as AllowedProvider)) {
				setError(`Unsupported provider: ${providerRaw || '(missing)'}`);
				setMessage('Sign-in cancelled');
				setSubMessage('Close this tab and try again from the game.');
				return;
			}

			const redirect = parseRedirect(redirectRaw);
			if (!redirect) {
				setError('Invalid or missing redirect target');
				setMessage('Sign-in cancelled');
				setSubMessage('Close this tab and try again from the game.');
				return;
			}

			try {
				sessionStorage.setItem(DESKTOP_REDIRECT_KEY, redirect);
			} catch {
				// storage blocked — bouncer still works without it (callback falls back to /)
			}

			setMessage(`Redirecting to ${providerRaw}...`);
			setSubMessage(
				'You will be sent back to the game once you sign in.',
			);

			try {
				await authBridge.signInWithOAuth(
					providerRaw as AllowedProvider,
				);
			} catch (err) {
				console.error('[desktop-bouncer] signInWithOAuth failed', err);
				setError(String((err as Error)?.message ?? err));
				setMessage('Sign-in failed');
				setSubMessage('Close this tab and try again from the game.');
			}
		};
		run();
	}, []);

	return (
		<div
			className={cn(
				'auth-container',
				'min-h-[200px] sm:min-h-[250px] md:min-h-[300px]',
				'flex flex-col items-center justify-center',
			)}>
			{!error && <div className="spinner"></div>}
			<div className="message">{message}</div>
			<div className="sub-message">{subMessage}</div>
			{error && <div className="sub-message">{error}</div>}
		</div>
	);
}
