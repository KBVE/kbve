import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken, useSession } from '@kbve/astro';

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

const SHELL_SELECTOR = '[data-kbve-wallet-shell]';
const SLOT_CREDITS = '[data-kbve-wallet-credits]';
const SLOT_KHASH = '[data-kbve-wallet-khash]';
const SLOT_UPDATED = '[data-kbve-wallet-updated]';

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

function findShell(from: HTMLElement | null): HTMLElement | null {
	if (typeof document === 'undefined') return null;
	let node: HTMLElement | null = from;
	while (node && node !== document.body) {
		if (node.matches?.(SHELL_SELECTOR)) return node;
		node = node.parentElement;
	}
	return document.querySelector(SHELL_SELECTOR);
}

function setShellText(
	shell: HTMLElement | null,
	selector: string,
	text: string,
) {
	if (!shell) return;
	const node = shell.querySelector(selector);
	if (node) node.textContent = text;
}

export function ReactWalletCard() {
	const { ready, authenticated } = useSession();
	const mountRef = useRef<HTMLDivElement | null>(null);
	const [shell, setShell] = useState<HTMLElement | null>(null);
	const [coupons, setCoupons] = useState<Coupon[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [claiming, setClaiming] = useState<number | null>(null);

	useEffect(() => {
		setShell(findShell(mountRef.current));
	}, []);

	const applyBalance = useCallback(
		(b: Balance | null) => {
			if (!shell) return;
			setShellText(
				shell,
				SLOT_CREDITS,
				b ? b.credits.toLocaleString() : '—',
			);
			setShellText(shell, SLOT_KHASH, b ? b.khash.toLocaleString() : '—');
			setShellText(
				shell,
				SLOT_UPDATED,
				b ? `updated ${new Date(b.updated_at).toLocaleString()}` : '…',
			);
		},
		[shell],
	);

	const refresh = useCallback(async () => {
		try {
			const [bal, cps] = await Promise.all([
				authedFetch('/api/v1/wallet/me/balance'),
				authedFetch('/api/v1/wallet/me/coupons'),
			]);
			applyBalance(bal as Balance);
			setCoupons(cps as Coupon[]);
			setError(null);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'wallet fetch failed',
			);
		}
	}, [applyBalance]);

	useEffect(() => {
		if (!shell || !ready) return;
		if (!authenticated) {
			shell.hidden = true;
			return;
		}
		shell.hidden = false;
		void refresh();
	}, [shell, ready, authenticated, refresh]);

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

	const claimable = coupons.filter((c) => c.status === 'unredeemed');

	if (!ready || !authenticated) {
		return <div ref={mountRef} hidden />;
	}

	return (
		<div ref={mountRef}>
			{claimable.length > 0 && (
				<div className="kbve-wallet-card__coupons">
					{claimable.map((c) => (
						<div
							key={c.coupon_id}
							className="kbve-wallet-card__coupon">
							<span className="kbve-wallet-card__coupon-label">
								{c.template_label}
							</span>
							<button
								type="button"
								onClick={() => void claim(c.coupon_id)}
								disabled={claiming === c.coupon_id}
								className="kbve-wallet-card__claim-btn">
								{claiming === c.coupon_id
									? 'Claiming…'
									: 'Claim'}
							</button>
						</div>
					))}
				</div>
			)}
			{error && <div className="kbve-wallet-card__error">{error}</div>}
		</div>
	);
}

export default ReactWalletCard;
