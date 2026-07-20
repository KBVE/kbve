export function newIdempotencyKey(): string {
	const c = (globalThis as { crypto?: Crypto }).crypto;
	if (c?.randomUUID) return c.randomUUID();
	if (c?.getRandomValues) {
		const b = c.getRandomValues(new Uint8Array(16));
		b[6] = (b[6] & 0x0f) | 0x40;
		b[8] = (b[8] & 0x3f) | 0x80;
		const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
		return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
	}
	return `k-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

const WALLET_BROADCAST = 'kbve-wallet-sync';

export function notifyWalletRefresh(): void {
	const B = (globalThis as { BroadcastChannel?: typeof BroadcastChannel })
		.BroadcastChannel;
	if (!B) return;
	try {
		const ch = new B(WALLET_BROADCAST);
		ch.postMessage({ type: 'refresh' });
		ch.close();
	} catch {
		void 0;
	}
}
