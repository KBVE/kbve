/** @jsxImportSource react */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { oauthService, supabase } from '@kbve/astropad';

// Hide skeleton loader when component mounts
const hideSkeleton = () => {
	const skeleton = document.querySelector('[data-skeleton="callback"]') as HTMLElement;
	if (skeleton) {
		skeleton.style.display = 'none';
	}
};

// Main authentication processor component - using same pattern as logout
const AuthProcessor = React.memo(() => {
	const loading = useStore(oauthService.loadingAtom);
	const error = useStore(oauthService.errorAtom);
	const success = useStore(oauthService.successAtom);

	const [countdown, setCountdown] = useState<number | undefined>(undefined);
	const [retryCount, setRetryCount] = useState(0);
	const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Handle OAuth callback
	const handleCallback = useCallback(async () => {
		try {
			await oauthService.handleAuthCallback();
		} catch (err: any) {
			console.error('OAuth callback error:', err);
		}
	}, []);

	// Redirect functions
	const redirectToProfile = useCallback(() => {
		window.location.href = '/profile';
	}, []);

	const redirectToLogin = useCallback(() => {
		window.location.href = '/login';
	}, []);

	// Start countdown timer
	const startCountdown = useCallback((seconds: number, callback: () => void) => {
		setCountdown(seconds);

		if (countdownRef.current) {
			clearInterval(countdownRef.current);
		}

		countdownRef.current = setInterval(() => {
			setCountdown((prev) => {
				if (prev === undefined || prev <= 1) {
					if (countdownRef.current) {
						clearInterval(countdownRef.current);
					}
					callback();
					return undefined;
				}
				return prev - 1;
			});
		}, 1000);
	}, []);

	// Initialize auth processing
	useEffect(() => {
		oauthService.watchAuthState();
		handleCallback();

		// Fallback: Check session directly after 3 seconds if still loading
		const fallbackTimer = setTimeout(async () => {
			const currentSuccess = oauthService.successAtom.get();
			const currentError = oauthService.errorAtom.get();

			if (!currentSuccess && !currentError && retryCount < 2) {
				setRetryCount(prev => prev + 1);

				try {
					const { data: { session } } = await supabase.auth.getSession();
					if (session) {
						oauthService.successAtom.set("Authentication verified!");
					}
				} catch (err) {
					console.error('Fallback session check failed:', err);
				}
			}
		}, 3000);

		return () => {
			oauthService.unwatchAuthState();
			clearTimeout(fallbackTimer);
			if (countdownRef.current) {
				clearInterval(countdownRef.current);
			}
		};
	}, [handleCallback, retryCount]);

	// Handle success state
	useEffect(() => {
		if (success && !countdown) {
			startCountdown(3, redirectToProfile);
		}
	}, [success, countdown, startCountdown, redirectToProfile]);

	// Handle error state
	useEffect(() => {
		if (error && error.includes('timeout')) {
			setTimeout(() => {
				startCountdown(5, redirectToLogin);
			}, 2000);
		}
	}, [error, startCountdown, redirectToLogin]);

	// Loading state
	if (loading || (!success && !error)) {
		return (
			<div className="text-center space-y-4 p-8">
				<div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full border border-blue-500/30 bg-blue-500/10">
					<div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
				</div>
				<div>
					<h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--sl-color-white)' }}>
						Authenticating
					</h3>
					<p className="text-sm" style={{ color: 'var(--sl-color-gray-3)' }}>
						{retryCount > 0 ? 'Establishing secure connection...' : 'Verifying your credentials...'}
					</p>
				</div>
			</div>
		);
	}

	// Success state
	if (success) {
		return (
			<div className="text-center space-y-4 p-8">
				<div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full border border-green-500/30 bg-green-500/10">
					<svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
					</svg>
				</div>
				<div>
					<h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--sl-color-white)' }}>
						Welcome Back!
					</h3>
					<p className="text-sm mb-4" style={{ color: 'var(--sl-color-gray-3)' }}>
						{success}
					</p>
					{countdown !== undefined && countdown > 0 && (
						<div className="space-y-2">
							<div className="flex justify-center items-center gap-1">
								<span className="text-xs" style={{ color: 'var(--sl-color-gray-4)' }}>Redirecting in</span>
								<span className="text-base font-bold text-green-400">{countdown}</span>
								<span className="text-xs" style={{ color: 'var(--sl-color-gray-4)' }}>seconds</span>
							</div>
							<div className="h-1 bg-zinc-800 rounded-full overflow-hidden max-w-[200px] mx-auto">
								<div
									className="h-full bg-gradient-to-r from-green-500/50 to-emerald-500/50 transition-all duration-1000 ease-linear"
									style={{ width: `${(countdown / 3) * 100}%` }}
								></div>
							</div>
						</div>
					)}
				</div>
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<div className="text-center space-y-4 p-8">
				<div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full border border-red-500/30 bg-red-500/10">
					<svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
					</svg>
				</div>
				<div>
					<h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--sl-color-white)' }}>
						Authentication Failed
					</h3>
					<p className="text-sm mb-4" style={{ color: 'var(--sl-color-gray-3)' }}>
						{error}
					</p>
					<div className="grid grid-cols-2 gap-3 max-w-[280px] mx-auto">
						<button
							onClick={() => window.location.href = '/login'}
							className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
						>
							Back to Login
						</button>
						<button
							onClick={() => window.location.reload()}
							className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
						>
							Try Again
						</button>
					</div>
				</div>
			</div>
		);
	}

	return null;
});

// Main component
export const ReactCallbackSimple = () => {
	useEffect(() => {
		hideSkeleton();
	}, []);

	return <AuthProcessor />;
};