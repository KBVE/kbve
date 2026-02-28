/**
 * Main Hero Component Types
 * Type definitions for the main hero component
 */

/**
 * Main hero component props
 */
export interface MainHeroProps {
	/**
	 * Hero title
	 */
	title: string;

	/**
	 * Hero subtitle (optional)
	 */
	subtitle?: string;

	/**
	 * Hero description (optional)
	 */
	description?: string;

	/**
	 * Call-to-action button text (optional)
	 */
	ctaText?: string;

	/**
	 * Call-to-action button URL (optional)
	 */
	ctaUrl?: string;

	/**
	 * Secondary CTA button text (optional)
	 */
	secondaryCtaText?: string;

	/**
	 * Secondary CTA button URL (optional)
	 */
	secondaryCtaUrl?: string;

	/**
	 * Background image URL (optional)
	 */
	backgroundImage?: string;

	/**
	 * Background video URL (optional)
	 */
	backgroundVideo?: string;

	/**
	 * Background gradient (optional, e.g., 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)')
	 */
	backgroundGradient?: string;

	/**
	 * Background color (optional, default: transparent)
	 */
	backgroundColor?: string;

	/**
	 * Text color (optional, default: white)
	 */
	textColor?: string;

	/**
	 * Hero height (optional, default: '100vh')
	 */
	height?: string;

	/**
	 * Additional CSS class names
	 */
	className?: string;

	/**
	 * Enable parallax effect (optional, default: false)
	 */
	enableParallax?: boolean;

	/**
	 * Show scroll indicator (optional, default: true)
	 */
	showScrollIndicator?: boolean;

	/**
	 * Overlay opacity (0-1, optional, default: 0.5)
	 */
	overlayOpacity?: number;

	/**
	 * Content alignment (optional, default: 'center')
	 */
	alignment?: 'left' | 'center' | 'right';

	/**
	 * Vertical alignment (optional, default: 'center')
	 */
	verticalAlignment?: 'top' | 'center' | 'bottom';

	/**
	 * ARIA label for accessibility (optional, defaults to title)
	 */
	ariaLabel?: string;
}

/**
 * Hero background type
 */
export type HeroBackgroundType =
	| 'image'
	| 'video'
	| 'gradient'
	| 'color'
	| 'none';

/**
 * Hero animation config
 */
export interface HeroAnimationConfig {
	/**
	 * Animation duration (ms)
	 */
	duration?: number;

	/**
	 * Animation delay (ms)
	 */
	delay?: number;

	/**
	 * Animation easing function
	 */
	easing?: string;

	/**
	 * Enable fade-in animation
	 */
	fadeIn?: boolean;

	/**
	 * Enable slide-up animation
	 */
	slideUp?: boolean;
}
