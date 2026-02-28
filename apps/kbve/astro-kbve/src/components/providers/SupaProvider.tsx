import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { initSupa, getSupa } from '@/lib/supa';

type Session = any; // bring in proper Supabase types if you like

type Ctx = {
	supa: ReturnType<typeof getSupa> | null;
	session: Session | null;
	ready: boolean;
};

const SupaCtx = createContext<Ctx>({ supa: null, session: null, ready: false });

export function SupaProvider({ children }: { children: ReactNode }) {
	const [session, setSession] = useState<Session | null>(null);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		let off: (() => void) | null = null;
		let wsInitialized = false;

		(async () => {
			await initSupa();
			const supa = getSupa();

			// initial session
			const s = await supa.getSession().catch(() => null);
			setSession(s?.session ?? null);

			// If user is already authenticated, connect WebSocket
			if (s?.session && !wsInitialized) {
				try {
					await supa.connectWebSocket();
					wsInitialized = true;
					console.log(
						'[SupaProvider] WebSocket connected for authenticated user',
					);
				} catch (wsError) {
					console.error(
						'[SupaProvider] Failed to connect WebSocket:',
						wsError,
					);
				}
			}

			// live updates broadcast from the worker
			off = supa.on('auth', async (msg) => {
				const newSession = msg.session ?? null;
				setSession(newSession);

				// Connect WebSocket when user authenticates
				if (newSession && !wsInitialized) {
					try {
						await supa.connectWebSocket();
						wsInitialized = true;
						console.log(
							'[SupaProvider] WebSocket connected after authentication',
						);
					} catch (wsError) {
						console.error(
							'[SupaProvider] Failed to connect WebSocket:',
							wsError,
						);
					}
				} else if (!newSession && wsInitialized) {
					// Disconnect WebSocket when user logs out
					try {
						await supa.disconnectWebSocket();
						wsInitialized = false;
						console.log(
							'[SupaProvider] WebSocket disconnected after logout',
						);
					} catch (wsError) {
						console.error(
							'[SupaProvider] Failed to disconnect WebSocket:',
							wsError,
						);
					}
				}
			});

			setReady(true);
		})();

		return () => off?.();
	}, []);

	const value = useMemo<Ctx>(
		() => ({ supa: ready ? getSupa() : null, session, ready }),
		[session, ready],
	);
	return <SupaCtx.Provider value={value}>{children}</SupaCtx.Provider>;
}

export function useSupa() {
	const { supa, ready } = useContext(SupaCtx);
	if (!ready || !supa)
		throw new Error(
			'useSupa: not ready (wrap in <SupaProvider /> and use a client island)',
		);
	return supa;
}

export function useSession() {
	const { session, ready } = useContext(SupaCtx);
	return { session, ready };
}
