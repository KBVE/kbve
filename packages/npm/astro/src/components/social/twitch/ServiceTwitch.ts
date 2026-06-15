import { atom, computed } from 'nanostores';

/**
 * Twitch embed theme options
 * @type {'dark' | 'light' | 'auto'}
 */
export type TwitchTheme = 'dark' | 'light' | 'auto';

/**
 * Twitch embed type options
 * @type {'stream' | 'chat' | 'both'}
 */
export type TwitchEmbedType = 'stream' | 'chat' | 'both';

/**
 * Twitch embed configuration interface
 */
export interface TwitchEmbedConfig {
	channel: string;
	type?: TwitchEmbedType;
	theme?: TwitchTheme;
	width?: number | string;
	height?: number | string;
	parent?: string[];
	autoplay?: boolean;
	muted?: boolean;
	allowFullscreen?: boolean;
	layout?: 'video' | 'video-with-chat';
	chatMode?: 'mobile' | 'popout';
}

/**
 * Twitch service state atoms
 */
class TwitchService {
	// Loading state
	public readonly isLoadingAtom = atom<boolean>(false);

	// Error state
	public readonly errorAtom = atom<string | null>(null);

	// Current channel
	public readonly channelAtom = atom<string>('');

	// Embed type
	public readonly embedTypeAtom = atom<TwitchEmbedType>('both');

	// Theme
	public readonly themeAtom = atom<TwitchTheme>('auto');

	// Stream online status
	public readonly isOnlineAtom = atom<boolean | null>(null);

	// Chat enabled state
	public readonly chatEnabledAtom = atom<boolean>(true);

	// Volume state (0-1)
	public readonly volumeAtom = atom<number>(0.5);

	// Muted state
	public readonly mutedAtom = atom<boolean>(true);

	// Autoplay state
	public readonly autoplayAtom = atom<boolean>(false);

	// Fullscreen state
	public readonly isFullscreenAtom = atom<boolean>(false);

	// Computed state for embed URL
	public readonly embedUrlAtom = computed(
		[this.channelAtom, this.themeAtom, this.autoplayAtom, this.mutedAtom],
		(channel, theme, autoplay, muted) => {
			if (!channel) return null;

			const resolvedTheme = this.resolveTheme(theme);
			// Autoplay only works when muted (browser policy)
			const canAutoplay = autoplay && muted;

			// Get all possible parent domains
			const parents = this.getParentDomains();

			const params = new URLSearchParams({
				channel: channel,
				theme: resolvedTheme,
				muted: muted ? 'true' : 'false',
				autoplay: canAutoplay ? 'true' : 'false',
				allowfullscreen: 'true',
			});

			// Add all parent domains
			parents.forEach((parent) => {
				params.append('parent', parent);
			});

			return `https://player.twitch.tv/?${params.toString()}`;
		},
	);

	// Computed state for chat URL
	public readonly chatUrlAtom = computed(
		[this.channelAtom, this.themeAtom],
		(channel, theme) => {
			if (!channel) return null;

			const resolvedTheme = this.resolveTheme(theme);

			// Get all possible parent domains
			const parents = this.getParentDomains();

			const params = new URLSearchParams({
				darkpopout: resolvedTheme === 'dark' ? 'true' : 'false',
			});

			// Add all parent domains
			parents.forEach((parent) => {
				params.append('parent', parent);
			});

			return `https://www.twitch.tv/embed/${channel}/chat?${params.toString()}`;
		},
	);

	/**
	 * Initialize the service with a channel
	 */
	public initialize(config: TwitchEmbedConfig): void {
		this.channelAtom.set(config.channel);
		this.embedTypeAtom.set(config.type || 'both');
		this.themeAtom.set(config.theme || 'auto');
		this.autoplayAtom.set(config.autoplay === true);
		this.mutedAtom.set(config.muted !== false);
		this.errorAtom.set(null);
		this.isLoadingAtom.set(true);
	}

	/**
	 * Set loading complete
	 */
	public setLoaded(): void {
		this.isLoadingAtom.set(false);
	}

	/**
	 * Set error state
	 */
	public setError(error: string): void {
		this.errorAtom.set(error);
		this.isLoadingAtom.set(false);
	}

