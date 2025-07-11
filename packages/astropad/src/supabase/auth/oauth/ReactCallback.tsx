/** @jsxImportSource react */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { oauthService, supabase } from '@kbve/astropad';
import { FixedSizeList as List } from "react-window";


// Hide skeleton loader when component mounts
const hideSkeleton = () => {
	const skeleton = document.querySelector(
		'[data-skeleton="callback"]',
	) as HTMLElement;
	if (skeleton) {
		skeleton.style.display = 'none';
	}
};

// Authentication step types
interface AuthStep {
	id: string;
	title: string;
	status: 'pending' | 'active' | 'completed' | 'failed';
	message?: string;
	timestamp?: number;
}

// Enhanced StepItem for log-based timeline
const StepItem = ({ index, style, data }: { index: number; style: any; data: AuthStep[] }) => {
	const step = data[index];
	
	const statusEmoji = {
		pending: '🟡',
		active: '🔄',
		completed: '✅',
		failed: '❌',
	}[step.status];

	const color = {
		pending: 'text-yellow-400',
		active: 'text-blue-400',
		completed: 'text-green-400',
		failed: 'text-red-400',
	}[step.status];

	return (
		<div style={style} className="px-4 py-2">
			<div className="flex items-start gap-3">
				<span className={`text-xl mt-1 ${color}`}>{statusEmoji}</span>
				<div className="flex-1">
					<div className={`text-sm font-medium ${color}`}>{step.title}</div>
					{step.message && (
						<div className="text-xs text-zinc-400 mt-1">{step.message}</div>
					)}
				</div>
			</div>
		</div>
	);
};

