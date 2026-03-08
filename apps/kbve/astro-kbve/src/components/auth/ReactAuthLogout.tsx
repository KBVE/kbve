import { useEffect, useState } from 'react';
import { authBridge } from '@/components/auth';
import { cn } from '@/lib/utils';

export default function ReactAuthLogout() {
	const [message, setMessage] = useState('Signing out...');
	const [subMessage, setSubMessage] = useState('Please wait');
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const handleLogout = async () => {
			try {
				console.log('[Logout] Starting sign-out process...');

				// Sign out via AuthBridge (tells Supabase to revoke the session)
				try {
					await authBridge.signOut();
					console.log('[Logout] AuthBridge sign-out complete');
				} catch (err) {
					console.log(
						'[Logout] AuthBridge sign-out skipped (no session):',
						err,
					);
				}

				// Clear all auth data from IndexedDB and close the local
				// Dexie connection. This avoids the race condition where
				// deleteDatabase() gets blocked by open connections held by
				// SharedWorker, DB workers, and WorkerCommunication.
				try {
					await authBridge.destroy();
					console.log(
						'[Logout] AuthBridge destroyed (IDB data cleared, connection closed)',
					);
				} catch (err) {
					console.warn('[Logout] AuthBridge destroy error:', err);
				}

				// Clear localStorage as a precaution
				Object.keys(localStorage).forEach((key) => {
					if (key.includes('supabase') || key.includes('sb-')) {
						localStorage.removeItem(key);
					}
				});

				setIsLoading(false);
				setMessage('Signed out successfully');
				setSubMessage('Redirecting to home...');

				setTimeout(() => {
					window.location.href = '/?_=' + Date.now();
				}, 500);
			} catch (error) {
				console.error('[Logout] Sign-out error:', error);
				setIsLoading(false);
				setMessage('Sign-out error occurred');
				setSubMessage('Redirecting to home...');

				setTimeout(() => {
					window.location.href = '/?_=' + Date.now();
				}, 1000);
			}
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
