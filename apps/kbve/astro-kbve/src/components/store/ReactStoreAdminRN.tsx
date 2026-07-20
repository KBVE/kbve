import { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { $isStaff } from '@kbve/droid';
import { ShieldOff } from 'lucide-react';
import { useSession } from '@kbve/astro';
import { StoreAdminView } from '@kbve/rn/markets';
import { initSupa, getSupa } from '@/lib/supa';

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

const styles = {
	centered: {
		display: 'flex',
		flexDirection: 'column' as const,
		alignItems: 'center',
		justifyContent: 'center',
		gap: '1rem',
		minHeight: '40vh',
		textAlign: 'center' as const,
	},
	heading: { margin: 0, fontSize: '1.75rem', color: 'var(--sl-color-text, #e6edf3)' },
	sub: { margin: 0, color: 'var(--sl-color-gray-3, #8b949e)', maxWidth: '40rem' },
};

export default function ReactStoreAdminRN() {
	const { ready, authenticated } = useSession();
	const isStaff = useStore($isStaff);
	const token = useMemo(() => getToken, []);

	if (!ready) return null;
	if (!isStaff) {
		return (
			<div style={styles.centered}>
				<ShieldOff size={48} color="var(--sl-color-gray-3)" />
				<h2 style={styles.heading}>Staff Access Required</h2>
				<p style={styles.sub}>The store admin console is restricted to KBVE staff.</p>
			</div>
		);
	}
	return <StoreAdminView getToken={token} baseUrl="" authenticated={authenticated} />;
}
