import { useEffect, useState } from 'react';
import { authBridge } from '@/lib/auth';

export default function ReactAuthLogout() {
	const [message, setMessage] = useState('Signing out...');
	const [subMessage, setSubMessage] = useState('Please wait');
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const handleLogout = async () => {
			try {
				try {
					await authBridge.signOut();
				} catch (err) {
					console.log('[Logout] signOut skipped:', err);
				}

				try {
					await authBridge.destroy();
				} catch (err) {
					console.warn('[Logout] destroy error:', err);
				}

				Object.keys(localStorage).forEach((key) => {
					if (key.includes('supabase') || key.includes('sb-')) {
						localStorage.removeItem(key);
					}
				});

				setIsLoading(false);
				setMessage('Signed out successfully');
				setSubMessage('Returning to the realm...');

				setTimeout(() => {
					window.location.href = '/?_=' + Date.now();
				}, 500);
			} catch (error) {
				console.error('[Logout] error:', error);
				setIsLoading(false);
				setMessage('Sign-out error occurred');
				setSubMessage('Returning to the realm...');

				setTimeout(() => {
					window.location.href = '/?_=' + Date.now();
				}, 1000);
			}
		};

		handleLogout();
	}, []);

	return (
		<div className="ck-auth-status">
			{isLoading && <div className="ck-spinner"></div>}
			<div className="ck-status-message">{message}</div>
			<div className="ck-status-sub">{subMessage}</div>
		</div>
	);
}