	/**
	 * Toggle chat visibility
	 */
	public toggleChat(): void {
		this.chatEnabledAtom.set(!this.chatEnabledAtom.get());
	}

	/**
	 * Toggle mute
	 */
	public toggleMute(): void {
		this.mutedAtom.set(!this.mutedAtom.get());
	}

	/**
	 * Set volume
	 */
	public setVolume(volume: number): void {
		const clampedVolume = Math.max(0, Math.min(1, volume));
		this.volumeAtom.set(clampedVolume);
		if (clampedVolume > 0) {
			this.mutedAtom.set(false);
		}
	}

	/**
	 * Toggle fullscreen
	 */
	public toggleFullscreen(): void {
		this.isFullscreenAtom.set(!this.isFullscreenAtom.get());
	}

	/**
	 * Get all parent domains for Twitch embed
	 */
	private getParentDomains(): string[] {
		if (typeof window === 'undefined') {
			return ['localhost', 'kbve.com'];
		}

		const hostname = window.location.hostname;
		const parents: string[] = [hostname];

		// Add common variations
		if (hostname === 'localhost' || hostname === '127.0.0.1') {
			parents.push('localhost', '127.0.0.1');
		} else {
			// Add base domain and www variant
			const isWww = hostname.startsWith('www.');
			const baseDomain = isWww ? hostname.substring(4) : hostname;

			parents.push(baseDomain);
			if (!isWww) {
				parents.push(`www.${baseDomain}`);
			}

			// Add common subdomains for kbve.com
			if (baseDomain === 'kbve.com' || hostname.endsWith('.kbve.com')) {
				parents.push(
					'kbve.com',
					'www.kbve.com',
					'app.kbve.com',
					'dev.kbve.com',
				);
			}
		}

		// Remove duplicates
		return [...new Set(parents)];
	}

	/**
	 * Resolve theme based on system preferences
	 */
	private resolveTheme(theme: TwitchTheme): 'dark' | 'light' {
		if (theme === 'dark' || theme === 'light') {
			return theme;
		}

		// Auto theme detection
		if (typeof window !== 'undefined' && window.matchMedia) {
			return window.matchMedia('(prefers-color-scheme: dark)').matches
				? 'dark'
				: 'light';
		}

		return 'dark'; // Default to dark theme
	}

	/**
	 * Subscribe to system theme changes
	 */
	public subscribeToThemeChanges(
		callback: (theme: 'dark' | 'light') => void,
	): () => void {
		if (typeof window === 'undefined' || !window.matchMedia) {
			return () => {};
		}

		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const listener = (e: MediaQueryListEvent) => {
			if (this.themeAtom.get() === 'auto') {
				callback(e.matches ? 'dark' : 'light');
			}
		};

		if (typeof mediaQuery.addEventListener === 'function') {
			mediaQuery.addEventListener('change', listener);
			return () => mediaQuery.removeEventListener('change', listener);
		}

		// Fallback for older browsers
		if (typeof mediaQuery.addListener === 'function') {
			mediaQuery.addListener(listener);
			return () => mediaQuery.removeListener(listener);
		}

		return () => {};
	}

	/**
	 * Reset all state
	 */
	public reset(): void {
		this.channelAtom.set('');
		this.embedTypeAtom.set('both');
		this.themeAtom.set('auto');
		this.isLoadingAtom.set(false);
		this.errorAtom.set(null);
		this.isOnlineAtom.set(null);
		this.chatEnabledAtom.set(true);
		this.volumeAtom.set(0.5);
		this.mutedAtom.set(true);
		this.isFullscreenAtom.set(false);
	}
}

// Export singleton instance
export const twitchService = new TwitchService();

/**
 * Helper function to create inline styles
 */
export const createInlineStyle = (
	width?: number | string,
	height?: number | string,
	aspect?: string,
): string | undefined => {
	const widthValue =
		typeof width === 'number' ? `${width}px` : width || '100%';
	const heightValue =
		typeof height === 'number' ? `${height}px` : height || '500px';

	if (aspect && aspect.trim().length > 0) {
		return `width:${widthValue};`;
	}

	return `width:${widthValue};height:${heightValue};`;
};
