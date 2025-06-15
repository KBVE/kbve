import React from 'react';
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

const HCAPTCHA_SITE_KEY = 'e19cf4a6-2168-49a2-88fe-716e97569e88';

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

	const onSubmit = async (data: FormValues) => {
		setError('');
		setSuccess('');
		if (!captchaToken) {
			setError('Please complete the hCaptcha challenge.');
			return;
		}
		setLoading(true);
		try {
			// TODO: Replace with your Supabase sign-up logic
			setSuccess('Registration successful! Please check your email to verify your account.');
		} catch (err: any) {
			setError(err.message || 'Registration failed.');
		} finally {
			setLoading(false);
		}
	};

	return (
		<form
			onSubmit={handleSubmit(onSubmit)}
			className={twMerge(
				'register-form flex flex-col gap-4',
			)}
			style={{ maxWidth: 400, margin: '0 auto' }}
		>
			<h2 className="text-2xl font-bold text-center mb-2">Register</h2>
			{error && <div className="text-red-500 text-center">{error}</div>}
			{success && <div className="text-green-500 text-center">{success}</div>}
			<div>
				<label className="block mb-1 font-medium">Email</label>
				<input
					type="email"
					{...register('email', { required: 'Email is required' })}
					value={email}
					onChange={e => {
						setEmail(e.target.value);
						setValue('email', e.target.value);
					}}
					className={clsx(
						'block w-full rounded border px-3 py-2 bg-white/80 dark:bg-stone-900/80 text-zinc-900 dark:text-zinc-100',
						errors.email && 'border-red-500',
					)}
				/>
				{errors.email && <span className="text-red-500 text-sm">{errors.email.message}</span>}
			</div>
			<div>
				<label className="block mb-1 font-medium">Password</label>
				<input
					type="password"
					{...register('password', { required: 'Password is required' })}
					value={password}
					onChange={e => {
						setPassword(e.target.value);
						setValue('password', e.target.value);
					}}
					className={clsx(
						'block w-full rounded border px-3 py-2 bg-white/80 dark:bg-stone-900/80 text-zinc-900 dark:text-zinc-100',
						errors.password && 'border-red-500',
					)}
				/>
				{errors.password && <span className="text-red-500 text-sm">{errors.password.message}</span>}
			</div>
			<div>
				<label className="block mb-1 font-medium">Confirm Password</label>
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
						'block w-full rounded border px-3 py-2 bg-white/80 dark:bg-stone-900/80 text-zinc-900 dark:text-zinc-100',
						errors.confirmPassword && 'border-red-500',
					)}
				/>
				{errors.confirmPassword && <span className="text-red-500 text-sm">{errors.confirmPassword.message}</span>}
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
				<label htmlFor="legal-agree" className="text-sm">
					I agree to the{' '}
					<a href="https://kbve.com/legal/" target="_blank" rel="noopener noreferrer" className="underline text-cyan-700 dark:text-cyan-400">legal terms</a>
				</label>
			</div>
			{errors.agreed && <span className="text-red-500 text-sm">{errors.agreed.message}</span>}
			<div className="my-2">
				<HCaptcha
					sitekey={HCAPTCHA_SITE_KEY}
					onVerify={token => setCaptchaToken(token)}
					onExpire={() => setCaptchaToken(null)}
				/>
			</div>
			<button
				type="submit"
				disabled={loading}
				className={twMerge(
					'block w-full py-2 rounded bg-gradient-to-br from-cyan-500 to-purple-500 text-white font-semibold shadow hover:from-cyan-400 hover:to-purple-400 transition',
					loading && 'opacity-60 cursor-not-allowed',
				)}
			>
				{loading ? 'Registering...' : 'Register'}
			</button>
		</form>
	);
};
