import { useEffect, useState } from 'react';
import { authBridge, initSupa, getSupa } from '@/lib/supa';

export default function ReactAuthCallback() {
	const [message, setMessage] = useState('Completing sign-in...');
	const [subMessage, setSubMessage] = useState('Please wait');
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const handleCallback = async () => {
			try {
				const session = await authBridge.handleCallback();

				if (session) {
					await initSupa();
					const supa = getSupa();
					await supa.getSession();

					await new Promise((resolve) => setTimeout(resolve, 500));
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
		<div className="ck-auth-status">
			{isLoading && <div className="ck-spinner"></div>}
			<div className="ck-status-message">{message}</div>
			<div className="ck-status-sub">{subMessage}</div>
		</div>
	);
}
