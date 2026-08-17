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

	return <KbveUsernameSetup accessToken={token} onComplete={onComplete} />;
}
