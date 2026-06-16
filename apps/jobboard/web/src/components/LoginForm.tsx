import { useRef, useState } from 'react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import {
	KBVE_HCAPTCHA_SITE_KEY,
	useAuth as useKbveAuth,
	useAuthActions,
} from '@kbve/rn/auth';
import type { OAuthProvider } from '@kbve/core';
import { PeekMascot } from './PeekMascot';

type Mode = 'sign_in' | 'sign_up';

const PROVIDERS: { id: OAuthProvider; label: string; color: string }[] = [
	{ id: 'discord', label: 'Discord', color: '#5865F2' },
	{ id: 'github', label: 'GitHub', color: '#e6edf3' },
	{ id: 'twitch', label: 'Twitch', color: '#9146FF' },
];

const inputCls =
	'w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 transition focus:border-quest-500 focus:outline-none';

export function LoginForm() {
	const auth = useKbveAuth();
	const actions = useAuthActions();
	const captchaRef = useRef<HCaptcha>(null);

	const [mode, setMode] = useState<Mode>('sign_in');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [agreed, setAgreed] = useState(false);
	const [peeking, setPeeking] = useState(false);
	const [localError, setLocalError] = useState<string | null>(null);

	const isSignUp = mode === 'sign_up';
	const busy = auth.status === 'authenticating';
	const mismatch = isSignUp && confirm.length > 0 && password !== confirm;

	// Invisible hCaptcha resolves → onVerify → we run the real auth action.
	const onVerify = (token: string) => {
		if (isSignUp) actions.signUp(email, password, token);
		else actions.signInWithPassword(email, password, token);
		captchaRef.current?.resetCaptcha();
	};

	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		setLocalError(null);
		if (!email || !password) {
			setLocalError('Enter your email and password.');
			return;
		}
		if (isSignUp && password !== confirm) {
			setLocalError('Passwords don’t match.');
			return;
		}
		if (isSignUp && !agreed) {
			setLocalError('Please agree to the terms to continue.');
			return;
		}
		captchaRef.current?.execute();
	};

	const switchMode = () => {
		setMode(isSignUp ? 'sign_in' : 'sign_up');
		setLocalError(null);
		setConfirm('');
	};

	const peekProps = {
		onFocus: () => setPeeking(true),
		onBlur: () => setPeeking(false),
	};
	const error = localError ?? auth.error;

	return (
		<div className="w-full">
			<div className="mb-6 flex flex-col items-center text-center">
				<PeekMascot peeking={peeking} />
				<h1 className="mt-2 font-display text-2xl font-bold">
					{isSignUp ? 'Create your account' : 'Welcome back'}
				</h1>
				<p className="mt-1 text-sm text-zinc-400">
					{isSignUp
						? 'Join the curated game-dev board.'
						: 'Sign in to apply, post, and message.'}
				</p>
			</div>

			<form onSubmit={submit} className="space-y-3">
				<input
					type="email"
					className={inputCls}
					placeholder="Email"
					autoComplete="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
				<input
					type="password"
					className={inputCls}
					placeholder="Password"
					autoComplete={isSignUp ? 'new-password' : 'current-password'}
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					{...peekProps}
				/>
				{isSignUp && (
					<input
						type="password"
						className={`${inputCls} ${mismatch ? 'border-red-500' : ''}`}
						placeholder="Confirm password"
						autoComplete="new-password"
						value={confirm}
						onChange={(e) => setConfirm(e.target.value)}
						{...peekProps}
					/>
				)}

				{isSignUp && (
					<label className="flex items-start gap-2 text-xs text-zinc-400">
						<input
							type="checkbox"
							checked={agreed}
							onChange={(e) => setAgreed(e.target.checked)}
							className="mt-0.5 accent-quest-500"
						/>
						<span>
							I agree to the Terms of Service and Privacy Policy.
						</span>
					</label>
				)}

				{error && <p className="text-sm text-red-400">{error}</p>}

				<button
					type="submit"
					disabled={busy}
					className="w-full rounded-lg bg-quest-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-quest-900/40 transition hover:bg-quest-400 disabled:cursor-not-allowed disabled:opacity-60">
					{busy ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
				</button>
			</form>

			<div className="my-5 flex items-center gap-3 text-xs text-zinc-500">
				<span className="h-px flex-1 bg-zinc-800" />
				or continue with
				<span className="h-px flex-1 bg-zinc-800" />
			</div>

			<div className="grid grid-cols-3 gap-2">
				{PROVIDERS.map((p) => (
					<button
						key={p.id}
						type="button"
						disabled={busy}
						onClick={() => actions.signInWithOAuth(p.id)}
						className="flex items-center justify-center gap-2 rounded-lg border border-zinc-700 py-2 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 disabled:opacity-50">
						<span
							className="h-2.5 w-2.5 rounded-full"
							style={{ backgroundColor: p.color }}
						/>
						{p.label}
					</button>
				))}
			</div>

			<p className="mt-6 text-center text-sm text-zinc-400">
				{isSignUp ? 'Already have an account?' : 'Don’t have an account?'}{' '}
				<button
					type="button"
					onClick={switchMode}
					className="font-semibold text-quest-300 transition hover:text-quest-200">
					{isSignUp ? 'Sign in' : 'Create one'}
				</button>
			</p>

			<HCaptcha
				ref={captchaRef}
				sitekey={KBVE_HCAPTCHA_SITE_KEY}
				size="invisible"
				onVerify={onVerify}
				onExpire={() => captchaRef.current?.resetCaptcha()}
			/>
		</div>
	);
}
