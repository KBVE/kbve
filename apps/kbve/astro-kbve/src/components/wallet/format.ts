const compactFormatter = new Intl.NumberFormat('en', {
	notation: 'compact',
	maximumFractionDigits: 1,
});

export function formatCompact(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return '—';
	return compactFormatter.format(n);
}
