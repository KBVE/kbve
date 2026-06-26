export const tokens = {
	color: {
		bg: '#121312',
		bgSubtle: '#1a1715',
		surface: '#1b1814',
		surfaceAlt: '#26211a',
		border: '#3a2f1f',
		primary: '#c9a56a',
		primaryDeep: '#a67d43',
		bronze: '#7a5a2e',
		onPrimary: '#1b1814',
		text: '#f5ecd8',
		textMuted: '#b3a589',
		textFaint: '#7d705a',
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

export type Tokens = typeof tokens;

export interface ThemeOverride {
	color?: Partial<Record<keyof Tokens['color'], string>>;
	gradient?: Partial<Record<keyof Tokens['gradient'], readonly string[]>>;
	radius?: Partial<Record<keyof Tokens['radius'], number>>;
	space?: Partial<Record<keyof Tokens['space'], number>>;
	font?: Partial<Record<keyof Tokens['font'], number>>;
}

export function mergeTheme(override?: ThemeOverride): Tokens {
	if (!override) return tokens;
	return {
		color: { ...tokens.color, ...override.color },
		gradient: { ...tokens.gradient, ...override.gradient },
		radius: { ...tokens.radius, ...override.radius },
		space: { ...tokens.space, ...override.space },
		font: { ...tokens.font, ...override.font },
		weight: tokens.weight,
	} as Tokens;
}
