import { useRef } from 'react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import {
	KBVE_HCAPTCHA_SITE_KEY,
	useAuthActions,
	useAuthForm,
} from '@kbve/rn/auth';
import type { OAuthProvider } from '@kbve/core';
import { PeekMascot, DiscordIcon, GitHubIcon, TwitchIcon } from '@kbve/rn/ui';

interface Provider {
	id: OAuthProvider;
	label: string;
	color: string;
	Icon: React.ComponentType<{ size?: number; color?: string }>;
}

const PROVIDERS: Provider[] = [
	{ id: 'discord', label: 'Discord', color: '#5865F2', Icon: DiscordIcon },
	{ id: 'github', label: 'GitHub', color: '#e6edf3', Icon: GitHubIcon },
	{ id: 'twitch', label: 'Twitch', color: '#9146FF', Icon: TwitchIcon },
];

const inputCls =
	'w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 transition focus:border-quest-500 focus:outline-none';

export function LoginForm() {
	const actions = useAuthActions();
	const captchaRef = useRef<HCaptcha>(null);
	const form = useAuthForm();
	const {
		isSignUp,
		busy,
		error,
		email,
		password,
		confirm,
		agreed,
		peeking,
		emailValid,
		mismatch,
		canSubmit,
		submitLabel,
		setEmail,
		setPassword,
		setConfirm,
		setAgreed,
		setPeeking,
		setCaptchaToken,
		switchMode,
	} = form;

	// Inline checkbox captcha: the user clicks the hCaptcha widget itself, which
	// manages its own readiness and challenge popup — no programmatic execute(),
	// so there's no "iframe not loaded yet, click twice" race. Solving stores
	// the token; submit stays gated on canSubmit (which requires `verified`).
	const clearToken = () => setCaptchaToken(null);

	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		const result = form.submit();
		// Token consumed/expired — reset the widget so the user re-checks.
		if (result.status === 'authenticating')
			captchaRef.current?.resetCaptcha();
	};

	const peekProps = {
		onFocus: () => setPeeking(true),
		onBlur: () => setPeeking(false),
	};

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
					className={`${inputCls} ${email.length > 0 && !emailValid ? 'border-red-500' : ''}`}
					placeholder="Email"
					autoComplete="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
				<input
					type="password"
					className={inputCls}
					placeholder="Password"
					autoComplete={
						isSignUp ? 'new-password' : 'current-password'
					}
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

				{/* Human check — solve before sign in. The inline widget manages
				    its own challenge popup; canSubmit stays false until solved. */}
				<div className="flex min-h-[78px] justify-center">
					<HCaptcha
						ref={captchaRef}
						sitekey={KBVE_HCAPTCHA_SITE_KEY}
						theme="dark"
						onVerify={(token) => setCaptchaToken(token)}
						onExpire={clearToken}
						onError={clearToken}
					/>
				</div>

				{error && <p className="text-sm text-red-400">{error}</p>}

				<button
					type="submit"
					disabled={!canSubmit}
					className="w-full rounded-lg bg-quest-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-quest-900/40 transition hover:bg-quest-400 disabled:cursor-not-allowed disabled:opacity-60">
					{busy ? 'Please wait…' : submitLabel}
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
						<span className="flex">
							<p.Icon size={16} color={p.color} />
						</span>
						{p.label}
					</button>
				))}
			</div>

			<p className="mt-6 text-center text-sm text-zinc-400">
				{isSignUp
					? 'Already have an account?'
					: 'Don’t have an account?'}{' '}
				<button
					type="button"
					onClick={switchMode}
					className="font-semibold text-quest-300 transition hover:text-quest-200">
					{isSignUp ? 'Sign in' : 'Create one'}
				</button>
			</p>
		</div>
	);
}
