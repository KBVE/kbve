import { useCallback, useEffect, useRef, useState } from 'react';
import { authBridge } from '@/components/auth';
import ReactAuthLogin from './ReactAuthLogin';
import { KbveCaptcha, type KbveCaptchaHandle } from './KbveCaptcha';
import { cn } from '@/lib/utils';

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export default function ReactAuthGateModal() {
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [peek, setPeek] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [captchaToken, setCaptchaToken] = useState<string | null>(null);

	const captchaRef = useRef<KbveCaptchaHandle>(null);

	const emailValid = EMAIL_RE.test(email.trim());
	const canSubmit =
		emailValid && password.length >= 8 && captchaToken !== null && !busy;

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const session = await authBridge.getSession();
				if (!cancelled && !session) setOpen(true);
			} catch {
				if (!cancelled) setOpen(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!open) return;
		const root = document.documentElement;
		const prev = root.style.overflow;
		root.style.overflow = 'hidden';
		return () => {
			root.style.overflow = prev;
		};
	}, [open]);

	const onSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();
			if (!canSubmit || !captchaToken) return;
			setError(null);
			setBusy(true);
			try {
				await authBridge.signInWithPassword({
					email: email.trim(),
					password,
					captchaToken,
				});
				window.location.reload();
			} catch (err: any) {
				setError(err?.message ?? 'Sign-in failed');
				setBusy(false);
				setCaptchaToken(null);
				captchaRef.current?.reset();
			}
		},
		[canSubmit, captchaToken, email, password],
	);

	if (!open) return null;

	return (
		<div className="auth-gate-overlay">
			<div
				className="auth-gate"
				role="dialog"
				aria-modal="true"
				aria-labelledby="auth-gate-title">
				<p className="auth-gate__eyebrow">Members only</p>
				<h2 className="auth-gate__title" id="auth-gate-title">
					Sign in to KBVE
				</h2>
				<p className="auth-gate__lede">
					This page is for registered users. Sign in to view your
					wallet, credits, and referrals.
				</p>

				<form
					className="auth-gate__form"
					onSubmit={onSubmit}
					noValidate>
					<label className="auth-gate__field">
						<span className="auth-gate__label">Email</span>
						<input
							className="auth-gate__input"
							type="email"
							autoComplete="email"
							placeholder="you@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
					</label>

					<label className="auth-gate__field">
						<span className="auth-gate__label">Password</span>
						<div className="auth-gate__inputwrap">
							<input
								className="auth-gate__input"
								type={peek ? 'text' : 'password'}
								autoComplete="current-password"
								placeholder="8+ characters"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
							<button
								type="button"
								className="auth-gate__peek"
								onClick={() => setPeek((p) => !p)}
								aria-label={
									peek ? 'Hide password' : 'Show password'
								}>
								{peek ? 'Hide' : 'Show'}
							</button>
						</div>
					</label>

					<div className="auth-gate__captcha">
						<KbveCaptcha
							ref={captchaRef}
							onVerify={(token) => setCaptchaToken(token)}
							onExpire={() => setCaptchaToken(null)}
							onError={() => {
								setCaptchaToken(null);
								setError('Captcha failed — try again.');
							}}
						/>
					</div>

					{error && <div className="auth-gate__error">{error}</div>}

					<button
						type="submit"
						className={cn(
							'auth-gate__submit',
							!canSubmit && 'is-disabled',
						)}
						disabled={!canSubmit}>
						{busy ? 'Signing in…' : 'Sign in'}
					</button>
				</form>

				<div className="auth-gate__divider">
					<span>or sign in with</span>
				</div>

				<ReactAuthLogin compact />

				<p className="auth-gate__foot">
					New to KBVE? <a href="/register/">Create an account</a>
				</p>
			</div>

			<style>{`
				.auth-gate-overlay {
					position: fixed;
					inset: 0;
					z-index: 8000;
					display: grid;
					place-items: center;
					padding: 1rem;
					background: rgba(0, 0, 0, 0.55);
					-webkit-backdrop-filter: blur(6px);
					backdrop-filter: blur(6px);
				}
				.auth-gate {
					width: min(24rem, 100%);
					max-height: calc(100dvh - 2rem);
					overflow-y: auto;
					overscroll-behavior: contain;
					scrollbar-width: none;
					padding: 1.75rem 1.5rem 1.5rem;
					color: var(--sl-color-gray-2);
					background: color-mix(in srgb, var(--sl-color-black) 88%, transparent);
					border: 1px solid var(--bento-hairline-strong, rgba(255,255,255,0.1));
					border-radius: 1rem;
					box-shadow:
						0 0 0 1px color-mix(in srgb, var(--sl-color-accent-high) 25%, transparent),
						0 24px 60px rgba(0, 0, 0, 0.6);
					-webkit-backdrop-filter: blur(14px);
					backdrop-filter: blur(14px);
				}
				.auth-gate::-webkit-scrollbar { display: none; }
				@media (max-width: 480px) {
					.auth-gate {
						padding: 1.5rem 1.125rem 1.25rem;
					}
				}
				.auth-gate__eyebrow {
					margin: 0 0 0.4rem;
					font-size: 0.6875rem; font-weight: 600;
					letter-spacing: 0.1em; text-transform: uppercase;
					color: var(--sl-color-accent-high);
				}
				.auth-gate__title {
					margin: 0 0 0.35rem;
					font-size: 1.35rem; font-weight: 700; letter-spacing: -0.02em;
					color: var(--sl-color-white);
				}
				.auth-gate__lede {
					margin: 0 0 1.25rem;
					font-size: 0.85rem; line-height: 1.5;
					color: var(--sl-color-gray-3);
				}
				.auth-gate__form { display: flex; flex-direction: column; gap: 0.85rem; }
				.auth-gate__field { display: flex; flex-direction: column; gap: 0.3rem; }
				.auth-gate__label { font-size: 0.75rem; font-weight: 600; color: var(--sl-color-gray-2); }
				.auth-gate__inputwrap { position: relative; display: flex; }
				.auth-gate__input {
					width: 100%; padding: 0.6rem 0.75rem; font-size: 0.9rem;
					color: var(--sl-color-white);
					background: color-mix(in srgb, var(--sl-color-white) 5%, transparent);
					border: 1px solid var(--bento-hairline-strong, rgba(255,255,255,0.12));
					border-radius: 9px; outline: none;
				}
				.auth-gate__input::placeholder { color: var(--sl-color-gray-4); }
				.auth-gate__input:focus { border-color: var(--sl-color-accent); }
				.auth-gate__peek {
					position: absolute; right: 0.4rem; top: 50%; transform: translateY(-50%);
					background: transparent; border: none; color: var(--sl-color-gray-3);
					font-size: 0.7rem; font-weight: 600; cursor: pointer; padding: 0.2rem 0.4rem;
				}
				.auth-gate__peek:hover { color: var(--sl-color-white); }
				.auth-gate__captcha { display: flex; justify-content: center; min-height: 78px; }
				.auth-gate__error {
					font-size: 0.8rem; color: var(--color-red, #f87171);
					background: color-mix(in srgb, var(--color-red, #ef4444) 12%, transparent);
					border-radius: 8px; padding: 0.5rem 0.7rem;
				}
				.auth-gate__submit {
					padding: 0.7rem 1rem; font-size: 0.9rem; font-weight: 600;
					color: var(--sl-color-black);
					background: var(--sl-color-accent-high, var(--sl-color-accent));
					border: none; border-radius: 9px; cursor: pointer;
					transition: opacity 160ms ease;
				}
				.auth-gate__submit.is-disabled { opacity: 0.5; cursor: not-allowed; }
				.auth-gate__divider {
					display: flex; align-items: center; gap: 0.75rem;
					margin: 1.1rem 0 0.85rem;
					color: var(--sl-color-gray-4);
					font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em;
				}
				.auth-gate__divider::before, .auth-gate__divider::after {
					content: ''; flex: 1; height: 1px;
					background: var(--bento-hairline, rgba(255,255,255,0.08));
				}
				.auth-gate .auth-buttons { display: flex; flex-direction: column; gap: 0.5rem; }
				.auth-gate .auth-button {
					display: flex; align-items: center; justify-content: center; gap: 0.5rem;
					padding: 0.6rem 1rem; font-size: 0.85rem; font-weight: 600;
					color: white; border: none; border-radius: 9px; cursor: pointer;
					transition: background-color 140ms ease, opacity 140ms ease;
				}
				.auth-gate .auth-button:disabled { opacity: 0.6; cursor: wait; }
				.auth-gate .auth-button.github { background-color: #24292e; }
				.auth-gate .auth-button.github:hover:not(:disabled) { background-color: #2f363d; }
				.auth-gate .auth-button.twitch { background-color: #9146ff; }
				.auth-gate .auth-button.twitch:hover:not(:disabled) { background-color: #7d2ff2; }
				.auth-gate .auth-button.discord { background-color: #5865f2; }
				.auth-gate .auth-button.discord:hover:not(:disabled) { background-color: #4752c4; }
				.auth-gate .auth-icon { width: 16px; height: 16px; }
				.auth-gate__foot {
					margin: 1.1rem 0 0; text-align: center;
					font-size: 0.8rem; color: var(--sl-color-gray-3);
				}
				.auth-gate__foot a { color: var(--sl-color-accent-high); }
			`}</style>
		</div>
	);
}
