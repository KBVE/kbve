import { useCallback, useEffect, useState } from 'react';
import { useSession, KbveUsernameSetup } from '@kbve/astro';
import { initSupa, getSupa } from '@/lib/supa';

type Phase = 'checking' | 'needed' | 'hidden';

async function getToken(): Promise<string | null> {
	try {
		await initSupa();
		const result = await getSupa()
			.getSession()
			.catch(() => null);
		return result?.session?.access_token ?? null;
	} catch {
		return null;
	}
}

export default function ReactUsernameGate() {
	const { ready, authenticated } = useSession();
	const [phase, setPhase] = useState<Phase>('checking');
	const [token, setToken] = useState<string | null>(null);

	useEffect(() => {
		if (!ready) return;
		if (!authenticated) {
			setPhase('hidden');
			return;
		}
		let live = true;
		(async () => {
			const access = await getToken();
			if (!access) {
				if (live) setPhase('hidden');
				return;
			}
			try {
				const res = await fetch('/api/v1/me', {
					headers: { Authorization: `Bearer ${access}` },
				});
				if (!res.ok) {
					if (live) setPhase('hidden');
					return;
				}
				const body = (await res.json().catch(() => null)) as {
					username?: string | null;
				} | null;
				if (!live) return;
				if (!body) {
					setPhase('hidden');
					return;
				}
				setToken(access);
				setPhase(body.username ? 'hidden' : 'needed');
			} catch {
				if (live) setPhase('hidden');
			}
		})();
		return () => {
			live = false;
		};
	}, [ready, authenticated]);

	const onComplete = useCallback(() => {
		setPhase('hidden');
		window.location.reload();
	}, []);

	if (phase !== 'needed' || !token) return null;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Choose your username"
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 1000,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				padding: '1rem',
				background: 'rgba(0, 0, 0, 0.6)',
				backdropFilter: 'blur(4px)',
				WebkitBackdropFilter: 'blur(4px)',
			}}>
			<div style={{ width: '100%', maxWidth: '28rem' }}>
				<KbveUsernameSetup
					accessToken={token}
					onComplete={onComplete}
				/>
			</div>
		</div>
	);
}
