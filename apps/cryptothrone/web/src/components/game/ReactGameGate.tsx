import { useEffect, useState } from 'react';
import { KbveUsernameSetup } from '@kbve/astro';
import { initObserv } from '@kbve/observ';
import { authBridge, initSupa } from '@/lib/supa';
import { setCtNetConfig, resolveWsUrl } from '@/lib/net-config';
import ReactLoginButtons from '../auth/ReactLoginButtons';
import GameWindowLoader from './GameWindowLoader';

const KBVE_API_BASE = 'https://kbve.com';

initObserv({
	endpoint: 'https://metrics.kbve.com/api/v1/ingest/errors',
	project: 'cryptothrone',
	platform: 'web',
	environment: import.meta.env.MODE,
});

type Phase = 'loading' | 'login' | 'username' | 'ready';

function CrownIcon() {
	return (
		<svg
			className="h-10 w-10 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.45)]"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true">
			<path d="M3 8l3.5 4L12 5l5.5 7L21 8l-1.5 10.5a1 1 0 0 1-1 .5H5.5a1 1 0 0 1-1-.5L3 8z" />
			<path d="M8 16h8" />
		</svg>
	);
}

function GateShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#0c0a09] p-4">
			<div
				className="pointer-events-none absolute -top-1/4 left-1/2 h-[60vh] w-[60vw] -translate-x-1/2 rounded-full bg-amber-500/15 blur-3xl"
				aria-hidden="true"
			/>
			<div
				className="pointer-events-none absolute -bottom-1/3 -right-1/4 h-[50vh] w-[50vw] rounded-full bg-indigo-600/10 blur-3xl"
				aria-hidden="true"
			/>
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.04]"
				style={{
					backgroundImage:
						'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
					backgroundSize: '48px 48px',
					maskImage:
						'radial-gradient(ellipse 70% 60% at 50% 40%, #000 0%, transparent 75%)',
				}}
				aria-hidden="true"
			/>
			<div className="relative w-full max-w-sm rounded-2xl border border-amber-200/10 bg-black/60 p-8 text-center shadow-2xl shadow-black/60 backdrop-blur-xl">
				{children}
			</div>
		</div>
	);
}

function GateHeader({ tagline }: { tagline: string }) {
	return (
		<div className="mb-6 flex flex-col items-center gap-3">
			<CrownIcon />
			<h2 className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
				CryptoThrone
			</h2>
			<p className="text-sm leading-relaxed text-stone-400">{tagline}</p>
		</div>
	);
}

export default function ReactGameGate() {
	const [phase, setPhase] = useState<Phase>('loading');
	const [token, setToken] = useState('');
	const [username, setUsername] = useState('');

	async function check() {
		setPhase('loading');
		try {
			await initSupa();
		} catch {
			/* getSession resolves null when uninitialized */
		}
		const session = await authBridge.getSession();
		const accessToken = session?.access_token ?? '';
		if (!accessToken) {
			setPhase('login');
			return;
		}
		setToken(accessToken);
		const { usernameFromToken } = await import('@kbve/laser');
		const name = usernameFromToken(accessToken);
		if (!name) {
			setPhase('username');
			return;
		}
		setUsername(name);
		setCtNetConfig({
			jwt: accessToken,
			username: name,
			wsUrl: resolveWsUrl(),
		});
		setPhase('ready');
	}

	useEffect(() => {
		check();
	}, []);

	if (phase === 'ready') return <GameWindowLoader username={username} />;

	return (
		<GateShell>
			{phase === 'loading' && (
				<div className="flex flex-col items-center gap-4 py-8">
					<span
						className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/20 border-t-amber-400"
						aria-hidden="true"
					/>
					<p className="text-sm text-stone-400">Checking session…</p>
				</div>
			)}

			{phase === 'login' && (
				<>
					<GateHeader tagline="Sign in to claim your place in Cloud City. Members only — no guests beyond this point." />
					<ReactLoginButtons />
					<p className="mt-5 text-xs text-stone-500">
						One account works across every KBVE world.
					</p>
				</>
			)}

			{phase === 'username' && (
				<>
					<GateHeader tagline="Almost there — choose the name the realm will know you by." />
					<div className="text-left">
						<KbveUsernameSetup
							accessToken={token}
							apiBaseUrl={KBVE_API_BASE}
							onComplete={async () => {
								await authBridge.refreshSession();
								await check();
							}}
						/>
					</div>
				</>
			)}
		</GateShell>
	);
}
