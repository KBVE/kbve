/**
 * Sub Hero Component Types
 * Type definitions for the sub hero component (smaller, secondary hero sections)
 */

/**
 * Sub hero component props
 */
export interface SubHeroProps {
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
	 * Background image URL (optional)
	 */
	backgroundImage?: string;

	/**
	 * Background gradient (optional, e.g., 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)')
	 */
	backgroundGradient?: string;

	/**
	 * Background color (optional, default: '#f8f9fa')
	 */
	backgroundColor?: string;

	/**
	 * Text color (optional, default: '#333')
	 */
	textColor?: string;

	/**
	 * Hero height (optional, default: '50vh')
	 */
	height?: string;

	/**
	 * Additional CSS class names
	 */
	className?: string;

	/**
	 * Show decorative element (optional, default: false)
	 */
	showDecorative?: boolean;

	/**
	 * Overlay opacity (0-1, optional, default: 0.3)
	 */
	overlayOpacity?: number;

	/**
	 * Content alignment (optional, default: 'center')
	 */
	alignment?: 'left' | 'center' | 'right';

	/**
	 * Size variant (optional, default: 'medium')
	 */
	size?: 'small' | 'medium' | 'large';

	/**
	 * Enable fade-in animation (optional, default: true)
	 */
	enableAnimation?: boolean;

	/**
	 * ARIA label for accessibility (optional, defaults to title)
	 */
	ariaLabel?: string;
}

/**
 * Sub hero size config
 */
export interface SubHeroSizeConfig {
	height: string;
	titleSize: string;
	subtitleSize: string;
	descriptionSize: string;
	padding: string;
}

/**
 * Sub hero background type
 */
export type SubHeroBackgroundType = 'image' | 'gradient' | 'color' | 'none';
