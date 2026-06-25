import type { CSSProperties, ReactNode } from 'react';

// Pure-CSS Victorian chrome. The ornament is an inline SVG mapped through
// `border-image` (9-slice): the four corners get scrollwork, the edges a
// repeating bead-and-rail motif, and the slice `fill` paints the dark panel
// ground. No raster atlas — it scales crisp to any panel size and re-themes by
// swapping the two palette tokens below.

export const VICTORIAN = {
	gold: '#c9a86a',
	goldBright: '#e6c884',
	goldDim: '#7d6334',
	ground: '#161109',
	groundEdge: '#0d0a06',
	ink: '#e8dcc0',
	inkMuted: '#9c8f72',
} as const;

// 120x120 ornament tile, 9-sliced at 40. Corners carry flowing scroll volutes,
// the edges a double brass rail + repeating fleuron, and the slice `fill` paints
// the panel ground. Authored top-left/​top once, then mirrored/rotated about the
// center so all four corners and edges stay symmetric. Browsers render the
// strokes faithfully (ImageMagick's MSVG does not — preview via headless Chrome).
function ornamentSvg(): string {
	const {
		gold,
		goldBright: bright,
		goldDim: dim,
		ground,
		groundEdge,
	} = VICTORIAN;
	const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <defs>
    <g id="c">
      <path d="M6 40 L6 18 Q6 6 18 6 L40 6" fill="none" stroke="${dim}" stroke-width="2.4"/>
      <path d="M11 40 L11 20 Q11 11 20 11 L40 11" fill="none" stroke="${bright}" stroke-width="2.6"/>
      <path d="M40 11 C 30 11, 22 16, 19 26 C 17 33, 21 40, 28 40 C 33 40, 35 35, 31 32 C 28 30, 25 33, 27 36" fill="none" stroke="${gold}" stroke-width="2"/>
      <path d="M11 40 C 11 30, 16 22, 26 19 C 33 17, 40 21, 40 28 C 40 33, 35 35, 32 31" fill="none" stroke="${gold}" stroke-width="1.6"/>
      <circle cx="11" cy="11" r="3.4" fill="${bright}"/>
      <circle cx="11" cy="11" r="1.4" fill="${ground}"/>
    </g>
    <g id="e">
      <path d="M40 6 L80 6" stroke="${dim}" stroke-width="2.4"/>
      <path d="M40 11 L80 11" stroke="${bright}" stroke-width="2.6"/>
      <path d="M60 13 C 56 20, 56 26, 60 30 C 64 26, 64 20, 60 13 Z" fill="${gold}"/>
      <circle cx="50" cy="9" r="1.5" fill="${gold}"/>
      <circle cx="70" cy="9" r="1.5" fill="${gold}"/>
    </g>
  </defs>
  <rect width="120" height="120" fill="${groundEdge}"/>
  <rect x="40" y="40" width="40" height="40" fill="${ground}"/>
  <use href="#c"/>
  <use href="#c" transform="translate(120,0) scale(-1,1)"/>
  <use href="#c" transform="translate(0,120) scale(1,-1)"/>
  <use href="#c" transform="translate(120,120) scale(-1,-1)"/>
  <use href="#e"/>
  <use href="#e" transform="rotate(90 60 60)"/>
  <use href="#e" transform="rotate(180 60 60)"/>
  <use href="#e" transform="rotate(270 60 60)"/>
</svg>`.trim();
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export interface VictorianFrameProps {
	children?: ReactNode;
	/** Border thickness in px; also the 9-slice projection size. */
	width?: number;
	padding?: number | string;
	style?: CSSProperties;
	className?: string;
}

export function VictorianFrame({
	children,
	width = 26,
	padding = 14,
	style,
	className,
}: VictorianFrameProps) {
	return (
		<div
			className={className}
			style={{
				borderStyle: 'solid',
				borderWidth: width,
				borderImageSource: ornamentSvg(),
				borderImageSlice: '30 fill',
				borderImageRepeat: 'round',
				background: VICTORIAN.ground,
				color: VICTORIAN.ink,
				...style,
			}}>
			<div style={{ padding }}>{children}</div>
		</div>
	);
}

// Horizontal Victorian divider — a centered diamond flanked by tapering rails.
export function VictorianDivider({ width }: { width?: number | string }) {
	return (
		<svg
			width={width ?? '100%'}
			height="12"
			viewBox="0 0 200 12"
			preserveAspectRatio="none"
			style={{ display: 'block', margin: '6px 0' }}>
			<line
				x1="4"
				y1="6"
				x2="86"
				y2="6"
				stroke={VICTORIAN.goldDim}
				strokeWidth="1"
			/>
			<line
				x1="114"
				y1="6"
				x2="196"
				y2="6"
				stroke={VICTORIAN.goldDim}
				strokeWidth="1"
			/>
			<path
				d="M100 1 L106 6 L100 11 L94 6 Z"
				fill="none"
				stroke={VICTORIAN.gold}
				strokeWidth="1.2"
			/>
			<circle cx="100" cy="6" r="1.4" fill={VICTORIAN.gold} />
		</svg>
	);
}
