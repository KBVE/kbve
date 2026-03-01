// src/components/ReactNav.tsx
// This component hydrates the static nav shell from NavContainer.astro
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { initSupa, getSupa } from '@/lib/supa';
import { useAuthBridge } from '@/components/auth';
import { cn } from '@/lib/utils';
import NavDropdown from './NavDropdown';

type Session = any;
type OAuthProvider = 'github' | 'twitch' | 'discord';

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

	const [ready, setReady] = useState(false);
	const [session, setSession] = useState<Session | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [modalOpen, setModalOpen] = useState(false);
	const [mounted, setMounted] = useState(false);

	// Failsafe: Track if already initialized to prevent double init
	const initRef = useRef(false);
	// Failsafe: Debounce auth updates
	const lastAuthUpdateRef = useRef<number>(0);
	const AUTH_DEBOUNCE_MS = 100;

	// Use the auth bridge for OAuth flows
	const { signInWithOAuth, loading: authLoading } = useAuthBridge();

	// Check if DOM elements are available
	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		// Failsafe: Prevent double initialization
		if (initRef.current) {
			console.warn('[ReactNav] Double initialization prevented');
			return;
		}
		initRef.current = true;

		let off: (() => void) | null = null;
		let isCancelled = false;

		(async () => {
			try {
				await initSupa();
				if (isCancelled) return;

				const supa = getSupa();

				const s = await supa.getSession().catch(() => null);
				if (isCancelled) return;

				setSession(s?.session ?? null);

				off = supa.on('auth', (msg: any) => {
					if (isCancelled) return;

					// Failsafe: Debounce rapid auth updates
					const now = Date.now();
					if (now - lastAuthUpdateRef.current < AUTH_DEBOUNCE_MS) {
						console.warn('[ReactNav] Rapid auth update debounced');
						return;
					}
					lastAuthUpdateRef.current = now;

					// Only update if session actually changed to prevent unnecessary re-renders
					setSession((prev: Session | null) => {
						const newSession = msg.session ?? null;
						// Compare by user ID to avoid object reference issues
						const prevUserId = prev?.user?.id;
						const newUserId = newSession?.user?.id;
						if (prevUserId === newUserId) {
							return prev; // Return same reference to prevent re-render
						}
						return newSession;
					});
				});
				setReady(true);
			} catch (e: any) {
				if (isCancelled) return;
				const errorMsg = e?.message ?? 'Failed to initialize Supabase';
				console.error('[ReactNav] Initialization error:', errorMsg);
				setError(errorMsg);
				setReady(true);
			}
		})();

		return () => {
			isCancelled = true;
			off?.();
		};
	}, []);

	const busy = authLoading;

	const state = useMemo(() => {
		if (!ready)
			return {
				tone: 'loading' as const,
				label: 'Loading…',
				displayName: 'KBVE',
				avatarUrl: undefined,
			};
		if (error)
			return {
				tone: 'error' as const,
				label: `Error: ${error}`,
				displayName: 'KBVE',
				avatarUrl: undefined,
			};
		if (!session?.user) {
			return {
				tone: 'anon' as const,
				label: 'Anonymous user',
				displayName: 'KBVE Guest',
				avatarUrl: undefined,
			};
		}

		const user = session.user;
		const displayName =
			user.user_metadata?.full_name ||
			user.user_metadata?.name ||
			user.email?.split('@')[0] ||
			'User';
		const avatarUrl =
			user.user_metadata?.avatar_url || user.user_metadata?.picture;

		return {
			tone: 'auth' as const,
			label: `Logged in as ${user.email}`,
			displayName,
			avatarUrl,
		};
	}, [ready, error, session]);

	async function handleOAuthSignIn(provider: OAuthProvider) {
		setError(null);
		try {
			await signInWithOAuth(provider);
			setModalOpen(false);
		} catch (err: any) {
			setError(err?.message ?? 'Sign-in failed');
		}
	}

	// Hide the static shell when React is ready
	useEffect(() => {
		if (!mounted) return;

		// Hide the static shell - it's no longer needed once React renders
		const staticShell = document.getElementById('nav-static-shell');
		if (staticShell) {
			staticShell.style.display = 'none';
		}
	}, [mounted]);

	// Handle login click - open OAuth modal
	const handleLogin = useCallback(() => {
		setModalOpen(true);
	}, []);

	// Handle logout click - redirect to logout page
	const handleLogout = useCallback(() => {
		window.location.href = '/auth/logout';
	}, []);

	if (!mounted) return null;

	return (
		<>
			{/* NavDropdown renders directly - React component is inside the nav */}
			<NavDropdown
				tone={state.tone}
				displayName={state.displayName}
				avatarUrl={state.avatarUrl}
				onLogin={handleLogin}
				onLogout={handleLogout}
			/>

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
