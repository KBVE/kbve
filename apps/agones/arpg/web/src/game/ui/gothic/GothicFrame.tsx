import type { CSSProperties, ReactNode } from 'react';
import { svgBg, GOTHIC } from './svg';

// Gothic counterpart to VictorianFrame: an ornate frame via CSS `border-image`
// (9-slice) instead of a stretched background, so the corner brackets stay crisp
// at any panel size while the edges tile. The corner motif is the expansion
// corner-ornament (metal L-bracket + gem boss), mirrored into all four corners;
// the edges carry a double metal rail; the slice `fill` paints the panel ground.

// 192x192 tile, sliced at 64. Corner art is authored at native 96px and scaled
// 0.667 into each 64px corner; rails are straight so the edge bands tile cleanly.
function ornamentSvg(): string {
	const { ground, groundEdge } = GOTHIC;
	const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <defs>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9d865a"/><stop offset=".35" stop-color="#3c3428"/>
      <stop offset=".7" stop-color="#171513"/><stop offset="1" stop-color="#746044"/>
    </linearGradient>
    <g id="gc">
      <path d="M6 90V34C6 16 16 6 34 6h56v14H42c-13 0-22 9-22 22v48z" fill="url(#metal)" stroke="#090807" stroke-width="6"/>
      <path d="M18 78V42c0-14 10-24 24-24h36" fill="none" stroke="#b59a67" stroke-width="3"/>
      <path d="M22 26l16 16-16 16M26 22l16 16 16-16" fill="none" stroke="#4e3d2b" stroke-width="4"/>
      <circle cx="30" cy="30" r="6" fill="#681510" stroke="#1d0705" stroke-width="3"/>
    </g>
  </defs>
  <rect width="192" height="192" fill="${groundEdge}"/>
  <rect x="64" y="64" width="64" height="64" fill="${ground}"/>
  <rect x="6" y="6" width="180" height="180" fill="none" stroke="#090807" stroke-width="8"/>
  <rect x="12" y="12" width="168" height="168" fill="none" stroke="url(#metal)" stroke-width="3"/>
  <rect x="16" y="16" width="160" height="160" fill="none" stroke="#b59a67" stroke-width="1.5"/>
  <use href="#gc" transform="scale(0.6667)"/>
  <use href="#gc" transform="translate(192,0) scale(-0.6667,0.6667)"/>
  <use href="#gc" transform="translate(0,192) scale(0.6667,-0.6667)"/>
  <use href="#gc" transform="translate(192,192) scale(-0.6667,-0.6667)"/>
</svg>`.trim();
	return svgBg(svg);
}

// Lighter 9-slice frame: nested rounded brass rails + corner bracket nicks (the
// tooltip-frame look), but border-image so corners stay fixed when the box
// resizes. 160 tile, sliced at 40.
function bracketSvg(): string {
	const { ground, groundEdge } = GOTHIC;
	const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <defs>
    <linearGradient id="ff" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#201d19"/><stop offset="1" stop-color="#0d0c0b"/>
    </linearGradient>
    <g id="k">
      <path d="M16 40V22Q16 16 22 16H40" fill="none" stroke="#b49a69" stroke-width="2.5"/>
      <path d="M24 24l11 11-11 11" fill="none" stroke="#5a4731" stroke-width="3"/>
    </g>
  </defs>
  <rect width="160" height="160" fill="${groundEdge}"/>
  <rect x="40" y="40" width="80" height="80" fill="url(#ff)"/>
  <rect x="5" y="5" width="150" height="150" rx="10" fill="none" stroke="#060606" stroke-width="6"/>
  <rect x="10" y="10" width="140" height="140" rx="8" fill="none" stroke="#8d7550" stroke-width="3"/>
  <rect x="15" y="15" width="130" height="130" rx="6" fill="none" stroke="#33281d" stroke-width="2"/>
  <use href="#k"/>
  <use href="#k" transform="translate(160,0) scale(-1,1)"/>
  <use href="#k" transform="translate(0,160) scale(1,-1)"/>
  <use href="#k" transform="translate(160,160) scale(-1,-1)"/>
</svg>`.trim();
	return svgBg(svg);
}

const ORNAMENT = ornamentSvg();
const BRACKET = bracketSvg();

const VARIANTS = {
	ornament: { src: ORNAMENT, slice: 64, width: 30 },
	bracket: { src: BRACKET, slice: 40, width: 18 },
} as const;

export interface GothicFrameProps {
	children?: ReactNode;
	/** Corner style: heavy metal ornament (default) or lighter bracket rail. */
	variant?: keyof typeof VARIANTS;
	/** Border thickness in px; overrides the variant default. */
	width?: number;
	padding?: number | string;
	style?: CSSProperties;
	className?: string;
}

export function GothicFrame({
	children,
	variant = 'ornament',
	width,
	padding = 14,
	style,
	className,
}: GothicFrameProps) {
	const v = VARIANTS[variant];
	return (
		<div
			className={className}
			style={{
				borderStyle: 'solid',
				borderWidth: width ?? v.width,
				borderImageSource: v.src,
				borderImageSlice: `${v.slice} fill`,
				borderImageRepeat: 'stretch',
				background: GOTHIC.ground,
				color: GOTHIC.text,
				...style,
			}}>
			<div style={{ padding }}>{children}</div>
		</div>
	);
}
