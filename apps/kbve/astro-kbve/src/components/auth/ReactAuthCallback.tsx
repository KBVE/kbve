import { useEffect, useState } from 'react';
import { authBridge } from '@/components/auth';
import { initSupa, getSupa } from '@/lib/supa';
import { cn } from '@/lib/utils';

export default function ReactAuthCallback() {
	const [message, setMessage] = useState('Completing sign-in...');
	const [subMessage, setSubMessage] = useState('Please wait');
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const handleCallback = async () => {
			try {
				// Handle the OAuth callback — stores session in IndexedDB
				const session = await Promise.race([
					authBridge.handleCallback(),
					new Promise<null>((_, reject) =>
						setTimeout(
							() => reject(new Error('Auth callback timed out')),
							10_000,
						),
					),
				]);

				if (session) {
					// Initialize the SharedWorker so it picks up the session
					await initSupa();
					const supa = getSupa();

					// Retry getSession to bridge IDB write → worker read race.
					// The worker may not have picked up the IDB session yet.
					let workerSession = await supa
						.getSession()
						.catch(() => null);
					if (!workerSession?.session) {
						await new Promise((r) => setTimeout(r, 300));
						workerSession = await supa
							.getSession()
							.catch(() => null);
					}

					// Connect WebSocket (non-fatal)
					try {
						await supa.connectWebSocket();
					} catch {
						// WebSocket failure should never block auth
					}

					window.location.href = '/';
				} else {
					setIsLoading(false);
					setMessage('Authentication failed');
					setSubMessage('Redirecting...');
					setTimeout(() => {
						window.location.href = '/';
					}, 2000);
				}
			} catch (error) {
				console.error('Auth callback error:', error);
				setIsLoading(false);
				setMessage('Authentication failed');
				setSubMessage('Redirecting...');
				setTimeout(() => {
					window.location.href = '/';
				}, 2000);
			}
		};

		handleCallback();
	}, []);

	return (
		<div
			className={cn(
				'auth-container',
				'min-h-[200px] sm:min-h-[250px] md:min-h-[300px]',
				'flex flex-col items-center justify-center',
			)}>
			{isLoading && <div className="spinner"></div>}
			<div className="message">{message}</div>
			<div className="sub-message">{subMessage}</div>
		</div>
	);
}
