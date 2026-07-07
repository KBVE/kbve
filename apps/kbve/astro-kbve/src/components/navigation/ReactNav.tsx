import {
	lazy,
	Suspense,
	useEffect,
	useMemo,
	useRef,
	useState,
	useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { initSupa } from '@/lib/supa';
import { useAuthBridge } from '@/components/auth';
import { $auth, DroidEvents, AuthFlags, hasAuthFlag } from '@kbve/droid';
import { useStore } from '@nanostores/react';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@kbve/rn/ui/ThemeProvider';
import type { ThemeOverride } from '@kbve/rn/ui/theme';

// Cross-platform account sheet from @kbve/rn (react-native-web on the web).
// Lazy — the RN kit only loads once the user opens the menu.
const AccountSheet = lazy(() =>
	import('@kbve/rn/ui/overlays/AccountSheet').then((m) => ({
		default: m.AccountSheet,
	})),
);

// Map the live Starlight palette into the RN theme so the sheet blends with
// the site while staying pure RN. Native builds skip this and keep their
// default tokens.
function readStarlightTheme(): ThemeOverride {
	if (typeof window === 'undefined') return {};
	const cs = getComputedStyle(document.documentElement);
	const pick = (...names: string[]) => {
		for (const n of names) {
			const v = cs.getPropertyValue(n).trim();
			if (v) return v;
		}
		return '';
	};
	const entries: [keyof NonNullable<ThemeOverride['color']>, string][] = [
		['bg', pick('--sl-color-bg')],
		[
			'surface',
			pick('--sl-color-bg-nav', '--sl-color-gray-6', '--sl-color-black'),
		],
		['surfaceAlt', pick('--sl-color-gray-5', '--sl-color-gray-6')],
		['border', pick('--bento-hairline-strong', '--sl-color-gray-5')],
		['text', pick('--sl-color-white', '--sl-color-text')],
		['textMuted', pick('--sl-color-gray-3')],
		['textFaint', pick('--sl-color-gray-4')],
		['primary', pick('--sl-color-accent')],
		['primaryDeep', pick('--sl-color-accent-high')],
		['onPrimary', pick('--sl-color-black', '--sl-color-bg')],
		['success', pick('--sl-color-green')],
		['danger', pick('--sl-color-red')],
		['warning', pick('--sl-color-orange')],
	];
	const color: Record<string, string> = {};
	for (const [k, v] of entries) if (v) color[k] = v;
	return { color };
}

type OAuthProvider = 'github' | 'twitch' | 'discord';

const PROFILE_GLYPH = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" style="opacity:0.8"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

const FADE_MS = 160;

function fadeSwap(el: HTMLElement, apply: () => void) {
	el.style.opacity = '0';
	window.setTimeout(() => {
		apply();
		el.style.opacity = '1';
	}, FADE_MS);
}

// Failsafe: Track render count to detect infinite loops
const MAX_RENDERS_PER_SECOND = 20;
let renderCount = 0;
let lastRenderTime = Date.now();

export default function ReactNav() {
	// Failsafe: Detect infinite render loops
	const now = Date.now();
	if (now - lastRenderTime < 1000) {
		renderCount++;
		if (renderCount > MAX_RENDERS_PER_SECOND) {
			console.warn(
				'[ReactNav] Infinite render loop detected after',
				renderCount,
				'renders. Bailing out to prevent browser freeze.',
			);
			return null;
		}
	} else {
		renderCount = 1;
		lastRenderTime = now;
	}

	const auth = useStore($auth);

	// Owns the auth-gate attributes on <html> so the dashboard gutter's
	// CSS gate (html[data-auth-tone='staff']) resolves off one store.
	useEffect(() => {
		const root = document.documentElement;
		root.dataset.authFlags = String(auth.flags);
		if (auth.tone === 'auth' || auth.tone === 'anon') {
			root.dataset.authTone = hasAuthFlag(auth.flags, AuthFlags.STAFF)
				? 'staff'
				: auth.tone;
		}
	}, [auth.flags, auth.tone]);

	const [error, setError] = useState<string | null>(null);
	const [modalOpen, setModalOpen] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const [everOpened, setEverOpened] = useState(false);
	const [mounted, setMounted] = useState(false);

	const { signInWithOAuth, loading: authLoading } = useAuthBridge();

	useEffect(() => {
		setMounted(true);
	}, []);

	// Boot the gateway (bootAuth populates $auth). DroidEvents clear the
	// timeout; the timeout is a fallback if the events never fire.
	useEffect(() => {
		const AUTH_TIMEOUT_MS = 8000;
		let settled = false;

		const cancel = () => {
			settled = true;
			clearTimeout(timeout);
		};

		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			if ($auth.get().tone === 'loading') {
				console.warn(
					'[ReactNav] Auth timed out after',
					AUTH_TIMEOUT_MS,
					'ms',
				);
				setError('Auth timed out');
			}
		}, AUTH_TIMEOUT_MS);

		const onReady = () => cancel();
		const onError = (payload: { message: string }) => {
			cancel();
			setError(payload.message);
		};
		DroidEvents.on('auth-ready', onReady);
		DroidEvents.on('auth-error', onError);

		initSupa()
			.then(() => cancel())
			.catch((e: any) => {
				cancel();
				console.error('[ReactNav] Initialization error:', e?.message);
				setError(e?.message ?? 'Failed to initialize Supabase');
			});

		return () => {
			clearTimeout(timeout);
			DroidEvents.off('auth-ready', onReady);
			DroidEvents.off('auth-error', onError);
		};
	}, []);

	const busy = authLoading;

	// Any error or timeout degrades to 'anon' (guest) — never show 'error' or
	// stuck 'loading' to the user. They can retry sign-in from the menu.
	const tone = auth.tone === 'loading' && error ? 'anon' : auth.tone;
	const displayName =
		tone === 'auth'
			? auth.username
				? `@${auth.username}`
				: auth.name
			: tone === 'loading'
				? 'Loading…'
				: 'Guest';
	const avatarUrl = auth.avatar;

	async function handleOAuthSignIn(provider: OAuthProvider) {
		setError(null);
		try {
			await signInWithOAuth(provider);
			setModalOpen(false);
		} catch (err: any) {
			setError(err?.message ?? 'Sign-in failed');
		}
	}

	useEffect(() => {
		if (!mounted) return;
		const btn = document.getElementById('knav-profile-trigger');
		if (!btn) return;
		const open = () => {
			setEverOpened(true);
			setMenuOpen(true);
		};
		btn.addEventListener('click', open);
		return () => btn.removeEventListener('click', open);
	}, [mounted]);

	const lastName = useRef('Guest');
	const lastAvatar = useRef<string | undefined>(undefined);

	useEffect(() => {
		if (!mounted) return;
		const btn = document.getElementById('knav-profile-trigger');
		if (btn) btn.setAttribute('data-auth-tone', tone);
		// Keep the static default until auth resolves — single clean fade,
		// no flicker through 'Loading…'.
		if (tone === 'loading') return;

		const nameEl = document.getElementById('knav-profile-name');
		const avaEl = document.getElementById('knav-profile-avatar');

		if (nameEl && lastName.current !== displayName) {
			lastName.current = displayName;
			fadeSwap(nameEl, () => {
				nameEl.textContent = displayName;
			});
		}
		if (avaEl && lastAvatar.current !== avatarUrl) {
			lastAvatar.current = avatarUrl;
			fadeSwap(avaEl, () => {
				if (avatarUrl) {
					const img = document.createElement('img');
					img.src = avatarUrl;
					img.alt = displayName;
					avaEl.replaceChildren(img);
				} else {
					avaEl.innerHTML = PROFILE_GLYPH;
				}
			});
		}
	}, [mounted, tone, displayName, avatarUrl]);

	useEffect(() => {
		const btn = document.getElementById('knav-profile-trigger');
		if (btn) btn.setAttribute('aria-expanded', String(menuOpen));
	}, [menuOpen]);

	const handleLogin = useCallback(() => {
		setMenuOpen(false);
		setModalOpen(true);
	}, []);

	const handleLogout = useCallback(() => {
		window.location.href = '/auth/logout';
	}, []);

	const sheetTheme = useMemo(
		() => (everOpened ? readStarlightTheme() : {}),
		[everOpened, menuOpen],
	);

	if (!mounted) return null;

	return (
		<>
			{everOpened && (
				<Suspense fallback={null}>
					<ThemeProvider theme={sheetTheme}>
						<AccountSheet
							visible={menuOpen}
							onClose={() => setMenuOpen(false)}
							isAuth={tone === 'auth'}
							displayName={displayName}
							avatarUrl={avatarUrl}
							onLogin={handleLogin}
							onLogout={handleLogout}
							onNavigate={(href: string) => {
								window.location.href = href;
							}}
						/>
					</ThemeProvider>
				</Suspense>
			)}

			{/* Auth modal for OAuth sign-in */}
			{modalOpen &&
				createPortal(
					<div
						className="fixed top-0 left-0 right-0 bottom-0 z-50 bg-black/40 p-4"
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							minHeight: '100vh',
						}}
						role="dialog"
						aria-modal="true"
						aria-label="Sign in"
						onClick={(e) => {
							if (e.target === e.currentTarget && !busy)
								setModalOpen(false);
						}}>
						<div
							className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 shadow-xl p-4"
							style={{ margin: 'auto' }}>
							<div className="flex items-center justify-between mb-2">
								<h2 className="text-base font-semibold">
									Sign in
								</h2>
								<button
									className="px-2 py-1 rounded-md text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800"
									onClick={() => !busy && setModalOpen(false)}
									aria-label="Close">
									✕
								</button>
							</div>

							{error && (
								<div className="mb-3 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 rounded-md px-2 py-1">
									{error}
								</div>
							)}

							<div className="space-y-2">
								<button
									type="button"
									onClick={() => handleOAuthSignIn('github')}
									disabled={busy}
									className={cn(
										'w-full inline-flex items-center justify-center gap-2 rounded-lg',
										'border border-gray-300 dark:border-zinc-700',
										'bg-white dark:bg-zinc-900',
										'text-gray-900 dark:text-gray-100',
										'text-sm font-medium px-3 py-2',
										'hover:bg-gray-50 dark:hover:bg-zinc-800',
										'disabled:opacity-60 transition-colors',
									)}>
									<svg
										className="w-4 h-4"
										fill="currentColor"
										viewBox="0 0 24 24">
										<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
									</svg>
									Sign in with GitHub
								</button>

								<button
									type="button"
									onClick={() => handleOAuthSignIn('twitch')}
									disabled={busy}
									className={cn(
										'w-full inline-flex items-center justify-center gap-2 rounded-lg',
										'bg-purple-600 text-white',
										'text-sm font-medium px-3 py-2',
										'hover:bg-purple-700',
										'disabled:opacity-60 transition-colors',
									)}>
									<svg
										className="w-4 h-4"
										fill="currentColor"
										viewBox="0 0 24 24">
										<path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
									</svg>
									Sign in with Twitch
								</button>

								<button
									type="button"
									onClick={() => handleOAuthSignIn('discord')}
									disabled={busy}
									className={cn(
										'w-full inline-flex items-center justify-center gap-2 rounded-lg',
										'bg-indigo-600 text-white',
										'text-sm font-medium px-3 py-2',
										'hover:bg-indigo-700',
										'disabled:opacity-60 transition-colors',
									)}>
									<svg
										className="w-4 h-4"
										fill="currentColor"
										viewBox="0 0 24 24">
										<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
									</svg>
									Sign in with Discord
								</button>
							</div>

							<p className="mt-3 text-[11px] text-gray-500">
								The SharedWorker will automatically sync your
								session across all tabs.
							</p>
						</div>
					</div>,
					document.body,
				)}
		</>
	);
}
