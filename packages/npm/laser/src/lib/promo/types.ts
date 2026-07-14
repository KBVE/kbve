/**
 * Framework-agnostic cross-promo ad model shared by KBVE Phaser games. A creative
 * is pure data — the host game supplies the content (its own titles + URLs) and
 * laser owns the rendering + rotation, so any future ad slots in without new code.
 */
export interface AdCreative {
	/** Stable id — used for rotation bookkeeping and React keys. */
	id: string;
	/** Small uppercase kicker above the title, e.g. "While you wait". */
	eyebrow?: string;
	/** Main headline line. */
	title: string;
	/** Optional trailing word rendered in the accent color (e.g. a product name). */
	highlight?: string;
	/** Sub-line beneath the title. */
	body?: string;
	/** Click target. Opened in a new tab (or via onClick if the host overrides). */
	url: string;
	/** Emoji or short glyph shown in the leading badge when imageUrl is absent. */
	icon?: string;
	/** Image source for the leading badge; takes precedence over icon. */
	imageUrl?: string;
	/** Selection weight for rotation pools. Defaults to 1; <=0 is never picked. */
	weight?: number;
	/** Accent color override (badge + highlight). Defaults to the laser blue. */
	accent?: string;
}
