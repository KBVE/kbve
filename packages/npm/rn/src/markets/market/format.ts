export function formatKhash(n: number | null | undefined): string {
	if (n === null || n === undefined) return '—';
	return `${n.toLocaleString()} KHash`;
}

export function formatRelative(iso: string): string {
	const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
	if (s < 60) return `${s}s ago`;
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.round(m / 60);
	if (h < 48) return `${h}h ago`;
	return `${Math.round(h / 24)}d ago`;
}

export function formatExpiry(iso: string): string {
	const ms = new Date(iso).getTime() - Date.now();
	if (ms <= 0) return 'expired';
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s left`;
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m left`;
	const h = Math.round(m / 60);
	if (h < 48) return `${h}h left`;
	return `${Math.round(h / 24)}d left`;
}

export function itemRefLabel(itemRef: unknown): string {
	if (itemRef && typeof itemRef === 'object') {
		const o = itemRef as Record<string, unknown>;
		const kind = typeof o.kind === 'string' ? o.kind : '';
		const id = typeof o.id === 'string' ? o.id : '';
		if (kind && id) return `${kind}:${id}`;
		if (id) return id;
		return JSON.stringify(itemRef).slice(0, 64);
	}
	return 'Unknown item';
}

export function itemRefHasEnchants(itemRef: unknown): boolean {
	if (!itemRef || typeof itemRef !== 'object') return false;
	const e = (itemRef as Record<string, unknown>).enchants;
	return Array.isArray(e) && e.length > 0;
}
