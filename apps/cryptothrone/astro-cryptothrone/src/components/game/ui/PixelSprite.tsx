import type { CSSProperties } from 'react';
import manifest from './pixelUiManifest.json';

interface Frame {
	x: number;
	y: number;
	w: number;
	h: number;
}
interface SheetDef {
	sheet: string;
	w: number;
	h: number;
	frames: Frame[];
}

const SHEETS = manifest as Record<string, SheetDef>;

export type PixelSheet = keyof typeof manifest;

export function pixelFrameCount(sheet: PixelSheet): number {
	return SHEETS[sheet]?.frames.length ?? 0;
}

interface PixelSpriteProps {
	sheet: PixelSheet;
	frame: number;
	scale?: number;
	className?: string;
	style?: CSSProperties;
}

/** Render one cropped frame from a pixel-UI sheet via CSS background-position,
 * nearest-neighbor scaled. No per-frame PNGs — the sheet + manifest rect drive
 * the window. Frame indices come from pixelUiManifest.json (scripts/crop_ui.py). */
export function PixelSprite({
	sheet,
	frame,
	scale = 3,
	className,
	style,
}: PixelSpriteProps) {
	const def = SHEETS[sheet];
	const f = def?.frames[frame];
	if (!def || !f) return null;
	return (
		<div
			aria-hidden="true"
			className={className}
			style={{
				width: f.w * scale,
				height: f.h * scale,
				backgroundImage: `url(/${def.sheet})`,
				backgroundPosition: `-${f.x * scale}px -${f.y * scale}px`,
				backgroundSize: `${def.w * scale}px ${def.h * scale}px`,
				backgroundRepeat: 'no-repeat',
				imageRendering: 'pixelated',
				...style,
			}}
		/>
	);
}
