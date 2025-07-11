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

// Step item component for react-window
const StepItem = ({ index, style, data }: { index: number; style: any; data: AuthStep[] }) => {
	const step = data[index];
	
	const getStatusIcon = (status: string) => {
		switch (status) {
			case 'completed':
				return '✅';
			case 'failed':
				return '❌';
			case 'active':
				return '🔄';
			default:
				return '⏳';
		}
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case 'completed':
				return 'text-green-400';
			case 'failed':
				return 'text-red-400';
			case 'active':
				return 'text-blue-400';
			default:
				return 'text-gray-400';
		}
	};

	return (
		<div style={style} className="px-4 py-2">
			<div className="flex items-center space-x-3">
				<div className="text-lg">{getStatusIcon(step.status)}</div>
				<div className="flex-1">
					<div className={`font-medium ${getStatusColor(step.status)}`}>
						{step.title}
					</div>
					{step.message && (
						<div className="text-xs opacity-70 mt-1">{step.message}</div>
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
	const [authSteps, setAuthSteps] = useState<AuthStep[]>([
		{ id: 'primary', title: 'Primary OAuth Callback', status: 'pending' },
		{ id: 'auth-subscription', title: 'Auth State Listener', status: 'pending' },
		{ id: 'session-check', title: 'Direct Session Check', status: 'pending' },
		{ id: 'url-params', title: 'URL Parameters Check', status: 'pending' },
		{ id: 'timeout', title: 'Timeout Redirect', status: 'pending' }
	]);

	const authSubscriptionRef = useRef<any>(null);
	const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Helper function to update step status
	const updateStep = useCallback((stepId: string, status: AuthStep['status'], message?: string) => {
		setAuthSteps(prev => prev.map(step => 
			step.id === stepId 
				? { ...step, status, message, timestamp: Date.now() }
				: step
		));
	}, []);

	// Helper function to activate step
	const activateStep = useCallback((stepId: string, message?: string) => {
		updateStep(stepId, 'active', message);
	}, [updateStep]);

	// Helper function to complete step
	const completeStep = useCallback((stepId: string, message?: string) => {
		updateStep(stepId, 'completed', message);
	}, [updateStep]);

	// Helper function to fail step
	const failStep = useCallback((stepId: string, message?: string) => {
		updateStep(stepId, 'failed', message);
	}, [updateStep]);

	// Primary OAuth callback processing
	const handleCallback = useCallback(async () => {
		try {
			activateStep('primary', 'Processing primary callback...');
			await oauthService.handleAuthCallback();
		} catch (err: any) {
			console.error('Primary OAuth callback error:', err);
			failStep('primary', 'Primary callback failed, activating fallbacks...');
		}
	}, [activateStep, failStep]);

	// Fallback timeout redirect
	const fallbackTimeoutRedirect = useCallback(() => {
		setTimeoutReached(true);
		activateStep('timeout', 'Authentication timeout reached. Redirecting to login...');

		oauthService.errorAtom.set(
			'Authentication callback timed out. Please try signing in again.',
		);

		setTimeout(() => {
			window.location.href = `${window.location.origin}/login/`;
		}, 3000);
	}, [activateStep]);

	// Fallback URL params check
	const fallbackUrlParamsCheck = useCallback(async () => {
		try {
			activateStep('url-params', 'Checking URL parameters...');

			const url = new URL(window.location.href);
			const accessToken = url.searchParams.get('access_token');
			const refreshToken = url.searchParams.get('refresh_token');

			if (accessToken && refreshToken) {
				updateStep('url-params', 'active', 'Found tokens in URL, setting session...');

				const { data, error } = await supabase.auth.setSession({
					access_token: accessToken,
					refresh_token: refreshToken,
				});

				if (error) throw error;

				if (data.session) {
					completeStep('url-params', 'Session restored from URL tokens!');
					oauthService.successAtom.set(
						'Session restored from URL tokens! Redirecting...',
					);
					setTimeout(() => {
						window.location.href = `${window.location.origin}/profile/`;
					}, 1000);
				}
			} else {
				failStep('url-params', 'No auth tokens found in URL...');

				// Try final fallback after delay
				setTimeout(() => {
					fallbackTimeoutRedirect();
				}, 3000);
			}
		} catch (err: any) {
			console.error('URL params fallback error:', err);
			failStep('url-params', 'URL fallback failed, initiating timeout redirect...');

			setTimeout(() => {
				fallbackTimeoutRedirect();
			}, 2000);
		}
	}, [activateStep, updateStep, completeStep, failStep, fallbackTimeoutRedirect]);

	// Fallback session check
	const fallbackSessionCheck = useCallback(async () => {
		if (fallbackAttempts >= 3) return; // Limit fallback attempts

		try {
			setFallbackAttempts((prev) => prev + 1);
			activateStep('session-check', `Fallback ${fallbackAttempts + 1}: Checking session directly...`);

			const {
				data: { session },
				error,
			} = await supabase.auth.getSession();

			if (error) throw error;

			if (session) {
				completeStep('session-check', 'Session found via fallback!');
				oauthService.successAtom.set(
					'Session found via fallback! Redirecting...',
				);
				setTimeout(() => {
					window.location.href = `${window.location.origin}/profile/`;
				}, 1000);
			} else {
				failStep('session-check', `Fallback ${fallbackAttempts + 1}: No session found, trying next fallback...`);

				// Try next fallback after a delay
				setTimeout(() => {
					fallbackUrlParamsCheck();
				}, 2000);
			}
		} catch (err: any) {
			console.error(`Fallback ${fallbackAttempts + 1} error:`, err);
			failStep('session-check', `Fallback ${fallbackAttempts + 1} failed, trying next...`);

			// Try next fallback after a delay
			setTimeout(() => {
				fallbackUrlParamsCheck();
			}, 2000);
		}
	}, [fallbackAttempts, activateStep, completeStep, failStep, fallbackUrlParamsCheck]);

	// Fallback auth subscription listener
	const fallbackAuthSubscription = useCallback(() => {
		if (authSubscriptionRef.current) return; // Prevent multiple subscriptions

		activateStep('auth-subscription', 'Setting up auth state listener...');

		const subscription = supabase.auth.onAuthStateChange(
			(event, session) => {
				console.log('Auth state change detected:', event, session);

				if (event === 'SIGNED_IN' && session) {
					completeStep('auth-subscription', 'Auth subscription detected sign-in!');
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
					updateStep('auth-subscription', 'active', 'Auth subscription detected sign-out or failed refresh...');
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
				failStep('auth-subscription', 'Auth subscription timeout, trying direct session check...');
				fallbackSessionCheck();
			}
		}, 5000);
	}, [activateStep, completeStep, updateStep, failStep, fallbackSessionCheck]);

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
				activateStep('auth-subscription', 'Primary callback taking too long, starting auth subscription fallback...');
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
	}, [handleCallback, fallbackAuthSubscription, activateStep]);

	// Handle error state changes - start fallback on error
	useEffect(() => {
		if (error && !timeoutReached) {
			// On error, start fallback sequence after a delay, beginning with auth subscription
			setTimeout(() => {
				fallbackAuthSubscription();
			}, 2000);
		}
	}, [error, timeoutReached, fallbackAuthSubscription]);
	// Calculate visible steps count and current status
	const visibleSteps = useMemo(() => {
		const activeOrCompletedSteps = authSteps.filter(step => 
			step.status === 'active' || step.status === 'completed' || step.status === 'failed'
		);
		return activeOrCompletedSteps.length > 0 ? activeOrCompletedSteps : [authSteps[0]];
	}, [authSteps]);

	const listHeight = Math.min(visibleSteps.length * 60, 300); // Max 5 steps visible

	// Render the stable UI
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
			style={{ backgroundColor: 'var(--backdrop-color)' }}>
			<div
				className="rounded-xl shadow-lg p-8 max-w-md w-full flex flex-col items-center relative backdrop-blur-md"
				style={{
					backgroundColor: 'var(--sl-color-gray-6)',
					color: 'var(--sl-color-white)',
					border: '1px solid var(--sl-color-gray-5)',
					minHeight: '400px',
				}}>
				{/* Loading spinner always visible */}
				<div
					className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 mb-6"
					style={{
						borderTopColor: 'var(--sl-color-accent)',
						borderBottomColor: 'var(--sl-color-accent)',
					}}></div>
				
				<div className="text-lg font-semibold mb-6">
					{success ? 'Authentication Complete!' : 
					 error ? 'Authentication Failed' : 
					 'Processing OAuth callback…'}
				</div>

				{/* Step list using react-window */}
				<div className="w-full mb-4">
					<div className="text-sm font-medium mb-2 opacity-80">Progress:</div>
					<div style={{ height: listHeight, width: '100%' }}>
						<List
							height={listHeight}
							itemCount={visibleSteps.length}
							itemSize={60}
							itemData={visibleSteps}
							width="100%"
						>
							{StepItem}
						</List>
					</div>
				</div>

				{/* Status messages */}
				{!loading && success && (
					<div className="text-sm text-green-400 text-center">
						You will be redirected automatically.
					</div>
				)}
				{!loading && error && (
					<div className="text-sm text-red-400 text-center">
						You will be redirected to the login page.
					</div>
				)}
				{loading && (
					<div className="text-sm opacity-80 text-center">
						Please wait while we complete your authentication.
					</div>
				)}
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
