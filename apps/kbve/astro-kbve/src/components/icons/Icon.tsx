import {
	ICONS,
	ICON_STROKE_WIDTH,
	ICON_VIEWBOX,
	type IconName,
} from '@kbve/rn/icons';

export type { IconName };

export interface IconProps {
	name: IconName;
	size?: number;
	strokeWidth?: number;
	className?: string;
	title?: string;
}

/**
 * Renders a glyph from the registry shared with the native app
 * (`packages/npm/rn/src/icons`). Colour comes from `currentColor`, so callers
 * tint via CSS rather than a prop.
 */
export function Icon({
	name,
	size = 18,
	strokeWidth = ICON_STROKE_WIDTH,
	className,
	title,
}: IconProps) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox={ICON_VIEWBOX}
			fill="none"
			stroke="currentColor"
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			role={title ? 'img' : undefined}
			aria-hidden={title ? undefined : true}
			aria-label={title}>
			{ICONS[name].map(([tag, attrs], i) => {
				const Tag = tag as 'path';
				return <Tag key={i} {...attrs} />;
			})}
		</svg>
	);
}

/**
 * String form of [[Icon]] for `.astro` files that inject markup via `set:html`
 * and cannot mount a React island.
 */
export function iconMarkup(
	name: IconName,
	{
		size,
		strokeWidth = ICON_STROKE_WIDTH,
	}: { size?: number | null; strokeWidth?: number } = {},
): string {
	const body = ICONS[name]
		.map(([tag, attrs]) => {
			const pairs = Object.entries(attrs)
				.map(([k, v]) => `${k}="${v}"`)
				.join(' ');
			return `<${tag} ${pairs} />`;
		})
		.join('');
	// Omitting width/height lets the caller's CSS own sizing, which is what the
	// sidebar rail does.
	const dims = size == null ? '' : ` width="${size}" height="${size}"`;
	return `<svg xmlns="http://www.w3.org/2000/svg"${dims} viewBox="${ICON_VIEWBOX}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
