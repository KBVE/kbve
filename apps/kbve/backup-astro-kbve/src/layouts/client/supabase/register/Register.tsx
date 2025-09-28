import React, { useState, useRef, useEffect } from 'react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { useStore } from '@nanostores/react';
import { useForm } from 'react-hook-form';
import { clsx, twMerge } from 'src/utils/tw';
import {
	emailAtom,
	passwordAtom,
	confirmPasswordAtom,
	agreedAtom,
	captchaTokenAtom,
	errorAtom,
	successAtom,
	loadingAtom,
	displayNameAtom,
} from './registerstate';
import { registerUser, validatePassword, passwordValidationMessage } from './factory-register';
import { signInWithDiscord, signInWithGithub, SolanaSignInButton } from '../auth/OAuthSignIn';

const HCAPTCHA_SITE_KEY = 'e19cf4a6-2168-49a2-88fe-716e97569e88';

// Modal component for feedback
const StatusModal = ({ open, loading, error, success, onClose }: { open: boolean, loading: boolean, error: string, success: string, onClose: () => void }) => {
	const [countdown, setCountdown] = useState(10);

	useEffect(() => {
		if (!open || loading || error || !success) {
			setCountdown(10);
			return;
		}

		// Start countdown only for successful registration
		const timer = setInterval(() => {
			setCountdown(prev => {
				if (prev <= 1) {
					// Redirect to profile page when countdown reaches 0
					window.location.href = '/profile';
					return 0;
				}
				return prev - 1;
			});
		}, 1000);

		return () => clearInterval(timer);
	}, [open, loading, error, success]);

	if (!open) return null;
	
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
			<div className="bg-neutral-900 text-white rounded-xl shadow-lg p-8 max-w-sm w-full flex flex-col items-center relative">
				{loading && (
					<>
						<div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-cyan-400 mb-4"></div>
						<div className="text-lg font-semibold mb-2">Processing registration…</div>
					</>
				)}
				{!loading && error && (
					<>
						<div className="text-red-400 text-lg font-semibold mb-2">
							{error}
						</div>
						<button onClick={onClose} className="mt-4 px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-700 text-white font-bold shadow">Close</button>
					</>
				)}
				{!loading && success && (
					<>
						<div className="text-green-400 text-lg font-semibold mb-4">
							{success}
						</div>
						<div className="text-center mb-4">
							<div className="text-sm text-neutral-300 mb-2">
								Redirecting to your profile in {countdown} seconds...
							</div>
							<div className="w-full bg-neutral-700 rounded-full h-2 mb-3">
								<div 
									className="bg-gradient-to-r from-cyan-500 to-purple-500 h-2 rounded-full transition-all duration-1000"
									style={{ width: `${((10 - countdown) / 10) * 100}%` }}
								></div>
							</div>
						</div>
						<div className="flex gap-2">
                                                        <a data-astro-prefetch
								href="/profile" 
								className="px-4 py-2 rounded bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700 text-white font-bold shadow transition"
							>
								Go to Profile
							</a>
							<button onClick={onClose} className="px-4 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-white font-bold shadow transition">Close</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
};

export const Register = () => {
	// All hooks must be called at the top level, before any conditional logic
	const email = useStore(emailAtom);
	const password = useStore(passwordAtom);
	const confirmPassword = useStore(confirmPasswordAtom);
	const agreed = useStore(agreedAtom);
	const captchaToken = useStore(captchaTokenAtom);
	const error = useStore(errorAtom);
	const success = useStore(successAtom);
	const loading = useStore(loadingAtom);
	const displayName = useStore(displayNameAtom);

	const [visible, setVisible] = useState(false);
	const [componentLoading, setComponentLoading] = useState(true);
	const [showPasswordTooltip, setShowPasswordTooltip] = useState(false);
	const [modalOpen, setModalOpen] = useState(false);
	const hcaptchaRef = useRef<any>(null);

	const setEmail = (v: string) => emailAtom.set(v);
	const setPassword = (v: string) => passwordAtom.set(v);
	const setConfirmPassword = (v: string) => confirmPasswordAtom.set(v);
	const setAgreed = (v: boolean) => agreedAtom.set(v);
	const setCaptchaToken = (v: string | null) => captchaTokenAtom.set(v);
	const setError = (v: string) => errorAtom.set(v);
	const setSuccess = (v: string) => successAtom.set(v);
	const setLoading = (v: boolean) => loadingAtom.set(v);
	const setDisplayName = (v: string) => displayNameAtom.set(v);

	type FormValues = {
		email: string;
		password: string;
		confirmPassword: string;
		agreed: boolean;
		displayName: string;
	};

	const {
		handleSubmit,
		register,
		formState: { errors },
		setValue,
	} = useForm<FormValues>({
		defaultValues: {
			email,
			password,
			confirmPassword,
			agreed,
			displayName,
		},
	});

	const passwordValidation = validatePassword(password);

	// Handle skeleton crossfade on component mount
	useEffect(() => {
		const initializeForm = async () => {
			try {
				console.log('Register component: Initializing form...');
				
				// Simulate brief loading for smooth transition
				await new Promise(resolve => setTimeout(resolve, 800));
				
				// Fade out skeleton
				const skeleton = document.querySelector('[data-skeleton="register"]') as HTMLElement;
				if (skeleton) {
					console.log('Register component: Found skeleton, fading out...');
					skeleton.style.transition = 'opacity 0.5s ease-out';
					skeleton.style.opacity = '0';
					skeleton.style.pointerEvents = 'none';
					
					// Remove skeleton completely after fade animation completes
					setTimeout(() => {
						console.log('Register component: Removing skeleton from DOM...');
						skeleton.remove();
					}, 500); // Wait for fade transition to complete
				} else {
					console.warn('Register component: Skeleton not found!');
				}
				
				setComponentLoading(false);
				// Fade in form with small delay
				setTimeout(() => {
					console.log('Register component: Making form visible...');
					setVisible(true);
				}, 100);
			} catch (error) {
				console.error('Error initializing form:', error);
				setComponentLoading(false);
				setTimeout(() => setVisible(true), 100);
			}
		};

		initializeForm();
	}, []);

	// Early return after all hooks have been called
	if (componentLoading) {
		return null; // Skeleton is handled by Astro
	}

	const onSubmit = async (data: FormValues) => {
		setError('');
		setSuccess('');
		setModalOpen(true);
		if (!captchaToken) {
			setError('Please complete the hCaptcha challenge.');
			setModalOpen(false);
			return;
		}
		setLoading(true);
		let submissionError = false;
		try {
			await registerUser();
		} catch (err: any) {
			setError(err.message || 'Registration failed.');
			submissionError = true;
		} finally {
			setLoading(false);
			// Always reset hCaptcha after submission attempt, even if error is set in try
			if (hcaptchaRef.current) {
				hcaptchaRef.current.resetCaptcha();
				setCaptchaToken(null);
			}
		}
	};

	const handleCloseModal = () => {
		setModalOpen(false);
		// Optionally clear error/success here
	};

	return (
		<div className={clsx(
			"transition-opacity duration-500 ease-out w-full relative",
			visible ? "opacity-100 z-30" : "opacity-0 z-10"
		)}>
			<StatusModal open={modalOpen} loading={loading} error={error} success={success} onClose={handleCloseModal} />
			
			{/* OAuth Buttons Section */}
			<div className="flex flex-col gap-3 mb-8">
				<button
					onClick={signInWithGithub}
					className="flex items-center justify-center gap-3 w-full py-3 px-4 rounded-xl bg-zinc-900/80 backdrop-blur border border-zinc-600/30 text-white font-medium shadow-lg hover:bg-zinc-800/80 hover:border-zinc-500/50 transition-all duration-300 group"
				>
					<svg className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.43 7.86 10.96.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.11-.75.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.7.42.36.79 1.09.79 2.2 0 1.59-.01 2.87-.01 3.26 0 .31.21.68.8.56C20.71 21.45 24 17.12 24 12.02 24 5.74 18.27.5 12 .5z"/></svg>
					<span>Continue with GitHub</span>
				</button>
				<button
					onClick={signInWithDiscord}
					className="flex items-center justify-center gap-3 w-full py-3 px-4 rounded-xl bg-[#5865F2]/90 backdrop-blur border border-[#4752c4]/50 text-white font-medium shadow-lg hover:bg-[#4752c4]/90 hover:border-[#3c4ab8]/50 transition-all duration-300 group"
				>
					<svg className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276c-.598.3428-1.2205.6447-1.8733.8923a.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1835 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1835 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>
					<span>Continue with Discord</span>
				</button>
				<SolanaSignInButton captchaToken={captchaToken} captchaRef={hcaptchaRef} />
			</div>

			{/* Divider */}
			<div className="flex items-center my-6">
				<div className="flex-1 h-px bg-gradient-to-r from-transparent to-zinc-600"></div>
				<span className="px-4 text-zinc-400 text-sm font-medium">or</span>
				<div className="flex-1 h-px bg-gradient-to-l from-transparent to-zinc-600"></div>
			</div>

			{/* Registration Form */}
			<form
				onSubmit={handleSubmit(onSubmit)}
				className="space-y-5"
			>
				{/* Form Title */}
				<div className="text-center mb-6">
					<h2 className="text-2xl font-bold text-white bg-gradient-to-r from-cyan-300 to-purple-300 bg-clip-text text-transparent mb-2">
						Create Account
					</h2>
					<p className="text-zinc-400 text-sm">Fill in your details to get started</p>
				</div>

				{/* Error/Success Messages */}
				{(error || success) && (
					<div className="mb-6">
						{error && (
							<div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-center backdrop-blur-sm">
								<div className="flex items-center justify-center gap-2">
									<svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
										<path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
									</svg>
									<span>{error}</span>
								</div>
							</div>
						)}
						{success && (
							<div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-green-400 text-center backdrop-blur-sm">
								<div className="flex items-center justify-center gap-2">
									<svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
										<path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
									</svg>
									<span>{success}</span>
								</div>
							</div>
						)}
					</div>
				)}
				{/* Display Name Field */}
				<div className="space-y-2">
					<label className="block text-sm font-medium text-zinc-200">
						Display Name
					</label>
					<input
						type="text"
						{...register('displayName', {
							required: 'Display name is required',
							maxLength: {
								value: 32,
								message: 'Display name cannot exceed 32 characters',
							},
							pattern: {
								value: /^[a-zA-Z0-9 _-]+$/,
								message: 'Display name can only contain letters, numbers, spaces, _ and -',
							},
						})}
						value={displayName}
						onChange={e => {
							setDisplayName(e.target.value);
							setValue('displayName', e.target.value);
						}}
						placeholder="Your display name"
						className={clsx(
							'block w-full rounded-xl border px-4 py-3 bg-zinc-900/60 backdrop-blur text-white placeholder-zinc-500 transition-all duration-300',
							'focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400/50',
							errors.displayName 
								? 'border-red-500/50 bg-red-500/5' 
								: 'border-zinc-600/50 hover:border-zinc-500/50'
						)}
						maxLength={32}
					/>
					<p className="text-xs text-zinc-400">Letters, numbers, spaces, _ and - only</p>
					{errors.displayName && (
						<p className="text-red-400 text-sm">{errors.displayName.message}</p>
					)}
				</div>

				{/* Email Field */}
				<div className="space-y-2">
					<label className="block text-sm font-medium text-zinc-200">
						Email Address
					</label>
					<input
						type="email"
						{...register('email', { required: 'Email is required' })}
						value={email}
						onChange={e => {
							setEmail(e.target.value);
							setValue('email', e.target.value);
						}}
						placeholder="your@email.com"
						className={clsx(
							'block w-full rounded-xl border px-4 py-3 bg-zinc-900/60 backdrop-blur text-white placeholder-zinc-500 transition-all duration-300',
							'focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400/50',
							errors.email 
								? 'border-red-500/50 bg-red-500/5' 
								: 'border-zinc-600/50 hover:border-zinc-500/50'
						)}
					/>
					{errors.email && (
						<p className="text-red-400 text-sm">{errors.email.message}</p>
					)}
				</div>

				{/* Password Field */}
				<div className="space-y-2">
					<label className="block text-sm font-medium text-zinc-200">
						Password
					</label>
					<div className="relative">
						<input
							type="password"
							{...register('password', {
								required: 'Password is required',
								validate: passwordValidationMessage,
							})}
							value={password}
							onChange={e => {
								setPassword(e.target.value);
								setValue('password', e.target.value);
							}}
							onFocus={() => setShowPasswordTooltip(true)}
							onBlur={() => setShowPasswordTooltip(false)}
							placeholder="Create a strong password"
							className={clsx(
								'block w-full rounded-xl border px-4 py-3 bg-zinc-900/60 backdrop-blur text-white placeholder-zinc-500 transition-all duration-300',
								'focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400/50',
								errors.password 
									? 'border-red-500/50 bg-red-500/5' 
									: 'border-zinc-600/50 hover:border-zinc-500/50'
							)}
						/>
						{showPasswordTooltip && (
							<div className="absolute left-0 z-10 mt-2 w-full rounded-xl bg-zinc-900/95 backdrop-blur border border-zinc-700/50 text-white text-xs p-4 shadow-xl space-y-2">
								<p className="text-zinc-300 font-medium mb-2">Password requirements:</p>
								<div className={passwordValidation.length ? 'text-green-400' : 'text-red-400'}>
									{passwordValidation.length ? '✓' : '✗'} At least 8 characters
								</div>
								<div className={passwordValidation.upper ? 'text-green-400' : 'text-red-400'}>
									{passwordValidation.upper ? '✓' : '✗'} At least 1 uppercase letter
								</div>
								<div className={passwordValidation.lower ? 'text-green-400' : 'text-red-400'}>
									{passwordValidation.lower ? '✓' : '✗'} At least 1 lowercase letter
								</div>
								<div className={passwordValidation.number ? 'text-green-400' : 'text-red-400'}>
									{passwordValidation.number ? '✓' : '✗'} At least 1 number
								</div>
								<div className={passwordValidation.special ? 'text-green-400' : 'text-red-400'}>
									{passwordValidation.special ? '✓' : '✗'} At least 1 special character
								</div>
							</div>
						)}
					</div>
					{errors.password && (
						<p className="text-red-400 text-sm">{errors.password.message}</p>
					)}
				</div>

				{/* Confirm Password Field */}
				<div className="space-y-2">
					<label className="block text-sm font-medium text-zinc-200">
						Confirm Password
					</label>
					<input
						type="password"
						{...register('confirmPassword', {
							required: 'Please confirm your password',
							validate: value => value === password || 'Passwords do not match',
						})}
						value={confirmPassword}
						onChange={e => {
							setConfirmPassword(e.target.value);
							setValue('confirmPassword', e.target.value);
						}}
						placeholder="Confirm your password"
						className={clsx(
							'block w-full rounded-xl border px-4 py-3 bg-zinc-900/60 backdrop-blur text-white placeholder-zinc-500 transition-all duration-300',
							'focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400/50',
							errors.confirmPassword 
								? 'border-red-500/50 bg-red-500/5' 
								: 'border-zinc-600/50 hover:border-zinc-500/50'
						)}
					/>
					{errors.confirmPassword && (
						<p className="text-red-400 text-sm">{errors.confirmPassword.message}</p>
					)}
				</div>
				<div className="flex items-start gap-3 my-6">
					<input
						type="checkbox"
						id="legal-agree"
						{...register('agreed', { required: 'You must agree to the legal terms.' })}
						checked={agreed}
						onChange={e => {
							setAgreed(e.target.checked);
							setValue('agreed', e.target.checked);
						}}
						className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-900/60 text-cyan-500 focus:ring-cyan-400/50 focus:ring-offset-zinc-900"
					/>
					<label htmlFor="legal-agree" className="text-sm text-zinc-300 leading-relaxed">
						I agree to the{' '}
                                                <a data-astro-prefetch
                                                        href="https://kbve.com/legal/"
							target="_blank" 
							rel="noopener noreferrer" 
							className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors duration-300"
						>
							Terms of Service
						</a>
						{' '}and{' '}
                                                <a data-astro-prefetch
                                                        href="https://kbve.com/privacy/"
							target="_blank" 
							rel="noopener noreferrer" 
							className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors duration-300"
						>
							Privacy Policy
						</a>
					</label>
				</div>
				{errors.agreed && (
					<p className="text-red-400 text-sm mb-4">{errors.agreed.message}</p>
				)}
				<div className="my-6 flex justify-center">
					<div className="rounded-xl overflow-hidden bg-zinc-900/40 backdrop-blur border border-zinc-700/50 p-1">
						<HCaptcha
							ref={hcaptchaRef}
							sitekey={HCAPTCHA_SITE_KEY}
							onVerify={token => setCaptchaToken(token)}
							onExpire={() => setCaptchaToken(null)}
						/>
					</div>
				</div>
				<button
					type="submit"
					disabled={loading}
					className={clsx(
						'w-full py-3 px-4 rounded-xl font-semibold text-white shadow-lg transition-all duration-300',
						'bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400',
						'focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:ring-offset-2 focus:ring-offset-zinc-900',
						'disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:from-cyan-500 disabled:hover:to-purple-500',
						'transform hover:scale-[1.02] active:scale-[0.98]'
					)}
				>
					{loading ? (
						<div className="flex items-center justify-center gap-2">
							<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
							<span>Creating Account...</span>
						</div>
					) : (
						'Create Account'
					)}
				</button>
				<div className="mt-6 text-center">
					<span className="text-zinc-400">
						Already have an account?{' '}
                                                <a data-astro-prefetch
                                                        href="/login"
							className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors duration-300 font-medium"
						>
							Sign in here
						</a>
					</span>
				</div>
			</form>
		</div>
	);
};
