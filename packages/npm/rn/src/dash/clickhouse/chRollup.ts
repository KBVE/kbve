export interface NsRollup {
	namespace: string;
	total: number;
	errors: number;
	warns: number;
}

export function buildNamespaceRollup(meta: unknown): NsRollup[] {
	const rows =
		(meta as { rows?: { pod_namespace?: string; level?: string; cnt?: number }[] })
			?.rows ?? [];
	const map = new Map<string, NsRollup>();
	for (const r of rows) {
		const ns = r.pod_namespace ?? '(cluster)';
		const cur = map.get(ns) ?? { namespace: ns, total: 0, errors: 0, warns: 0 };
		const cnt = Number(r.cnt ?? 0);
		cur.total += cnt;
		const lvl = (r.level ?? '').toLowerCase();
		if (lvl === 'error') cur.errors += cnt;
		else if (lvl === 'warn' || lvl === 'warning') cur.warns += cnt;
		map.set(ns, cur);
	}
	return [...map.values()].sort((a, b) => b.total - a.total);
}
