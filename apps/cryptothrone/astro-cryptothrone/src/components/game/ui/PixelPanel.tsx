import { forwardRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export const PANELS = {
	wood: '/ui/panel-wood.png',
	stone: '/ui/panel-stone.png',
	iron: '/ui/panel-iron.png',
	parchment: '/ui/panel-parchment.png',
	arcane: '/ui/panel-arcane.png',
	emerald: '/ui/panel-emerald.png',
	ruby: '/ui/panel-ruby.png',
} as const;

export type PanelVariant = keyof typeof PANELS;

function proxyAsset(path: string): string {
	if (!path.startsWith('/') || path.startsWith('/.proxy')) return path;
	if (
		typeof window !== 'undefined' &&
		window.location.hostname.endsWith('.discordsays.com')
	) {
		return `/.proxy${path}`;
	}
	return path;
}

interface PixelPanelProps {
	children?: ReactNode;
	className?: string;
	style?: CSSProperties;
	/** named panel from the generated family (wood, stone, arcane, ...). */
	variant?: PanelVariant;
	/** explicit 9-slice source; overrides variant. */
	src?: string;
	/** border-image-slice inset, in source pixels (the frame thickness). */
	slice?: number;
	/** rendered border width = slice * scale. */
	scale?: number;
	/** stretch (default) or tile the edges. */
	repeat?: 'stretch' | 'repeat' | 'round' | 'space';
}

/** A 9-slice pixel-art panel rendered as a CSS border-image: 4 corners stay
 * crisp, edges + center scale to fit, so it sits under arbitrary React UI as a
 * resizable frame. Tune slice/scale/src to the art. */
export const PixelPanel = forwardRef<HTMLDivElement, PixelPanelProps>(
	function PixelPanel(
		{
			children,
			className,
			style,
			variant = 'wood',
			src,
			slice = 8,
			scale = 1,
			repeat = 'stretch',
		},
		ref,
	) {
		const source = proxyAsset(src ?? PANELS[variant]);
		return (
			<div
				ref={ref}
				className={className}
				style={{
					borderStyle: 'solid',
					borderWidth: slice * scale,
					borderImageSource: `url(${source})`,
					borderImageSlice: `${slice} fill`,
					borderImageRepeat: repeat,
					imageRendering: 'pixelated',
					...style,
				}}>
				{children}
			</div>
		);
	},
);
