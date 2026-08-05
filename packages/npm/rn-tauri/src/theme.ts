import type { ThemeOverride } from '@kbve/rn/ui/theme';

export { ThemeProvider, useTheme } from '@kbve/rn/ui';
export { tokens, mergeTheme } from '@kbve/rn/ui/theme';
export type { ThemeOverride, Tokens } from '@kbve/rn/ui/theme';

/**
 * Reads a CSS custom property off the document root.
 *
 * `@kbve/rn` tokens are plain strings resolved once at render, so a desktop
 * app that themes itself with CSS variables has to sample them rather than
 * hand the variable reference through — `var(--x)` is meaningless to
 * react-native-web's style resolver.
 */
function cssVar(name: string, fallback: string): string {
	if (typeof document === 'undefined') return fallback;
	const v = getComputedStyle(document.documentElement)
		.getPropertyValue(name)
		.trim();
	return v || fallback;
}

/**
 * Builds a `ThemeOverride` from a Tauri app's CSS custom properties, so shared
 * `@kbve/rn` components adopt the host app's palette instead of the default
 * KBVE gold. Call at render time (not module scope) so it re-samples after a
 * theme switch.
 */
export function themeFromCssVars(): ThemeOverride {
	return {
		color: {
			bg: cssVar('--color-bg', '#1b1f26'),
			bgSubtle: cssVar('--color-bg', '#1b1f26'),
			surface: cssVar('--color-surface', '#2c313b'),
			surfaceAlt: cssVar('--color-surface-hover', '#343a45'),
			border: cssVar('--color-border', '#3a414d'),
			primary: cssVar('--color-accent', '#7c9cf5'),
			primaryDeep: cssVar('--color-accent-hover', '#93aef7'),
			onPrimary: cssVar('--color-bg', '#1b1f26'),
			text: cssVar('--color-text', '#f6f7f8'),
			textMuted: cssVar('--color-text-muted', '#98a1af'),
			textFaint: cssVar('--color-text-muted', '#98a1af'),
			success: cssVar('--color-status-running', '#6bcb77'),
			danger: cssVar('--color-danger', '#ff6b6b'),
			warning: cssVar('--color-status-paused', '#ffd93d'),
		},
	};
}
