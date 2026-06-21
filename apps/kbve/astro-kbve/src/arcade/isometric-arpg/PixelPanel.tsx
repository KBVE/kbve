import { forwardRef } from 'react';
import type { CSSProperties, DragEvent, ReactNode } from 'react';
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
	onClick?: () => void;
	onDoubleClick?: () => void;
	title?: string;
	draggable?: boolean;
	onDragStart?: (e: DragEvent<HTMLDivElement>) => void;
	onDragOver?: (e: DragEvent<HTMLDivElement>) => void;
	onDrop?: (e: DragEvent<HTMLDivElement>) => void;
	onDragEnd?: (e: DragEvent<HTMLDivElement>) => void;
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
			onClick,
			onDoubleClick,
			title,
			draggable,
			onDragStart,
			onDragOver,
			onDrop,
			onDragEnd,
		},
		ref,
	) {
		const source = arpgAsset(src ?? PANELS[variant]);
		return (
			<div
				ref={ref}
				className={className}
				onClick={onClick}
				onDoubleClick={onDoubleClick}
				title={title}
				draggable={draggable}
				onDragStart={onDragStart}
				onDragOver={onDragOver}
				onDrop={onDrop}
				onDragEnd={onDragEnd}
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
