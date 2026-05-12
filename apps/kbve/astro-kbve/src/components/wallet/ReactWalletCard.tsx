import { useCallback, useEffect, useState } from 'react';
import { getAccessToken, useSession } from '@kbve/astro';

/**
 * Self-contained wallet card.
 *
 * Renders balance + claim affordance for ANY authenticated viewer (the
 * server's /me/* endpoints always return the caller's own wallet, so there
 * is no ownership gate to add). Hides itself entirely for anon viewers,
 * so it is safe to drop into any page without a separate "is logged in"
 * branch on the host side.
 *
 * The profile-specific variant (ownership-checked against the page's
 * `<meta name="kbve-profile-username">`) lives in
 * `providers/ReactProfileWallet.tsx`. This component is the "show my wallet
 * anywhere I'm signed in" variant for /mc/, /account/, etc.
 */

type Balance = {
	account_id: string;
	credits: number;
	khash: number;
	updated_at: string;
};

type Coupon = {
	coupon_id: number;
	template_code: string;
	template_label: string;
	reward_kind: string;
	reward_payload: Record<string, unknown>;
	status: 'unredeemed' | 'redeemed' | 'expired' | 'revoked';
	granted_at: string;
	expires_at: string | null;
	redeemed_at: string | null;
};

type RedeemResult = {
	success: boolean;
	reward_kind: string;
	reward_payload: Record<string, unknown>;
	ledger_id: number;
};

const styles = {
	container: {
		marginTop: '1rem',
		padding: '1.25rem',
		borderRadius: '16px',
		background:
			'linear-gradient(145deg, rgba(30,41,59,0.9) 0%, rgba(15,23,42,0.95) 100%)',
		border: '1px solid rgba(255,255,255,0.08)',
		color: 'rgba(255,255,255,0.9)',
		boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
	} as React.CSSProperties,
	header: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: '0.85rem',
	} as React.CSSProperties,
	title: {
		fontSize: '0.85rem',
		fontWeight: 700,
		letterSpacing: '2px',
		textTransform: 'uppercase',
	} as React.CSSProperties,
	balances: {
		display: 'grid',
		gridTemplateColumns: '1fr 1fr',
		gap: '0.75rem',
	} as React.CSSProperties,
	balanceCard: {
		padding: '0.85rem 1rem',
		borderRadius: '12px',
		background: 'rgba(255,255,255,0.04)',
		border: '1px solid rgba(255,255,255,0.06)',
	} as React.CSSProperties,
	balanceLabel: {
		fontSize: '0.7rem',
		fontWeight: 600,
		letterSpacing: '1.5px',
		textTransform: 'uppercase',
		color: 'rgba(255,255,255,0.55)',
	} as React.CSSProperties,
	balanceValue: {
		marginTop: '0.25rem',
		fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
		fontSize: '1.5rem',
		fontWeight: 700,
	} as React.CSSProperties,
	coupons: {
		marginTop: '1rem',
		display: 'flex',
		flexDirection: 'column',
		gap: '0.5rem',
	} as React.CSSProperties,
	coupon: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: '0.75rem',
		padding: '0.6rem 0.85rem',
		borderRadius: '10px',
		background: 'rgba(16,185,129,0.08)',
		border: '1px solid rgba(16,185,129,0.25)',
	} as React.CSSProperties,
	couponLabel: {
		fontSize: '0.9rem',
		fontWeight: 600,
	} as React.CSSProperties,
	claimBtn: {
		padding: '0.4rem 0.9rem',
		borderRadius: '8px',
		border: '1px solid rgba(16,185,129,0.5)',
		background: 'linear-gradient(135deg,#10b981 0%,#059669 100%)',
		color: 'white',
		fontWeight: 700,
		cursor: 'pointer',
	} as React.CSSProperties,
	muted: {
		marginTop: '0.5rem',
		fontSize: '0.8rem',
		color: 'rgba(255,255,255,0.5)',
	} as React.CSSProperties,
	error: {
		marginTop: '0.5rem',
		fontSize: '0.8rem',
		color: 'rgb(248,113,113)',
	} as React.CSSProperties,
};

async function authedFetch(path: string, init: RequestInit = {}) {
	const token = await getAccessToken();
	if (!token) throw new Error('not authenticated');
	const headers = new Headers(init.headers);
	headers.set('Authorization', `Bearer ${token}`);
	if (init.body && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}
	const res = await fetch(path, { ...init, headers });
	if (!res.ok) {
		let detail = await res.text().catch(() => '');
		try {
			const parsed = JSON.parse(detail);
			detail = parsed.error || parsed.message || detail;
		} catch {}
		throw new Error(`${res.status}: ${detail || res.statusText}`);
	}
	return res.json();
}

export function ReactWalletCard() {
	const { ready, authenticated } = useSession();
	const [balance, setBalance] = useState<Balance | null>(null);
	const [coupons, setCoupons] = useState<Coupon[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [claiming, setClaiming] = useState<number | null>(null);

	const refresh = useCallback(async () => {
		try {
			const [bal, cps] = await Promise.all([
				authedFetch('/api/v1/wallet/me/balance'),
				authedFetch('/api/v1/wallet/me/coupons'),
			]);
			setBalance(bal);
			setCoupons(cps);
			setError(null);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'wallet fetch failed',
			);
		}
	}, []);

	useEffect(() => {
		if (ready && authenticated) void refresh();
	}, [ready, authenticated, refresh]);

	const claim = useCallback(
		async (couponId: number) => {
			setClaiming(couponId);
			try {
				const body = JSON.stringify({
					coupon_id: couponId,
					idempotency_key: crypto.randomUUID(),
				});
				const result: RedeemResult = await authedFetch(
					'/api/v1/wallet/me/redeem-coupon',
					{ method: 'POST', body },
				);
				if (!result.success) {
					setError('claim failed');
					return;
				}
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'claim failed');
			} finally {
				setClaiming(null);
			}
		},
		[refresh],
	);

	if (!ready || !authenticated) return null;

	const claimable = coupons.filter((c) => c.status === 'unredeemed');

	return (
		<div style={styles.container} aria-label="Your wallet">
			<div style={styles.header}>
				<span style={styles.title}>Wallet</span>
				<span style={styles.muted}>
					{balance
						? `updated ${new Date(balance.updated_at).toLocaleString()}`
						: '…'}
				</span>
			</div>

			<div style={styles.balances}>
				<div style={styles.balanceCard}>
					<div style={styles.balanceLabel}>Credits</div>
					<div style={styles.balanceValue}>
						{balance ? balance.credits.toLocaleString() : '—'}
					</div>
				</div>
				<div style={styles.balanceCard}>
					<div style={styles.balanceLabel}>KHash</div>
					<div style={styles.balanceValue}>
						{balance ? balance.khash.toLocaleString() : '—'}
					</div>
				</div>
			</div>

			{claimable.length > 0 && (
				<div style={styles.coupons}>
					{claimable.map((c) => (
						<div key={c.coupon_id} style={styles.coupon}>
							<span style={styles.couponLabel}>
								{c.template_label}
							</span>
							<button
								type="button"
								onClick={() => void claim(c.coupon_id)}
								disabled={claiming === c.coupon_id}
								style={styles.claimBtn}>
								{claiming === c.coupon_id
									? 'Claiming…'
									: 'Claim'}
							</button>
						</div>
					))}
				</div>
			)}

			{error && <div style={styles.error}>{error}</div>}
		</div>
	);
}

export default ReactWalletCard;
