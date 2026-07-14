import { useEffect, useState } from 'react';
import { authBridge, initSupa, getSupa } from '@/lib/supa';

export default function ReactAuthCallback() {
	const [message, setMessage] = useState('Completing sign-in...');
	const [subMessage, setSubMessage] = useState('Please wait');
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const handleCallback = async () => {
			try {
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
					await initSupa();
					const supa = getSupa();

					let workerSession = await supa
						.getSession()
						.catch(() => null);
					if (!workerSession?.session) {
						await new Promise((r) => setTimeout(r, 300));
						workerSession = await supa
							.getSession()
							.catch(() => null);
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
		<div className="ct-auth-status">
			{isLoading && <div className="ct-spinner"></div>}
			<div className="ct-status-message">{message}</div>
			<div className="ct-status-sub">{subMessage}</div>
		</div>
	);
}