// Internal component that handles all the auth processing
const AuthProcessor = React.memo(() => {
	const loading = useStore(oauthService.loadingAtom);
	const error = useStore(oauthService.errorAtom);
	const success = useStore(oauthService.successAtom);

	const [fallbackAttempts, setFallbackAttempts] = useState(0);
	const [timeoutReached, setTimeoutReached] = useState(false);
	const [authSteps, setAuthSteps] = useState<AuthStep[]>([]);

	const authSubscriptionRef = useRef<any>(null);
	const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Log utility function - adds new steps to the timeline
	const log = useCallback((title: string, status: AuthStep['status'], message?: string) => {
		setAuthSteps(prev => [...prev, {
			id: crypto.randomUUID(),
			title,
			status,
			message,
			timestamp: Date.now(),
		}]);
	}, []);

	// Primary OAuth callback processing
	const handleCallback = useCallback(async () => {
		try {
			log('Primary OAuth callback started', 'active', 'Processing primary callback...');
			await oauthService.handleAuthCallback();
			// Note: Success will be handled by the useEffect watching success state
		} catch (err: any) {
			console.error('Primary OAuth callback error:', err);
			log('Primary OAuth callback failed', 'failed', err.message);
		}
	}, [log]);

	// Fallback timeout redirect
	const fallbackTimeoutRedirect = useCallback(() => {
		setTimeoutReached(true);
		log('Authentication timeout reached', 'failed', 'Redirecting to login...');

		oauthService.errorAtom.set(
			'Authentication callback timed out. Please try signing in again.',
		);

		setTimeout(() => {
			window.location.href = `${window.location.origin}/login/`;
		}, 3000);
	}, [log]);

	// Fallback URL params check
	const fallbackUrlParamsCheck = useCallback(async () => {
		try {
			log('URL parameters check started', 'active', 'Checking URL parameters...');

			const url = new URL(window.location.href);
			const accessToken = url.searchParams.get('access_token');
			const refreshToken = url.searchParams.get('refresh_token');

			if (accessToken && refreshToken) {
				log('Tokens found in URL', 'active', 'Setting session with URL tokens...');

				const { data, error } = await supabase.auth.setSession({
					access_token: accessToken,
					refresh_token: refreshToken,
				});

				if (error) throw error;

				if (data.session) {
					log('Session restored from URL tokens', 'completed', 'Authentication successful!');
					oauthService.successAtom.set(
						'Session restored from URL tokens! Redirecting...',
					);
					setTimeout(() => {
						window.location.href = `${window.location.origin}/profile/`;
					}, 1000);
				}
			} else {
				log('No tokens found in URL', 'failed', 'URL parameters check failed');

				// Try final fallback after delay
				setTimeout(() => {
					fallbackTimeoutRedirect();
				}, 3000);
			}
		} catch (err: any) {
			console.error('URL params fallback error:', err);
			log('URL parameters check failed', 'failed', err.message);

			setTimeout(() => {
				fallbackTimeoutRedirect();
			}, 2000);
		}
	}, [log, fallbackTimeoutRedirect]);

	// Fallback session check
	const fallbackSessionCheck = useCallback(async () => {
		if (fallbackAttempts >= 3) {
			log('Max fallback attempts reached', 'failed', 'Stopping further attempts');
			return;
		}

		try {
			setFallbackAttempts((prev) => prev + 1);
			log(`Direct session check #${fallbackAttempts + 1} started`, 'active', 'Checking session directly...');

			const {
				data: { session },
				error,
			} = await supabase.auth.getSession();

			if (error) throw error;

			if (session) {
				log('Session found via direct check', 'completed', 'Authentication successful!');
				oauthService.successAtom.set(
					'Session found via fallback! Redirecting...',
				);
				setTimeout(() => {
					window.location.href = `${window.location.origin}/profile/`;
				}, 1000);
			} else {
				log(`Direct session check #${fallbackAttempts + 1} failed`, 'failed', 'No session found, trying next fallback...');

				// Try next fallback after a delay
				setTimeout(() => {
					fallbackUrlParamsCheck();
				}, 2000);
			}
		} catch (err: any) {
			console.error(`Fallback ${fallbackAttempts + 1} error:`, err);
			log(`Direct session check #${fallbackAttempts + 1} failed`, 'failed', err.message);

			// Try next fallback after a delay
			setTimeout(() => {
				fallbackUrlParamsCheck();
			}, 2000);
		}
	}, [fallbackAttempts, log, fallbackUrlParamsCheck]);

	// Fallback auth subscription listener
	const fallbackAuthSubscription = useCallback(() => {
		if (authSubscriptionRef.current) return; // Prevent multiple subscriptions

		log('Auth state listener started', 'active', 'Setting up auth state listener...');

		const subscription = supabase.auth.onAuthStateChange(
			(event, session) => {
				console.log('Auth state change detected:', event, session);

				if (event === 'SIGNED_IN' && session) {
					log('Auth state change: Sign-in detected', 'completed', 'Authentication successful!');
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
					log('Auth state change: Sign-out detected', 'failed', 'Auth subscription detected sign-out or failed refresh...');
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
				log('Auth state listener timeout', 'failed', 'No auth change detected, trying next fallback...');
				fallbackSessionCheck();
			}
		}, 5000);
	}, [log, fallbackSessionCheck]);

	// Initialize auth processing on component mount
	useEffect(() => {
		log('OAuth callback processor initialized', 'active', 'Starting authentication process...');
		
		// Start watching auth state changes as a fallback mechanism
		oauthService.watchAuthState();
		handleCallback();

		// Set up fallback timer - if primary callback doesn't work within 6 seconds, start auth subscription fallback
		fallbackTimerRef.current = setTimeout(() => {
			// Check current state without causing re-renders
			const currentSuccess = oauthService.successAtom.get();
			const currentError = oauthService.errorAtom.get();

			if (!currentSuccess && !currentError) {
				log('Primary callback timeout', 'failed', 'Primary callback taking too long, starting fallback...');
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
	}, [handleCallback, fallbackAuthSubscription, log]);

	// Handle loading state changes
	useEffect(() => {
		if (loading) {
			// If we're loading and no step is active, make sure we have an initial log entry
			if (authSteps.length === 0) {
				log('Authentication loading', 'active', 'Initializing authentication...');
			}
		}
	}, [loading, authSteps, log]);

	// Handle error state changes - start fallback on error
	useEffect(() => {
		if (error && !timeoutReached) {
			log('Error detected, starting fallback', 'failed', 'Primary authentication failed, starting fallback sequence...');
			// On error, start fallback sequence after a delay, beginning with auth subscription
			setTimeout(() => {
				fallbackAuthSubscription();
			}, 2000);
		}
	}, [error, timeoutReached, fallbackAuthSubscription, log]);

	// Handle success state changes - complete primary step
	useEffect(() => {
		if (success) {
			log('Primary OAuth callback completed', 'completed', 'Authentication successful!');
		}
	}, [success, log]);

	// Handle error state changes - log error
	useEffect(() => {
		if (error) {
			log('OAuth callback error', 'failed', error);
		}
	}, [error, log]);
	// Render the stable UI - just the log timeline
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
			style={{ backgroundColor: 'var(--backdrop-color)' }}>
			<div className="w-full max-w-md h-[480px] p-4 rounded-xl flex flex-col"
				style={{
					backgroundColor: 'var(--sl-color-gray-6)',
					color: 'var(--sl-color-white)',
					border: '1px solid var(--sl-color-gray-5)',
				}}>
				<div className="text-sm font-semibold mb-2 opacity-80">
					Authentication Log:
				</div>
				<List
					height={400}
					itemCount={authSteps.length}
					itemSize={52}
					itemData={authSteps}
					width="100%">
					{StepItem}
				</List>
			</div>
		</div>
	);});

// Main stable component that never re-renders
export const ReactCallback = () => {
	useEffect(() => {
		hideSkeleton();
	}, []);

	return <AuthProcessor />;
};
