// Builds a compact, parseable descriptor for the `data-x-kbve` attribute: a role
// token followed by `;key=val` pairs. One string carries every field a query
// needs, so any element is locatable in O(1) via `[data-x-kbve*="id=sword"]` or
// exact-matched on its stable `id`. Empty/undefined fields are dropped.
export function kbve(
	role: string,
	fields: Record<string, string | number | boolean | undefined>,
): string {
	let out = role;
	for (const [k, v] of Object.entries(fields)) {
		if (v === undefined || v === '') continue;
		out += `;${k}=${v}`;
	}
	return out;
}
