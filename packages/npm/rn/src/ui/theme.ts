export const tokens = {
	color: {
		bg: '#0b0b0f',
		surface: '#16161d',
		surfaceAlt: '#1f1f29',
		border: '#2a2a35',
		primary: '#2d6cdf',
		text: '#ffffff',
		textMuted: '#9aa0a6',
		textFaint: '#6b7280',
		success: '#22c55e',
		danger: '#ef4444',
		warning: '#f59e0b',
	},
	radius: { sm: 6, md: 8, lg: 10, xl: 16, pill: 999 },
	space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
	font: {
		caption: 12,
		label: 13,
		body: 15,
		subtitle: 18,
		title: 24,
		display: 32,
	},
	weight: { regular: '400', medium: '600', bold: '700' },
} as const;

export type Tokens = typeof tokens;

export function useTheme(): Tokens {
	return tokens;
}
