/** @jsxImportSource react */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { oauthService, supabase } from '@kbve/astropad';
import { FixedSizeList as List } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";


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
	status: 'skeleton' | 'pending' | 'active' | 'completed' | 'failed';
	message?: string;
	timestamp?: number;
}

// Enhanced StepItem for log-based timeline with skeleton states
const StepItem = ({ index, style, data }: { index: number; style: any; data: AuthStep[] }) => {
	const step = data[index];
	
	if (step.status === 'skeleton') {
		return (
			<div style={style} className="px-4 py-2">
				<div className="flex items-start gap-3">
					<div className="w-6 h-6 bg-zinc-700 rounded-full animate-pulse mt-1"></div>
					<div className="flex-1">
						<div className="h-4 bg-zinc-700 rounded animate-pulse w-3/4"></div>
						<div className="h-3 bg-zinc-800 rounded animate-pulse w-1/2 mt-1"></div>
					</div>
				</div>
			</div>
		);
	}
	
	const statusEmoji = {
		pending: '🟡',
		active: '🔄',
		completed: '✅',
		failed: '❌',
	}[step.status] || '🔄';

	const color = {
		pending: 'text-yellow-400',
		active: 'text-blue-400',
		completed: 'text-green-400',
		failed: 'text-red-400',
	}[step.status] || 'text-blue-400';

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
	// Use stores to track different states
	const loading = useStore(oauthService.loadingAtom);
	const error = useStore(oauthService.errorAtom);
	const success = useStore(oauthService.successAtom);
	const provider = useStore(oauthService.providerAtom);

	const [fallbackAttempts, setFallbackAttempts] = useState(0);
	const [timeoutReached, setTimeoutReached] = useState(false);
	const [fallbackStates, setFallbackStates] = useState({
		authListener: 'skeleton' as AuthStep['status'],
		sessionCheck: 'skeleton' as AuthStep['status'],
		urlCheck: 'skeleton' as AuthStep['status'],
		timeout: 'skeleton' as AuthStep['status'],
	});

	const authSubscriptionRef = useRef<any>(null);
	const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Create dynamic auth steps based on current state
	const authSteps = useMemo((): AuthStep[] => {
		const steps: AuthStep[] = [];

		// Step 1: Initial loading state
		if (loading) {
			steps.push({
				id: 'loading',
				title: 'Processing OAuth callback',
				status: 'active',
				message: 'Authenticating with OAuth provider...',
				timestamp: Date.now(),
			});
		} else if (success) {
			steps.push({
				id: 'success',
				title: 'Authentication successful!',
				status: 'completed',
				message: success,
				timestamp: Date.now(),
			});
		} else if (error) {
			steps.push({
				id: 'error',
				title: 'Primary authentication failed',
				status: 'failed',
				message: error,
				timestamp: Date.now(),
			});
		} else {
			steps.push({
				id: 'init',
				title: 'Initializing OAuth callback',
				status: 'skeleton',
				message: 'Starting authentication process...',
				timestamp: Date.now(),
			});
		}

		// Step 2: Auth listener fallback
		if (fallbackStates.authListener !== 'skeleton') {
			steps.push({
				id: 'fallback-listener',
				title: 'Auth state listener',
				status: fallbackStates.authListener,
				message: fallbackStates.authListener === 'active' ? 'Setting up auth state listener...' : 
						fallbackStates.authListener === 'completed' ? 'Sign-in detected via listener!' :
						fallbackStates.authListener === 'failed' ? 'Auth listener timeout' : '',
				timestamp: Date.now(),
			});
		}

		// Step 3: Session check fallback
		if (fallbackStates.sessionCheck !== 'skeleton') {
			steps.push({
				id: 'fallback-session',
				title: `Session check ${fallbackAttempts > 0 ? `#${fallbackAttempts}` : ''}`,
				status: fallbackStates.sessionCheck,
				message: fallbackStates.sessionCheck === 'active' ? 'Checking session directly...' :
						fallbackStates.sessionCheck === 'completed' ? 'Session found!' :
						fallbackStates.sessionCheck === 'failed' ? 'No session found' : '',
				timestamp: Date.now(),
			});
		}

		// Step 4: URL parameters check
		if (fallbackStates.urlCheck !== 'skeleton') {
			steps.push({
				id: 'fallback-url',
				title: 'URL parameters check',
				status: fallbackStates.urlCheck,
				message: fallbackStates.urlCheck === 'active' ? 'Looking for auth tokens in URL...' :
						fallbackStates.urlCheck === 'completed' ? 'Session restored from URL!' :
						fallbackStates.urlCheck === 'failed' ? 'No tokens found in URL' : '',
				timestamp: Date.now(),
			});
		}

		// Step 5: Timeout handling
		if (fallbackStates.timeout !== 'skeleton') {
			steps.push({
				id: 'timeout',
				title: 'Timeout handling',
				status: fallbackStates.timeout,
				message: fallbackStates.timeout === 'failed' ? 'Authentication timeout - redirecting to login...' : '',
				timestamp: Date.now(),
			});
		}

		return steps;
	}, [loading, error, success, fallbackStates, fallbackAttempts]);

	// Helper to update fallback states
	const updateFallbackState = useCallback((key: keyof typeof fallbackStates, status: AuthStep['status']) => {
		setFallbackStates(prev => ({ ...prev, [key]: status }));
	}, []);

	// Primary OAuth callback processing
	const handleCallback = useCallback(async () => {
		try {
			await oauthService.handleAuthCallback();
			// Success is handled by the service and tracked via useStore
		} catch (err: any) {
			console.error('Primary OAuth callback error:', err);
			// Error is handled by the service and tracked via useStore
		}
	}, []);

	// Fallback timeout redirect
	const fallbackTimeoutRedirect = useCallback(() => {
		setTimeoutReached(true);
		updateFallbackState('timeout', 'failed');

		oauthService.errorAtom.set(
			'Authentication callback timed out. Please try signing in again.',
		);

		setTimeout(() => {
			window.location.href = `${window.location.origin}/login/`;
		}, 3000);
	}, [updateFallbackState]);

	// Fallback URL params check
	const fallbackUrlParamsCheck = useCallback(async () => {
		try {
			updateFallbackState('urlCheck', 'active');

			const url = new URL(window.location.href);
			const accessToken = url.searchParams.get('access_token');
			const refreshToken = url.searchParams.get('refresh_token');

			if (accessToken && refreshToken) {
				const { data, error } = await supabase.auth.setSession({
					access_token: accessToken,
					refresh_token: refreshToken,
				});

				if (error) throw error;

				if (data.session) {
					updateFallbackState('urlCheck', 'completed');
					oauthService.successAtom.set(
						'Session restored from URL tokens! Redirecting...',
					);
					// Delay redirect to show success state
					setTimeout(() => {
						window.location.href = `${window.location.origin}/profile/`;
					}, 2000);
				}
			} else {
				updateFallbackState('urlCheck', 'failed');
				// Try final fallback after delay
				setTimeout(() => {
					fallbackTimeoutRedirect();
				}, 3000);
			}
		} catch (err: any) {
			console.error('URL params fallback error:', err);
			updateFallbackState('urlCheck', 'failed');
			setTimeout(() => {
				fallbackTimeoutRedirect();
			}, 2000);
		}
	}, [updateFallbackState, fallbackTimeoutRedirect]);

	// Fallback session check
	const fallbackSessionCheck = useCallback(async () => {
		if (fallbackAttempts >= 3) {
			updateFallbackState('sessionCheck', 'failed');
			return;
		}

		try {
			setFallbackAttempts((prev) => prev + 1);
			updateFallbackState('sessionCheck', 'active');

			const {
				data: { session },
				error,
			} = await supabase.auth.getSession();

			if (error) throw error;

			if (session) {
				updateFallbackState('sessionCheck', 'completed');
				oauthService.successAtom.set(
					'Session found via fallback! Redirecting...',
				);
				// Delay redirect to show success state
				setTimeout(() => {
					window.location.href = `${window.location.origin}/profile/`;
				}, 2000);
			} else {
				updateFallbackState('sessionCheck', 'failed');
				// Try next fallback after a delay
				setTimeout(() => {
					fallbackUrlParamsCheck();
				}, 2000);
			}
		} catch (err: any) {
			console.error(`Fallback ${fallbackAttempts + 1} error:`, err);
			updateFallbackState('sessionCheck', 'failed');
			// Try next fallback after a delay
			setTimeout(() => {
				fallbackUrlParamsCheck();
			}, 2000);
		}
	}, [fallbackAttempts, updateFallbackState, fallbackUrlParamsCheck]);

	// Fallback auth subscription listener
	const fallbackAuthSubscription = useCallback(() => {
		if (authSubscriptionRef.current) return; // Prevent multiple subscriptions

		updateFallbackState('authListener', 'active');

		const subscription = supabase.auth.onAuthStateChange(
			(event, session) => {
				console.log('Auth state change detected:', event, session);

				if (event === 'SIGNED_IN' && session) {
					updateFallbackState('authListener', 'completed');
					oauthService.successAtom.set(
						'Authentication successful via subscription! Redirecting...',
					);

					// Clean up subscription
					if (authSubscriptionRef.current) {
						authSubscriptionRef.current.data.subscription.unsubscribe();
						authSubscriptionRef.current = null;
					}

					// Delay redirect to show success state
					setTimeout(() => {
						window.location.href = `${window.location.origin}/profile/`;
					}, 2000);
				} else if (
					event === 'SIGNED_OUT' ||
					(event === 'TOKEN_REFRESHED' && !session)
				) {
					updateFallbackState('authListener', 'failed');
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
				updateFallbackState('authListener', 'failed');
				fallbackSessionCheck();
			}
		}, 5000);
	}, [updateFallbackState, fallbackSessionCheck]);

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

	// Handle error state - start fallback sequence
	useEffect(() => {
		if (error && !timeoutReached) {
			// Start fallback sequence after a delay
			setTimeout(() => {
				fallbackAuthSubscription();
			}, 2000);
		}
	}, [error, timeoutReached, fallbackAuthSubscription]);

	// Render the stable UI - completely static, no re-renders
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
				<AutoSizer>
					{({ height, width }) => (
						<List
							className="List"
							height={height}
							itemCount={authSteps.length}
							itemSize={52}
							itemData={authSteps}
							width={width}>
							{StepItem}
						</List>
					)}
				</AutoSizer>
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
