/**
 * Supported theme options for Discord widget
 * @type {'dark' | 'light' | 'auto'}
 */
export type DiscordTheme = 'dark' | 'light' | 'auto';

/**
 * Configuration options for Discord widget
 * @interface DiscordWidgetOptions
 */
export interface DiscordWidgetOptions {
	serverId: string;
	theme?: DiscordTheme;
}

const DISCORD_WIDGET_BASE_URL = 'https://discord.com/widget';

/**
 * Creates the Discord widget iframe source URL with proper encoding
 * @param {string} serverId - Discord server ID
 * @param {'dark' | 'light'} theme - Theme for the widget
 * @returns {string} Complete Discord widget URL
 * @description Ensures proper URL encoding for security and accessibility
 */
export const createWidgetSrc = (
	serverId: string,
	theme: 'dark' | 'light',
): string => {
	const encodedId = encodeURIComponent(serverId.trim());
	return `${DISCORD_WIDGET_BASE_URL}?id=${encodedId}&theme=${theme}`;
};

const dimensionToString = (
	value: number | string | undefined,
): string | undefined => {
	if (value === undefined || value === null) {
		return undefined;
	}

	return typeof value === 'number' ? `${value}px` : value;
};

export const createInlineStyle = (
	width?: number | string,
	height?: number | string,
	aspect?: string,
): string | undefined => {
	const widthValue = dimensionToString(width) ?? '100%';
	const heightValue = dimensionToString(height) ?? '500px';

	if (aspect && aspect.trim().length > 0) {
		return `width:${widthValue};`;
	}

	return `width:${widthValue};height:${heightValue};`;
};

const prefersDark = (targetWindow?: Window): boolean => {
	if (!targetWindow?.matchMedia) {
		return false;
	}

	return targetWindow.matchMedia('(prefers-color-scheme: dark)').matches;
};

export const resolveInitialTheme = (
	theme: DiscordTheme,
	fallback: 'dark' | 'light' = 'light',
	targetWindow?: Window,
): 'dark' | 'light' => {
	if (theme === 'dark' || theme === 'light') {
		return theme;
	}

	return prefersDark(targetWindow) ? 'dark' : fallback;
};

/**
 * Subscribes to system theme changes for auto-theme support
 * @param {DiscordTheme} theme - Current theme setting
 * @param {Function} handler - Callback when theme changes
 * @param {Window} targetWindow - Target window object
 * @returns {Function | undefined} Cleanup function to unsubscribe
 * @description Respects user's system preferences for accessibility (prefers-color-scheme)
 */
export const subscribeToAutoTheme = (
	theme: DiscordTheme,
	handler: (theme: 'dark' | 'light') => void,
	targetWindow?: Window,
): (() => void) | undefined => {
	if (theme !== 'auto' || !targetWindow?.matchMedia) {
		return undefined;
	}

	const mediaQuery = targetWindow.matchMedia('(prefers-color-scheme: dark)');
	const listener = (event: MediaQueryListEvent | MediaQueryList) => {
		const next = 'matches' in event ? event.matches : mediaQuery.matches;
		handler(next ? 'dark' : 'light');
	};

	// Some browsers still use addListener/removeListener.
	if (typeof mediaQuery.addEventListener === 'function') {
		mediaQuery.addEventListener('change', listener);
		return () => mediaQuery.removeEventListener('change', listener);
	}

	if (typeof mediaQuery.addListener === 'function') {
		mediaQuery.addListener(listener);
		return () => mediaQuery.removeListener(listener);
	}

	return undefined;
};
