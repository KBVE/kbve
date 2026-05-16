export function formatKhash(n: number | null | undefined): string {
	if (n === null || n === undefined) return '—';
	return `${n.toLocaleString()} KHash`;
}

export function formatRelative(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const sec = Math.round(diff / 1000);
	if (sec < 60) return `${sec}s ago`;
	const min = Math.round(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.round(min / 60);
	if (hr < 48) return `${hr}h ago`;
	const day = Math.round(hr / 24);
	return `${day}d ago`;
}

export function formatExpiry(iso: string): string {
	const ms = new Date(iso).getTime() - Date.now();
	if (ms <= 0) return 'expired';
	const sec = Math.round(ms / 1000);
	if (sec < 60) return `${sec}s left`;
	const min = Math.round(sec / 60);
	if (min < 60) return `${min}m left`;
	const hr = Math.round(min / 60);
	if (hr < 48) return `${hr}h left`;
	const day = Math.round(hr / 24);
	return `${day}d left`;
}

export function itemRefLabel(itemRef: unknown): string {
	if (!itemRef || typeof itemRef !== 'object') return 'Unknown item';
	const r = itemRef as Record<string, unknown>;
	const kind = typeof r.kind === 'string' ? r.kind : '';
	const id =
		typeof r.id === 'string' || typeof r.id === 'number'
			? String(r.id)
			: '';
	if (kind && id) return `${kind}:${id}`;
	if (id) return id;
	return JSON.stringify(itemRef).slice(0, 64);
}

export function itemRefHasEnchants(itemRef: unknown): boolean {
	if (!itemRef || typeof itemRef !== 'object') return false;
	const e = (itemRef as { enchants?: unknown }).enchants;
	return Array.isArray(e) && e.length > 0;
}
