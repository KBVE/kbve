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
} from './registerstate';
import { registerUser, validatePassword, passwordValidationMessage } from './factory-register';

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

	const setEmail = (v: string) => emailAtom.set(v);
	const setPassword = (v: string) => passwordAtom.set(v);
	const setConfirmPassword = (v: string) => confirmPasswordAtom.set(v);
	const setAgreed = (v: boolean) => agreedAtom.set(v);
	const setCaptchaToken = (v: string | null) => captchaTokenAtom.set(v);
	const setError = (v: string) => errorAtom.set(v);
	const setSuccess = (v: string) => successAtom.set(v);
	const setLoading = (v: boolean) => loadingAtom.set(v);

	type FormValues = {
		email: string;
		password: string;
		confirmPassword: string;
		agreed: boolean;
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
			<form
				onSubmit={handleSubmit(onSubmit)}
				className={twMerge(
					'register-form flex flex-col gap-4',
				)}
				style={{ maxWidth: 400, margin: '0 auto' }}
			>
				<h2 className="text-2xl font-bold text-center mb-2 text-white [text-shadow:_0_1px_2px_black] shadow-black">Register</h2>
				{error && <div className="text-red-500 text-center [text-shadow:_0_1px_2px_black] shadow-black shadow-md">{error}</div>}
				{success && <div className="text-green-500 text-center [text-shadow:_0_1px_2px_black] shadow-black shadow-md">{success}</div>}
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
