import { useCallback, useRef, useState } from 'react';
import { authBridge } from '@/components/auth';
import ReactAuthLogin from './ReactAuthLogin';
import { KbveCaptcha, type KbveCaptchaHandle } from './KbveCaptcha';
import { cn } from '@/lib/utils';

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export default function ReactAuthRegister() {
	const [email, setEmail] = useState('');
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [agreed, setAgreed] = useState(false);
	const [peek, setPeek] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(false);
	const [captchaToken, setCaptchaToken] = useState<string | null>(null);

	const captchaRef = useRef<KbveCaptchaHandle>(null);

	const emailValid = EMAIL_RE.test(email.trim());
	const usernameValid = USERNAME_RE.test(username.trim());
	const passwordValid = password.length >= 8;
	const mismatch = confirm.length > 0 && password !== confirm;
	const verified = captchaToken !== null;
	const fieldsValid =
		emailValid &&
		usernameValid &&
		passwordValid &&
		!mismatch &&
		confirm.length > 0 &&
		agreed;
	const canSubmit = fieldsValid && verified && !busy;

	const resetCaptcha = useCallback(() => {
		captchaRef.current?.reset();
		setCaptchaToken(null);
	}, []);

	const onSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();
			if (!fieldsValid || busy) return;
			if (!captchaToken) {
				setError('Please solve the captcha first.');
				return;
			}
			setError(null);
			setBusy(true);
			try {
				await authBridge.signUpWithPassword({
					email: email.trim(),
					password,
					captchaToken,
					username: username.trim(),
				});
				setDone(true);
			} catch (err: any) {
				setError(err?.message ?? 'Sign-up failed');
				resetCaptcha();
			} finally {
				setBusy(false);
			}
		},
		[
			fieldsValid,
			busy,
			captchaToken,
			email,
			password,
			username,
			resetCaptcha,
		],
	);

	if (done) {
		return (
			<div className="reg reg--done">
				<div className="reg__check" aria-hidden="true">
					<svg
						viewBox="0 0 24 24"
						width="28"
						height="28"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round">
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
						<polyline points="22 4 12 14.01 9 11.01" />
					</svg>
				</div>
				<h2 className="reg__title">Check your email</h2>
				<p className="reg__lede">
					We sent a confirmation link to{' '}
					<strong>{email.trim()}</strong>. Click it to activate your
					account.
				</p>
			</div>
		);
	}

	return (
		<div className="reg">
			<h2 className="reg__title">Create your account</h2>
			<p className="reg__lede">
				One login for every KBVE game, tool, and studio.
			</p>

			<form className="reg__form" onSubmit={onSubmit} noValidate>
				<label className="reg__field">
					<span className="reg__label">Email</span>
					<input
						className="reg__input"
						type="email"
						autoComplete="email"
						placeholder="you@example.com"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
				</label>

				<label className="reg__field">
					<span className="reg__label">Username</span>
					<input
						className="reg__input"
						type="text"
						autoComplete="username"
						placeholder="lowercase, 3–20"
						value={username}
						onChange={(e) =>
							setUsername(e.target.value.toLowerCase())
						}
					/>
					<span className="reg__hint reg__hint--warn">
						{username.length > 0 && !usernameValid
							? 'a–z, 0–9, _ · 3–20 chars'
							: ' '}
					</span>
				</label>

				<label className="reg__field">
					<span className="reg__label">Password</span>
					<div className="reg__inputwrap">
						<input
							className="reg__input"
							type={peek ? 'text' : 'password'}
							autoComplete="new-password"
							placeholder="8+ characters"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
						<button
							type="button"
							className="reg__peek"
							onClick={() => setPeek((p) => !p)}
							aria-label={
								peek ? 'Hide password' : 'Show password'
							}>
							{peek ? 'Hide' : 'Show'}
						</button>
					</div>
				</label>

				<label className="reg__field">
					<span className="reg__label">Confirm password</span>
					<input
						className="reg__input"
						type={peek ? 'text' : 'password'}
						autoComplete="new-password"
						placeholder="repeat password"
						value={confirm}
						onChange={(e) => setConfirm(e.target.value)}
					/>
					<span className="reg__hint reg__hint--warn">
						{mismatch ? 'Passwords don’t match' : ' '}
					</span>
				</label>

				<label className="reg__agree">
					<input
						type="checkbox"
						checked={agreed}
						onChange={(e) => setAgreed(e.target.checked)}
					/>
					<span>
						I agree to the{' '}
						<a href="/legal/tos" target="_blank" rel="noopener">
							Terms
						</a>{' '}
						and{' '}
						<a href="/legal/privacy" target="_blank" rel="noopener">
							Privacy Policy
						</a>
						.
					</span>
				</label>

				<div className="reg__captcha">
					<span className="reg__label">Verify you’re human</span>
					<div className="reg__captcha-box">
						<KbveCaptcha
							ref={captchaRef}
							onVerify={(token) => {
								setCaptchaToken(token);
								setError(null);
							}}
							onExpire={() => setCaptchaToken(null)}
							onError={() => {
								setCaptchaToken(null);
								setError('Captcha failed — try again.');
							}}
						/>
					</div>
					<span
						className={cn(
							'reg__hint',
							verified ? 'reg__hint--ok' : 'reg__hint--muted',
						)}>
						{verified
							? '✓ Verified'
							: 'Solve the captcha to enable sign-up.'}
					</span>
				</div>

				{error && <div className="reg__error">{error}</div>}

				<button
					type="submit"
					className={cn('reg__submit', !canSubmit && 'is-disabled')}
					disabled={!canSubmit}>
					{busy ? 'Creating…' : 'Create account'}
				</button>
			</form>

			<div className="reg__divider">
				<span>or continue with</span>
			</div>

			<ReactAuthLogin />

			<p className="reg__foot">
				Already have an account? <a href="/auth/login">Sign in</a>
			</p>

			<style>{`
				.reg { width: 100%; max-width: 24rem; margin: 0 auto; text-align: left; }
				.reg--done { text-align: center; }
				.reg__check { display: inline-flex; margin-bottom: 0.75rem; color: var(--sl-color-green, #22c55e); }
				.reg__title { color: var(--sl-color-white); font-size: clamp(1.25rem, 3vw, 1.6rem); letter-spacing: -0.02em; margin: 0 0 0.35rem; }
				.reg__lede { color: var(--sl-color-gray-3); font-size: 0.875rem; line-height: 1.5; margin: 0 0 1.25rem; }
				.reg__form { display: flex; flex-direction: column; gap: 0.85rem; }
				.reg__field { display: flex; flex-direction: column; gap: 0.3rem; }
				.reg__label { font-size: 0.75rem; font-weight: 600; color: var(--sl-color-gray-2); }
				.reg__inputwrap { position: relative; display: flex; }
				.reg__input {
					width: 100%; padding: 0.6rem 0.75rem; font-size: 0.9rem;
					color: var(--sl-color-white);
					background: color-mix(in srgb, var(--sl-color-white) 5%, transparent);
					border: 1px solid var(--bento-hairline-strong, rgba(255,255,255,0.12));
					border-radius: 9px; outline: none;
				}
				.reg__input::placeholder { color: var(--sl-color-gray-4); }
				.reg__input:focus { border-color: var(--sl-color-accent); }
				.reg__peek {
					position: absolute; right: 0.4rem; top: 50%; transform: translateY(-50%);
					background: transparent; border: none; color: var(--sl-color-gray-3);
					font-size: 0.7rem; font-weight: 600; cursor: pointer; padding: 0.2rem 0.4rem;
				}
				.reg__peek:hover { color: var(--sl-color-white); }
				.reg__hint { font-size: 0.7rem; min-height: 0.9rem; line-height: 0.9rem; white-space: pre; }
				.reg__hint--warn { color: var(--color-red, #f87171); }
				.reg__hint--ok { color: var(--sl-color-green, #22c55e); font-weight: 600; }
				.reg__hint--muted { color: var(--sl-color-gray-4); }
				.reg__captcha { display: flex; flex-direction: column; gap: 0.4rem; }
				.reg__captcha-box { min-height: 78px; }
				.reg__agree { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.75rem; color: var(--sl-color-gray-3); line-height: 1.4; }
				.reg__agree input { margin-top: 0.15rem; accent-color: var(--sl-color-accent); }
				.reg__agree a { color: var(--sl-color-text-accent, var(--sl-color-accent)); }
				.reg__error {
					font-size: 0.8rem; color: var(--color-red, #f87171);
					background: color-mix(in srgb, var(--color-red, #ef4444) 12%, transparent);
					border-radius: 8px; padding: 0.5rem 0.7rem;
				}
				.reg__submit {
					padding: 0.7rem 1rem; font-size: 0.9rem; font-weight: 600;
					color: var(--sl-color-black); background: var(--sl-color-accent-high, var(--sl-color-accent));
					border: none; border-radius: 9px; cursor: pointer; transition: opacity 160ms ease;
				}
				.reg__submit.is-disabled { opacity: 0.5; cursor: not-allowed; }
				.reg__divider { display: flex; align-items: center; gap: 0.75rem; margin: 1.25rem 0 0.9rem; color: var(--sl-color-gray-4); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; }
				.reg__divider::before, .reg__divider::after { content: ''; flex: 1; height: 1px; background: var(--bento-hairline, rgba(255,255,255,0.08)); }
				.reg__foot { margin: 1rem 0 0; font-size: 0.8rem; color: var(--sl-color-gray-3); text-align: center; }
				.reg__foot a { color: var(--sl-color-text-accent, var(--sl-color-accent)); }
			`}</style>
		</div>
	);
}
