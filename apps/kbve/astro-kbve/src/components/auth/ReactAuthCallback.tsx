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
				// Handle the OAuth callback - this stores session in IndexedDB
				const session = await authBridge.handleCallback();

				if (session) {
					// Session is now in IndexedDB
					// Initialize the SharedWorker so it picks up the session
					await initSupa();
					const supa = getSupa();

					// Force the worker to check the session
					await supa.getSession();

					// Connect WebSocket for real-time communication
					try {
						await supa.connectWebSocket();
						console.log(
							'[Auth Callback] WebSocket connection initiated',
						);
					} catch (wsError) {
						console.error(
							'[Auth Callback] Failed to connect WebSocket:',
							wsError,
						);
						// Non-fatal - continue with redirect
					}

					// Give the worker a moment to process
					await new Promise((resolve) => setTimeout(resolve, 500));

					// Success! Redirect to home
					window.location.href = '/';
				} else {
					// No session - show error
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
