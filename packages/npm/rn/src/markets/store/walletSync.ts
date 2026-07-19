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
