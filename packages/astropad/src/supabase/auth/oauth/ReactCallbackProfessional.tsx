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

// Professional status card component
const StatusCard = ({
	status,
	title,
	message,
	countdown
}: {
	status: 'loading' | 'success' | 'error';
	title: string;
	message: string;
	countdown?: number;
}) => {
	const statusConfig = {
		loading: {
			icon: (
				<div className="relative w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16">
					<div className="absolute inset-0 rounded-full border-2 sm:border-3 md:border-4 border-blue-500/20"></div>
					<div className="absolute inset-0 rounded-full border-2 sm:border-3 md:border-4 border-t-blue-500 animate-spin"></div>
				</div>
			),
			color: 'from-blue-500/20 to-cyan-500/20',
			borderColor: 'border-blue-500/30',
			textColor: 'text-blue-400',
		},
		success: {
			icon: (
				<div className="relative w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 flex items-center justify-center">
					<div className="absolute inset-0 rounded-full bg-green-500/20 animate-pulse"></div>
					<svg className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 text-green-400 z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
					</svg>
				</div>
			),
			color: 'from-green-500/20 to-emerald-500/20',
			borderColor: 'border-green-500/30',
			textColor: 'text-green-400',
		},
		error: {
			icon: (
				<div className="relative w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 flex items-center justify-center">
					<div className="absolute inset-0 rounded-full bg-red-500/20"></div>
					<svg className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 text-red-400 z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
					</svg>
				</div>
			),
			color: 'from-red-500/20 to-pink-500/20',
			borderColor: 'border-red-500/30',
			textColor: 'text-red-400',
		},
	}[status];

	return (
		<div className="relative w-full">
			{/* Backdrop glow effect - hidden on small screens */}
			<div className={`hidden sm:block absolute -inset-4 bg-gradient-to-r ${statusConfig.color} rounded-3xl blur-xl opacity-50 animate-pulse`}></div>

			{/* Main card - responsive padding and spacing */}
			<div className={`relative bg-zinc-900/90 backdrop-blur-xl rounded-xl sm:rounded-2xl border ${statusConfig.borderColor} p-3 sm:p-5 md:p-6`}>
				{/* Status icon */}
				<div className="flex justify-center mb-2 sm:mb-3 md:mb-4">
					{statusConfig.icon}
				</div>

				{/* Title - responsive font size */}
				<h2 className={`text-base sm:text-lg md:text-xl font-bold text-center mb-2 ${statusConfig.textColor} break-words px-1 sm:px-2`}>
					{title}
				</h2>

				{/* Message - responsive font size and padding */}
				<p className="text-xs sm:text-sm md:text-base text-center text-zinc-400 mb-2 sm:mb-3 px-1 sm:px-3 break-words leading-normal sm:leading-relaxed">
					{message}
				</p>

				{/* Countdown */}
				{countdown !== undefined && countdown > 0 && (
					<div className="mt-3 sm:mt-4 md:mt-5">
						<div className="flex justify-center items-center gap-1">
							<span className="text-[11px] sm:text-xs md:text-sm text-zinc-500">Redirecting in</span>
							<div className={`text-base sm:text-lg md:text-xl font-bold ${statusConfig.textColor} min-w-[2ch] text-center`}>
								{countdown}
							</div>
							<span className="text-[11px] sm:text-xs md:text-sm text-zinc-500">seconds</span>
						</div>
						{/* Progress bar */}
						<div className="mt-3 h-1 bg-zinc-800 rounded-full overflow-hidden">
							<div
								className={`h-full bg-gradient-to-r ${statusConfig.color} transition-all duration-1000 ease-linear`}
								style={{ width: `${(countdown / 3) * 100}%` }}
							></div>
						</div>
					</div>
				)}

				{/* Additional actions for error state */}
				{status === 'error' && (
					<div className="mt-3 sm:mt-4 md:mt-5 flex flex-col sm:flex-row justify-center gap-2 sm:gap-3">
						<button
							onClick={() => window.location.href = '/login'}
							className="px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs sm:text-sm md:text-base rounded-lg transition-colors w-full sm:w-auto"
						>
							Back to Login
						</button>
						<button
							onClick={() => window.location.reload()}
							className="px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm md:text-base rounded-lg transition-colors w-full sm:w-auto"
						>
							Try Again
						</button>
					</div>
				)}
			</div>
		</div>
	);
};

// Main authentication processor component
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
			// Error is handled by the service
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
						oauthService.successAtom.set("Authentication verified! Preparing your dashboard...");
					} else if (retryCount === 1) {
						oauthService.errorAtom.set("Authentication is taking longer than expected. Please wait...");
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

	// Determine current status
	let currentStatus: 'loading' | 'success' | 'error' = 'loading';
	let title = 'Authenticating';
	let message = 'Verifying your credentials...';

	if (success) {
		currentStatus = 'success';
		title = 'Welcome Back!';
		message = success || 'Authentication successful. Preparing your dashboard...';
	} else if (error) {
		currentStatus = 'error';
		title = 'Authentication Failed';
		message = error || 'We couldn\'t verify your credentials. Please try again.';
	} else if (retryCount > 0) {
		message = 'Establishing secure connection...';
	}

	return (
		<div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm overflow-y-auto">
			<div className="min-h-full flex items-center justify-center py-8 px-3 sm:px-4 md:px-6">
				<div className="w-full max-w-sm sm:max-w-md">
					<StatusCard
						status={currentStatus}
						title={title}
						message={message}
						countdown={countdown}
					/>
				</div>
			</div>
		</div>
	);
});

// Main component
export const ReactCallbackProfessional = () => {
	useEffect(() => {
		hideSkeleton();
	}, []);

	return <AuthProcessor />;
};