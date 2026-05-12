import { useEffect, useState } from 'react';
import { getAccessToken, useSession } from '@kbve/astro';

/**
 * Compact wallet badge for the site navigation.
 *
 * Renders `1,000 KH · 0 C` style chip next to the username when signed in.
 * Hides itself for anon viewers, so the host can mount unconditionally
 * inside the nav. Lazy: only fires the balance fetch after the session
 * stabilizes.
 *
 * Refresh on tab focus so the badge picks up any redeem performed on
 * another tab without a full page reload.
 */

type Balance = {
	account_id: string;
	credits: number;
	khash: number;
	updated_at: string;
};

const styles = {
	badge: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.4rem',
		padding: '0.2rem 0.55rem',
		borderRadius: '9999px',
		background:
			'linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(16,185,129,0.18) 100%)',
		border: '1px solid rgba(255,255,255,0.1)',
		fontSize: '0.75rem',
		fontWeight: 600,
		color: 'rgba(255,255,255,0.9)',
		fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
		whiteSpace: 'nowrap',
	} as React.CSSProperties,
	chunk: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.25rem',
	} as React.CSSProperties,
	label: {
		fontSize: '0.6rem',
		fontWeight: 700,
		letterSpacing: '1px',
		textTransform: 'uppercase',
		opacity: 0.7,
	} as React.CSSProperties,
};

async function fetchBalance(): Promise<Balance | null> {
	const token = await getAccessToken();
	if (!token) return null;
	try {
		const res = await fetch('/api/v1/wallet/me/balance', {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!res.ok) return null;
		return (await res.json()) as Balance;
	} catch {
		return null;
	}
}

export function ReactWalletBadge() {
	const { ready, authenticated } = useSession();
	const [balance, setBalance] = useState<Balance | null>(null);

	useEffect(() => {
		if (!ready || !authenticated) {
			setBalance(null);
			return;
		}
		let alive = true;
		void fetchBalance().then((b) => {
			if (alive) setBalance(b);
		});
		const onFocus = () => {
			void fetchBalance().then((b) => {
				if (alive) setBalance(b);
			});
		};
		window.addEventListener('focus', onFocus);
		return () => {
			alive = false;
			window.removeEventListener('focus', onFocus);
		};
	}, [ready, authenticated]);

	if (!ready || !authenticated || !balance) return null;

	return (
		<a
			href="/account"
			style={{ ...styles.badge, textDecoration: 'none' }}
			aria-label={`Wallet: ${balance.khash} KHash, ${balance.credits} Credits`}
			title="Open wallet">
			<span style={styles.chunk}>
				<span>{balance.khash.toLocaleString()}</span>
				<span style={styles.label}>KH</span>
			</span>
			<span style={{ opacity: 0.35 }}>·</span>
			<span style={styles.chunk}>
				<span>{balance.credits.toLocaleString()}</span>
				<span style={styles.label}>C</span>
			</span>
		</a>
	);
}

export default ReactWalletBadge;
