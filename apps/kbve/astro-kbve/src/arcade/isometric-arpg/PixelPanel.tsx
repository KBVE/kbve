import { forwardRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { arpgAsset } from './config';

export const PANELS = {
	frost: '/assets/arcade/arpg/ui/panel-frost.png',
	slate: '/assets/arcade/arpg/ui/panel-slate.png',
	gold: '/assets/arcade/arpg/ui/panel-gold.png',
} as const;

export type PanelVariant = keyof typeof PANELS;

interface PixelPanelProps {
	children?: ReactNode;
	className?: string;
	style?: CSSProperties;
	variant?: PanelVariant;
	src?: string;
	slice?: number;
	scale?: number;
	repeat?: 'stretch' | 'repeat' | 'round' | 'space';
}

/**
 * A transparent-friendly 9-slice pixel panel rendered as a CSS border-image:
 * the four corners stay crisp while edges + center scale, so it frames
 * arbitrary HUD content while letting the scene show through the low-alpha
 * center. Tune slice/scale/src to the art (panels are 32px, slice 8).
 */
export const PixelPanel = forwardRef<HTMLDivElement, PixelPanelProps>(
	function PixelPanel(
		{
			children,
			className,
			style,
			variant = 'slate',
			src,
			slice = 8,
			scale = 2,
			repeat = 'stretch',
		},
		ref,
	) {
		const source = arpgAsset(src ?? PANELS[variant]);
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
