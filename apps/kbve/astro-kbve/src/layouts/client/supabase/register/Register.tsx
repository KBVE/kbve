import React, { useState, useRef } from 'react';
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
import { signInWithDiscord, signInWithGithub } from '../auth/OAuthSignIn';

const HCAPTCHA_SITE_KEY = 'e19cf4a6-2168-49a2-88fe-716e97569e88';

// Modal component for feedback
const StatusModal = ({ open, loading, error, success, onClose }: { open: boolean, loading: boolean, error: string, success: string, onClose: () => void }) => {
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
				{!loading && (error || success) && (
					<>
						<div className={error ? 'text-red-400 text-lg font-semibold mb-2' : 'text-green-400 text-lg font-semibold mb-2'}>
							{error || success}
						</div>
						<button onClick={onClose} className="mt-4 px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-700 text-white font-bold shadow">Close</button>
					</>
				)}
			</div>
		</div>
	);
};

export const Register = () => {
	const email = useStore(emailAtom);
	const password = useStore(passwordAtom);
	const confirmPassword = useStore(confirmPasswordAtom);
	const agreed = useStore(agreedAtom);
	const captchaToken = useStore(captchaTokenAtom);
	const error = useStore(errorAtom);
	const success = useStore(successAtom);
	const loading = useStore(loadingAtom);
	const displayName = useStore(displayNameAtom);

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

	const [showPasswordTooltip, setShowPasswordTooltip] = useState(false);
	const [modalOpen, setModalOpen] = useState(false);
	const hcaptchaRef = useRef<any>(null);

	const passwordValidation = validatePassword(password);

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
				hcaptchaRef.current.reset();
				setCaptchaToken(null);
			}
		}
	};

	const handleCloseModal = () => {
		setModalOpen(false);
		// Optionally clear error/success here
	};

	return (
		<>
			<StatusModal open={modalOpen} loading={loading} error={error} success={success} onClose={handleCloseModal} />
			<div className="flex flex-col gap-2 mb-6">
				<button
					onClick={signInWithGithub}
					className="flex items-center justify-center gap-2 w-full py-2 rounded bg-black text-white font-semibold shadow hover:bg-gray-800 transition"
				>
					<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.43 7.86 10.96.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.11-.75.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.7.42.36.79 1.09.79 2.2 0 1.59-.01 2.87-.01 3.26 0 .31.21.68.8.56C20.71 21.45 24 17.12 24 12.02 24 5.74 18.27.5 12 .5z"/></svg>
					Continue with GitHub
				</button>
				<button
					onClick={signInWithDiscord}
					className="flex items-center justify-center gap-2 w-full py-2 rounded bg-[#5865F2] text-white font-semibold shadow hover:bg-[#4752c4] transition"
				>
					<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276c-.598.3428-1.2205.6447-1.8733.8923a.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1835 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1835 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>
					Continue with Discord
				</button>
			</div>
			<form
				onSubmit={handleSubmit(onSubmit)}
				className={twMerge(
					'register-form flex flex-col gap-4',
				)}
				style={{ maxWidth: 400, margin: '0 auto' }}
			>
				<h2 className="text-2xl font-bold text-center mb-2 text-white [text-shadow:_0_1px_2px_black] shadow-black shadow-lg">Register</h2>
				{error && <div className="text-red-500 text-center [text-shadow:_0_1px_2px_black] shadow-black shadow-md">{error}</div>}
				{success && <div className="text-green-500 text-center [text-shadow:_0_1px_2px_black] shadow-black shadow-md">{success}</div>}
				<div>
					<label className="block mb-1 font-medium"><span className="text-white [text-shadow:_0_1px_2px_black] shadow-black">Display Name</span></label>
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
							'block w-full rounded border px-3 py-2 bg-white/80 dark:bg-stone-900/80 text-white [text-shadow:_0_1px_2px_black] shadow-black',
							errors.displayName && 'border-red-500',
						)}
						maxLength={32}
					/>
					<span className="text-xs text-neutral-300">Letters, numbers, spaces, _ and - only.</span>
					{errors.displayName && <span className="text-red-500 text-sm [text-shadow:_0_1px_2px_black] shadow-black">{errors.displayName.message}</span>}
				</div>
				<div>
					<label className="block mb-1 font-medium"><span className="text-white [text-shadow:_0_1px_2px_black] shadow-black">Email</span></label>
					<input
						type="email"
						{...register('email', { required: 'Email is required' })}
						value={email}
						onChange={e => {
							setEmail(e.target.value);
							setValue('email', e.target.value);
						}}
						className={clsx(
							'block w-full rounded border px-3 py-2 bg-white/80 dark:bg-stone-900/80 text-white [text-shadow:_0_1px_2px_black] shadow-black',
							errors.email && 'border-red-500',
						)}
					/>
					{errors.email && <span className="text-red-500 text-sm [text-shadow:_0_1px_2px_black] shadow-black">{errors.email.message}</span>}
				</div>
				<div>
					<label className="block mb-1 font-medium"><span className="text-white [text-shadow:_0_1px_2px_black] shadow-black">Password</span></label>
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
							className={clsx(
								'block w-full rounded border px-3 py-2 bg-white/80 dark:bg-stone-900/80 text-white [text-shadow:_0_1px_2px_black] shadow-black',
								errors.password && 'border-red-500',
							)}
						/>
						{showPasswordTooltip && (
							<div className="absolute left-0 z-10 mt-2 w-full rounded bg-neutral-900/95 text-white text-xs p-3 shadow-lg border border-neutral-700 space-y-1">
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
					{errors.password && <span className="text-red-500 text-sm [text-shadow:_0_1px_2px_black] shadow-black">{errors.password.message}</span>}
				</div>
				<div>
					<label className="block mb-1 font-medium"><span className="text-white [text-shadow:_0_1px_2px_black] shadow-black">Confirm Password</span></label>
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
						className={clsx(
							'block w-full rounded border px-3 py-2 bg-white/80 dark:bg-stone-900/80 text-white [text-shadow:_0_1px_2px_black] shadow-black',
							errors.confirmPassword && 'border-red-500',
						)}
					/>
					{errors.confirmPassword && <span className="text-red-500 text-sm [text-shadow:_0_1px_2px_black] shadow-black">{errors.confirmPassword.message}</span>}
				</div>
				<div className="flex items-center gap-2 my-2">
					<input
						type="checkbox"
						id="legal-agree"
						{...register('agreed', { required: 'You must agree to the legal terms.' })}
						checked={agreed}
						onChange={e => {
							setAgreed(e.target.checked);
							setValue('agreed', e.target.checked);
						}}
						className={clsx('accent-cyan-600')}
					/>
					<label htmlFor="legal-agree" className="text-sm"><span className="text-white [text-shadow:_0_1px_2px_black] shadow-black">I agree to the{' '}
						<a href="https://kbve.com/legal/" target="_blank" rel="noopener noreferrer" className="underline text-cyan-200">legal terms</a></span>
					</label>
				</div>
				{errors.agreed && <span className="text-red-500 text-sm [text-shadow:_0_1px_2px_black] shadow-black">{errors.agreed.message}</span>}
				<div className="my-2">
					<HCaptcha
						ref={hcaptchaRef}
						sitekey={HCAPTCHA_SITE_KEY}
						onVerify={token => setCaptchaToken(token)}
						onExpire={() => setCaptchaToken(null)}
					/>
				</div>
				<button
					type="submit"
					disabled={loading}
					className={twMerge(
						'block w-full py-2 rounded bg-gradient-to-br from-cyan-500 to-purple-500 text-white font-semibold shadow hover:from-cyan-400 hover:to-purple-400 transition drop-shadow-[0_1px_2px_rgba(0,0,0,1)] shadow-black shadow-lg',
						loading && 'opacity-60 cursor-not-allowed',
					)}
				>
					{loading ? 'Registering...' : 'Register'}
				</button>
				<div className="mt-4 text-center">
					<span className="text-white [text-shadow:_0_1px_2px_black] shadow-black">Already have an account?{' '}
						<a href="/login" className="underline text-cyan-200 hover:text-cyan-400">Login here</a>
					</span>
				</div>
			</form>
		</>
	);
};
