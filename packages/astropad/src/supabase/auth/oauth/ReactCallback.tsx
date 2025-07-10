/** @jsxImportSource react */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { oauthService, supabase } from '@kbve/astropad';

// Hide skeleton loader when component mounts
const hideSkeleton = () => {
	const skeleton = document.querySelector(
		'[data-skeleton="callback"]',
	) as HTMLElement;
	if (skeleton) {
		skeleton.style.display = 'none';
	}
};

// Internal component that handles all the auth processing
const AuthProcessor = React.memo(() => {
	const loading = useStore(oauthService.loadingAtom);
	const error = useStore(oauthService.errorAtom);
	const success = useStore(oauthService.successAtom);

	const [fallbackAttempts, setFallbackAttempts] = useState(0);
	const [fallbackStatus, setFallbackStatus] = useState<string>('');
	const [timeoutReached, setTimeoutReached] = useState(false);
	const authSubscriptionRef = useRef<any>(null);
	const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Primary OAuth callback processing
	const handleCallback = useCallback(async () => {
		try {
			setFallbackStatus('Processing primary callback...');
			await oauthService.handleAuthCallback();
		} catch (err: any) {
			console.error('Primary OAuth callback error:', err);
			setFallbackStatus(
				'Primary callback failed, activating fallbacks...',
			);
		}
	}, []);

	// Fallback timeout redirect
	const fallbackTimeoutRedirect = useCallback(() => {
		setTimeoutReached(true);
		setFallbackStatus(
			'Authentication timeout reached. Redirecting to login...',
		);

		oauthService.errorAtom.set(
			'Authentication callback timed out. Please try signing in again.',
		);

		setTimeout(() => {
			window.location.href = `${window.location.origin}/login/`;
		}, 3000);
	}, []);

	// Fallback URL params check
	const fallbackUrlParamsCheck = useCallback(async () => {
		try {
			setFallbackStatus('Fallback: Checking URL parameters...');

			const url = new URL(window.location.href);
			const accessToken = url.searchParams.get('access_token');
			const refreshToken = url.searchParams.get('refresh_token');

			if (accessToken && refreshToken) {
				setFallbackStatus('Found tokens in URL, setting session...');

				const { data, error } = await supabase.auth.setSession({
					access_token: accessToken,
					refresh_token: refreshToken,
				});

				if (error) throw error;

				if (data.session) {
					oauthService.successAtom.set(
						'Session restored from URL tokens! Redirecting...',
					);
					setTimeout(() => {
						window.location.href = `${window.location.origin}/profile/`;
					}, 1000);
				}
			} else {
				setFallbackStatus('No auth tokens found in URL...');

				// Try final fallback after delay
				setTimeout(() => {
					fallbackTimeoutRedirect();
				}, 3000);
			}
		} catch (err: any) {
			console.error('URL params fallback error:', err);
			setFallbackStatus(
				'URL fallback failed, initiating timeout redirect...',
			);

			setTimeout(() => {
				fallbackTimeoutRedirect();
			}, 2000);
		}
	}, [fallbackTimeoutRedirect]);

	// Fallback session check
	const fallbackSessionCheck = useCallback(async () => {
		if (fallbackAttempts >= 3) return; // Limit fallback attempts

		try {
			setFallbackAttempts((prev) => prev + 1);
			setFallbackStatus(
				`Fallback ${fallbackAttempts + 1}: Checking session directly...`,
			);

			const {
				data: { session },
				error,
			} = await supabase.auth.getSession();

			if (error) throw error;

			if (session) {
				oauthService.successAtom.set(
					'Session found via fallback! Redirecting...',
				);
				setTimeout(() => {
					window.location.href = `${window.location.origin}/profile/`;
				}, 1000);
			} else {
				setFallbackStatus(
					`Fallback ${fallbackAttempts + 1}: No session found, trying next fallback...`,
				);

				// Try next fallback after a delay
				setTimeout(() => {
					fallbackUrlParamsCheck();
				}, 2000);
			}
		} catch (err: any) {
			console.error(`Fallback ${fallbackAttempts + 1} error:`, err);
			setFallbackStatus(
				`Fallback ${fallbackAttempts + 1} failed, trying next...`,
			);

			// Try next fallback after a delay
			setTimeout(() => {
				fallbackUrlParamsCheck();
			}, 2000);
		}
	}, [fallbackAttempts, fallbackUrlParamsCheck]);

	// Fallback auth subscription listener
	const fallbackAuthSubscription = useCallback(() => {
		if (authSubscriptionRef.current) return; // Prevent multiple subscriptions

		setFallbackStatus('Fallback: Setting up auth state listener...');

		const subscription = supabase.auth.onAuthStateChange(
			(event, session) => {
				console.log('Auth state change detected:', event, session);

				if (event === 'SIGNED_IN' && session) {
					setFallbackStatus(
						'Auth subscription detected sign-in! Redirecting...',
					);
					oauthService.successAtom.set(
						'Authentication successful via subscription! Redirecting...',
					);

					// Clean up subscription
					if (authSubscriptionRef.current) {
						authSubscriptionRef.current.data.subscription.unsubscribe();
						authSubscriptionRef.current = null;
					}

					setTimeout(() => {
						window.location.href = `${window.location.origin}/profile/`;
					}, 1000);
				} else if (
					event === 'SIGNED_OUT' ||
					(event === 'TOKEN_REFRESHED' && !session)
				) {
					setFallbackStatus(
						'Auth subscription detected sign-out or failed refresh...',
					);
					// Continue to next fallback
					setTimeout(() => {
						fallbackSessionCheck();
					}, 2000);
				}
			},
		);

		authSubscriptionRef.current = subscription;

		// Set a timeout for this fallback - if no auth change within 5 seconds, try next fallback
		setTimeout(() => {
			if (authSubscriptionRef.current) {
				setFallbackStatus(
					'Auth subscription timeout, trying direct session check...',
				);
				fallbackSessionCheck();
			}
		}, 5000);
	}, [fallbackSessionCheck]);

	// Initialize auth processing on component mount
	useEffect(() => {
		// Start watching auth state changes as a fallback mechanism
		oauthService.watchAuthState();
		handleCallback();

		// Set up fallback timer - if primary callback doesn't work within 6 seconds, start auth subscription fallback
		fallbackTimerRef.current = setTimeout(() => {
			// Check current state without causing re-renders
			const currentSuccess = oauthService.successAtom.get();
			const currentError = oauthService.errorAtom.get();

			if (!currentSuccess && !currentError) {
				setFallbackStatus(
					'Primary callback taking too long, starting auth subscription fallback...',
				);
				fallbackAuthSubscription();
			}
		}, 6000);

		// Cleanup function
		return () => {
			oauthService.unwatchAuthState();
			if (fallbackTimerRef.current) {
				clearTimeout(fallbackTimerRef.current);
			}
			// Clean up auth subscription if it exists
			if (authSubscriptionRef.current) {
				authSubscriptionRef.current.data.subscription.unsubscribe();
				authSubscriptionRef.current = null;
			}
		};
	}, [handleCallback, fallbackAuthSubscription]);

	// Handle error state changes - start fallback on error
	useEffect(() => {
		if (error && !timeoutReached) {
			// On error, start fallback sequence after a delay, beginning with auth subscription
			setTimeout(() => {
				fallbackAuthSubscription();
			}, 2000);
		}
	}, [error, timeoutReached, fallbackAuthSubscription]);

	// Render the stable UI
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
			style={{ backgroundColor: 'var(--backdrop-color)' }}>
			<div
				className="rounded-xl shadow-lg p-8 max-w-sm w-full flex flex-col items-center relative backdrop-blur-md"
				style={{
					backgroundColor: 'var(--sl-color-gray-6)',
					color: 'var(--sl-color-white)',
					border: '1px solid var(--sl-color-gray-5)',
				}}>
				{loading && (
					<>
						<div
							className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 mb-4"
							style={{
								borderTopColor: 'var(--sl-color-accent)',
								borderBottomColor: 'var(--sl-color-accent)',
							}}></div>
						<div className="text-lg font-semibold mb-2">
							Processing OAuth callback…
						</div>
						<div className="text-sm opacity-80">
							Please wait while we complete your authentication.
						</div>
						{fallbackStatus && (
							<div className="text-xs opacity-60 mt-3 text-center">
								{fallbackStatus}
							</div>
						)}
						{fallbackAttempts && fallbackAttempts > 0 && (
							<div className="text-xs opacity-40 mt-1">
              
								Fallback attempt: {fallbackAttempts}/3
							</div>
						)}
					</>
				)}
				{!loading && success && (
					<>
						<div className="text-4xl mb-4">✅</div>
						<div className="text-lg font-semibold mb-2 text-green-400">
							{success}
						</div>
						<div className="text-sm opacity-80">
							You will be redirected automatically.
						</div>
					</>
				)}
				{!loading && error && (
					<>
						<div className="text-4xl mb-4">❌</div>
						<div className="text-lg font-semibold mb-2 text-red-400">
							{error}
						</div>
						<div className="text-sm opacity-80">
							You will be redirected to the login page.
						</div>
						{fallbackStatus && (
							<div className="text-xs opacity-60 mt-3 text-center border-t border-gray-500 pt-3">
								<strong>Fallback Status:</strong>
								<br />
								{fallbackStatus}
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
});

// Main stable component that never re-renders
export const ReactCallback = () => {
	useEffect(() => {
		hideSkeleton();
	}, []);

	return <AuthProcessor />;
};
