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

				// Try to sign out from AuthBridge first (window client)
				try {
					await authBridge.signOut();
					console.log('[Logout] AuthBridge sign-out complete');
				} catch (err) {
					console.log(
						'[Logout] AuthBridge sign-out skipped (no session):',
						err,
					);
				}

				// DON'T initialize SharedWorker - we need to keep it closed so IndexedDB can be deleted
				console.log(
					'[Logout] Skipping SharedWorker initialization to allow IndexedDB deletion',
				);

				// Wait a moment for any active connections to close
				await new Promise((resolve) => setTimeout(resolve, 100));

				// Clear IndexedDB manually to ensure session is gone
				console.log('[Logout] Clearing IndexedDB...');

				// First, list all databases
				if ('databases' in indexedDB) {
					const dbs = await indexedDB.databases();
					console.log(
						'[Logout] Existing databases:',
						dbs.map((db) => db.name),
					);
				}

				// Delete the auth database completely
				try {
					await new Promise((resolve, reject) => {
						const deleteRequest =
							indexedDB.deleteDatabase('sb-auth-v2');
						deleteRequest.onsuccess = () => {
							console.log(
								'[Logout] Successfully deleted IndexedDB: sb-auth-v2',
							);
							resolve(true);
						};
						deleteRequest.onerror = () => {
							console.error(
								'[Logout] Error deleting sb-auth-v2:',
								deleteRequest.error,
							);
							reject(deleteRequest.error);
						};
						deleteRequest.onblocked = () => {
							console.warn(
								'[Logout] IndexedDB sb-auth-v2 deletion blocked - trying to continue anyway',
							);
							// Wait a bit and resolve anyway
							setTimeout(() => resolve(true), 200);
						};
					});
				} catch (err) {
					console.warn('[Logout] Failed to clear sb-auth-v2:', err);
				}

				// Verify deletion
				if ('databases' in indexedDB) {
					const dbsAfter = await indexedDB.databases();
					console.log(
						'[Logout] Remaining databases after deletion:',
						dbsAfter.map((db) => db.name),
					);
				}

				// Also clear localStorage as a precaution
				Object.keys(localStorage).forEach((key) => {
					if (key.includes('supabase') || key.includes('sb-')) {
						localStorage.removeItem(key);
						console.log(`[Logout] Cleared localStorage: ${key}`);
					}
				});

				// Success! Show message
				setIsLoading(false);
				setMessage('Signed out successfully');
				setSubMessage('Redirecting to home...');

				console.log(
					'[Logout] Sign-out complete! Redirecting to home page...',
				);

				// Wait a moment to show the success message, then redirect
				setTimeout(() => {
					window.location.href = '/?_=' + Date.now();
				}, 500);
			} catch (error) {
				console.error('[Logout] Sign-out error:', error);
				setIsLoading(false);
				setMessage('Sign-out error occurred');
				setSubMessage('Redirecting to home...');

				// Even on error, redirect to home after a moment
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
