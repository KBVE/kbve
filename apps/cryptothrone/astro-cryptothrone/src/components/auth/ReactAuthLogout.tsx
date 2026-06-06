import { useEffect, useState } from 'react';
import { authBridge } from '@/lib/supa';

export default function ReactAuthLogout() {
	const [message, setMessage] = useState('Signing out...');
	const [subMessage, setSubMessage] = useState('Please wait');
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const handleLogout = async () => {
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

			try {
				Object.keys(localStorage).forEach((key) => {
					if (key.includes('supabase') || key.includes('sb-')) {
						localStorage.removeItem(key);
					}
				});
			} catch (err) {
				console.warn('[Logout] localStorage cleanup error:', err);
			}

			setIsLoading(false);
			setMessage('Signed out successfully');
			setSubMessage('Returning to the realm...');
			setTimeout(() => {
				window.location.href = '/?_=' + Date.now();
			}, 500);
		};

		handleLogout();
	}, []);

	return (
		<div className="ct-auth-status">
			{isLoading && <div className="ct-spinner"></div>}
			<div className="ct-status-message">{message}</div>
			<div className="ct-status-sub">{subMessage}</div>
		</div>
	);
}
