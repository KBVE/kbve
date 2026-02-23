/** Social Tooltip Service — shared utilities for SocialTooltip */

export type Direction = 'auto' | 'top' | 'bottom';
export type Align = 'center' | 'start' | 'end';
export type Size = 'sm' | 'md' | 'lg';

/**
 * Given the root and panel elements, resolve whether the panel
 * should appear above or below. Falls through to 'bottom' when
 * `preference` is anything other than 'auto'.
 */
export function resolveDirection(
	rootEl: HTMLElement,
	panelEl: HTMLElement,
	preference: Direction,
): 'top' | 'bottom' {
	if (preference !== 'auto') return preference as 'top' | 'bottom';

	const root = rootEl.getBoundingClientRect();
	const panel = panelEl.getBoundingClientRect();
	const buffer = 16;
	const spaceBelow = window.innerHeight - root.bottom;
	const spaceAbove = root.top;

	return spaceBelow < panel.height + buffer &&
		spaceAbove > panel.height + buffer
		? 'top'
		: 'bottom';
}

/** True when the user has prefers-reduced-motion: reduce */
export function prefersReducedMotion(): boolean {
	return (
		globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ??
		false
	);
}
