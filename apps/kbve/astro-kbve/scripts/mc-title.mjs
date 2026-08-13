export function titleCase(name) {
	return name
		.split(' ')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

export function refTitle(ref) {
	return titleCase(ref.replace(/_/g, ' '));
}

export function disambiguate(displayName, ref) {
	const refTokens = ref.replace(/_/g, ' ').split(' ').filter(Boolean);
	if (!displayName) return titleCase(refTokens.join(' '));

	const nameTokens = displayName.toLowerCase().split(/\s+/).filter(Boolean);
	const isPrefix =
		nameTokens.length < refTokens.length &&
		nameTokens.every((t, i) => refTokens[i] === t);

	if (isPrefix) {
		const extra = refTokens.slice(nameTokens.length).join(' ');
		return `${displayName} — ${titleCase(extra)}`;
	}
	return titleCase(refTokens.join(' '));
}

export function resolveTitles(entries) {
	const counts = new Map();
	for (const { displayName, ref } of entries) {
		const base = displayName ?? refTitle(ref);
		counts.set(base, (counts.get(base) ?? 0) + 1);
	}

	const titles = new Map();
	for (const { displayName, ref } of entries) {
		const base = displayName ?? refTitle(ref);
		titles.set(ref, counts.get(base) > 1 ? disambiguate(displayName, ref) : base);
	}
	return titles;
}
