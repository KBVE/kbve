import type { ThemeOverride } from '@kbve/rn/ui';

// Maps jobboard's quest-violet + loot-amber palette onto @kbve/rn tokens so
// shared (theme-aware) primitives render in jobboard's colors, not Royal Gold.
export const jobboardTheme: ThemeOverride = {
	color: {
		primary: '#7c4dff',
		primaryDeep: '#6a35eb',
		bg: '#121312',
		surface: '#18181b',
		surfaceAlt: '#27272a',
		border: '#3f3f46',
		text: '#f4f4f5',
		textMuted: '#a1a1aa',
		textFaint: '#52525b',
		warning: '#fbbf24',
	},
};
