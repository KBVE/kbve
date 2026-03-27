import { useEffect, useState } from 'react';
import { authBridge } from '@/components/auth';
import { cn } from '@/lib/utils';

export default function ReactAuthLogout() {
	const [message, setMessage] = useState('Signing out...');
	const [subMessage, setSubMessage] = useState('Please wait');
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const handleLogout = async () => {
			let success = true;

			// Each step is independent — failures must not block subsequent cleanup.
			try {
				await authBridge.signOut();
				console.log('[Logout] AuthBridge sign-out complete');
			} catch (err) {
				console.log('[Logout] signOut skipped:', err);
			}

			try {
				await authBridge.destroy();
				console.log('[Logout] AuthBridge destroyed');
			} catch (err) {
				console.warn('[Logout] destroy error:', err);
				success = false;
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

			// Always redirect — even if cleanup partially failed
			setIsLoading(false);
			setMessage(
				success
					? 'Signed out successfully'
					: 'Sign-out completed with warnings',
			);
			setSubMessage('Redirecting to home...');
			setTimeout(() => {
				window.location.href = '/?_=' + Date.now();
			}, 500);
		};

		handleLogout();
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
