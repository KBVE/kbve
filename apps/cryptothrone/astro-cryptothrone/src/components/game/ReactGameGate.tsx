import { useEffect, useState } from 'react';
import { KbveUsernameSetup } from '@kbve/astro';
import { authBridge, initSupa } from '@/lib/supa';
import { setCtNetConfig, resolveWsUrl } from '@/lib/net-config';
import ReactLoginButtons from '../auth/ReactLoginButtons';
import GameWindowLoader from './GameWindowLoader';

const KBVE_API_BASE = 'https://kbve.com';

type Phase = 'loading' | 'login' | 'username' | 'ready';

function kbveUsernameFromToken(token: string): string {
	try {
		const payload = token.split('.')[1];
		const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
		const claims = JSON.parse(json) as { kbve_username?: string };
		return claims.kbve_username ?? '';
	} catch {
		return '';
	}
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
		const name = kbveUsernameFromToken(accessToken);
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
		<div style={shell}>
			<div style={panel}>
				{phase === 'loading' && <p style={muted}>Checking session…</p>}

				{phase === 'login' && (
					<>
						<h2 style={title}>Sign in to play CryptoThrone</h2>
						<p style={muted}>
							CryptoThrone is members-only — no guests. Sign in
							with your KBVE account to enter the world.
						</p>
						<ReactLoginButtons />
					</>
				)}

				{phase === 'username' && (
					<KbveUsernameSetup
						accessToken={token}
						apiBaseUrl={KBVE_API_BASE}
						onComplete={async () => {
							await authBridge.refreshSession();
							await check();
						}}
					/>
				)}
			</div>
		</div>
	);
}

const shell: React.CSSProperties = {
	display: 'flex',
	justifyContent: 'center',
	alignItems: 'center',
	width: '100%',
	height: '100%',
	background: 'var(--ct-bg-deep, #1a1a2e)',
	padding: '1rem',
};

const panel: React.CSSProperties = {
	width: '100%',
	maxWidth: 420,
	textAlign: 'center',
	color: '#e6edf3',
};

const title: React.CSSProperties = {
	fontSize: '1.25rem',
	fontWeight: 600,
	margin: '0 0 0.5rem',
};

const muted: React.CSSProperties = {
	fontSize: '0.875rem',
	color: '#9ca0aa',
	margin: '0 0 1rem',
	lineHeight: 1.5,
};
