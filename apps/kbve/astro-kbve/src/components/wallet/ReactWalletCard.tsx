import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken, useSession } from '@kbve/astro';
import { formatCompact } from './format';

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
const CACHE_KEY = 'kbve:wallet:balance:v1';
const BROADCAST_CHANNEL = 'kbve-wallet-sync';

function readCachedBalance(): Balance | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		return raw ? (JSON.parse(raw) as Balance) : null;
	} catch {
		return null;
	}
}

function writeCachedBalance(b: Balance | null) {
	if (typeof localStorage === 'undefined') return;
	try {
		if (b) localStorage.setItem(CACHE_KEY, JSON.stringify(b));
		else localStorage.removeItem(CACHE_KEY);
	} catch {}
}

function balancesEqual(a: Balance | null, b: Balance | null): boolean {
	if (!a || !b) return a === b;
	return (
		a.credits === b.credits &&
		a.khash === b.khash &&
		a.updated_at === b.updated_at
	);
}

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
	const lastBalanceRef = useRef<Balance | null>(null);

	useEffect(() => {
		setShell(findShell(mountRef.current));
	}, []);

	const applyBalance = useCallback(
		(b: Balance | null) => {
			if (!shell) return;
			// Default is "full" (thousands-separated integer) because the
			// wallet *card* always wants the exact balance. Only opt-in
			// "compact" mounts (none today; reserved for any future
			// tight-space surface) render the short form.
			const mode = shell.getAttribute('data-kbve-wallet-format');
			const fmt = (n: number) =>
				mode === 'compact' ? formatCompact(n) : n.toLocaleString();
			setShellText(shell, SLOT_CREDITS, b ? fmt(b.credits) : '—');
			setShellText(shell, SLOT_KHASH, b ? fmt(b.khash) : '—');
			setShellText(
				shell,
				SLOT_UPDATED,
				b ? `updated ${new Date(b.updated_at).toLocaleString()}` : '…',
			);
			lastBalanceRef.current = b;
		},
		[shell],
	);

	const refresh = useCallback(async () => {
		try {
			const [bal, cps] = await Promise.all([
				authedFetch('/api/v1/wallet/me/balance'),
				authedFetch('/api/v1/wallet/me/coupons'),
			]);
			const balance = bal as Balance;
			if (!balancesEqual(balance, lastBalanceRef.current)) {
				applyBalance(balance);
				writeCachedBalance(balance);
				if (typeof BroadcastChannel !== 'undefined') {
					try {
						const ch = new BroadcastChannel(BROADCAST_CHANNEL);
						ch.postMessage({ type: 'balance', balance });
						ch.close();
					} catch {}
				}
			}
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
			shell.dataset.kbveWalletState = 'signed-out';
			applyBalance(null);
			writeCachedBalance(null);
			return;
		}
		shell.dataset.kbveWalletState = 'authenticated';
		const cached = readCachedBalance();
		if (cached) {
			applyBalance(cached);
		}
		void refresh();
	}, [shell, ready, authenticated, applyBalance, refresh]);

	useEffect(() => {
		if (!authenticated || typeof BroadcastChannel === 'undefined') return;
		let ch: BroadcastChannel;
		try {
			ch = new BroadcastChannel(BROADCAST_CHANNEL);
		} catch {
			return;
		}
		const onMessage = (event: MessageEvent) => {
			const data = event.data as { type?: string; balance?: Balance };
			if (data?.type === 'balance' && data.balance) {
				if (!balancesEqual(data.balance, lastBalanceRef.current)) {
					applyBalance(data.balance);
				}
			}
		};
		ch.addEventListener('message', onMessage);
		return () => {
			ch.removeEventListener('message', onMessage);
			ch.close();
		};
	}, [authenticated, applyBalance]);

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
