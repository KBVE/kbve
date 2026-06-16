import { forwardRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

const PANEL_SRC = '/ui-sheets/panel9.png';

interface PixelPanelProps {
	children?: ReactNode;
	className?: string;
	style?: CSSProperties;
	/** 9-slice source image (a bordered panel). */
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
			src = PANEL_SRC,
			slice = 24,
			scale = 1,
			repeat = 'stretch',
		},
		ref,
	) {
		return (
			<div
				ref={ref}
				className={className}
				style={{
					borderStyle: 'solid',
					borderWidth: slice * scale,
					borderImageSource: `url(${src})`,
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
