import type { ThemeOverride } from './theme';

export type { Tokens, ThemeOverride } from './theme';

export const tokens = {
	color: {
		bg: 'var(--sl-color-bg, #121312)',
		bgSubtle: 'var(--sl-color-gray-6, #1a1715)',
		surface: 'var(--sl-color-bg-nav, #1b1814)',
		surfaceAlt: 'var(--sl-color-gray-5, #26211a)',
		border: 'var(--sl-color-hairline, #3a2f1f)',
		primary: 'var(--sl-color-accent, #c9a56a)',
		primaryDeep: 'var(--sl-color-accent-high, #a67d43)',
		bronze: 'var(--sl-color-accent-low, #7a5a2e)',
		onPrimary: 'var(--sl-color-text-invert, #1b1814)',
		text: 'var(--sl-color-text, #f5ecd8)',
		textMuted: 'var(--sl-color-gray-2, #b3a589)',
		textFaint: 'var(--sl-color-gray-3, #7d705a)',
		success: '#22c55e',
		danger: '#ef4444',
		warning: '#f59e0b',
	},
	gradient: {
		hero: ['#d4b072', '#a67d43', '#5c421f'] as [string, string, string],
		gold: ['#c9a56a', '#7a5a2e'] as [string, string],
		surface: ['#1b1814', '#121312'] as [string, string],
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

export function mergeTheme(override?: ThemeOverride): typeof tokens {
	if (!override) return tokens;
	return {
		color: { ...tokens.color, ...override.color },
		gradient: { ...tokens.gradient, ...override.gradient },
		radius: { ...tokens.radius, ...override.radius },
		space: { ...tokens.space, ...override.space },
		font: { ...tokens.font, ...override.font },
		weight: tokens.weight,
	} as typeof tokens;
}
