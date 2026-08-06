import type { ReactNode } from 'react';
import { createElement } from 'react';

// react-native-svg ships Flow-typed sources that vitest cannot parse. The
// primitives are pure geometry, so tests render the DOM equivalents instead.
type Props = Record<string, unknown> & { children?: ReactNode };

const host =
	(tag: string) =>
	({ children, ...rest }: Props) =>
		createElement(tag, rest, children);

export const Svg = host('svg');
export const Path = host('path');
export const Circle = host('circle');
export const Rect = host('rect');
export const Line = host('line');
export const Polyline = host('polyline');
export const Polygon = host('polygon');
export const Ellipse = host('ellipse');
export const G = host('g');
export const Defs = host('defs');
export const LinearGradient = host('linearGradient');
export const RadialGradient = host('radialGradient');
export const Stop = host('stop');
export const ClipPath = host('clipPath');
export const Mask = host('mask');
export const Text = host('text');
export const TSpan = host('tspan');
export const Use = host('use');
export const Symbol = host('symbol');
export const Image = host('image');

export default Svg;
