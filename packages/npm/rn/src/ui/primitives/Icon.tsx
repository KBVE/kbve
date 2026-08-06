import Svg, {
	Circle,
	Ellipse,
	Line,
	Path,
	Polygon,
	Polyline,
	Rect,
} from 'react-native-svg';
import type { ComponentType } from 'react';
import {
	ICONS,
	ICON_STROKE_WIDTH,
	ICON_VIEWBOX,
	type IconName,
} from '../../icons';
import { tokens } from '../theme';

const TAGS: Record<string, ComponentType<Record<string, unknown>>> = {
	path: Path as never,
	circle: Circle as never,
	rect: Rect as never,
	line: Line as never,
	polyline: Polyline as never,
	polygon: Polygon as never,
	ellipse: Ellipse as never,
};

export interface IconProps {
	name: IconName;
	size?: number;
	color?: string;
	strokeWidth?: number;
}

export function Icon({
	name,
	size = 20,
	color = tokens.color.text,
	strokeWidth = ICON_STROKE_WIDTH,
}: IconProps) {
	const nodes = ICONS[name];
	return (
		<Svg width={size} height={size} viewBox={ICON_VIEWBOX} fill="none">
			{nodes.map(([tag, attrs], i) => {
				const Node = TAGS[tag];
				if (!Node) return null;
				// Applied per-node rather than inherited from <Svg>:
				// react-native-svg only propagates presentation attributes
				// through <G>, not the root element.
				return (
					<Node
						key={i}
						{...attrs}
						fill="none"
						stroke={color}
						strokeWidth={strokeWidth}
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				);
			})}
		</Svg>
	);
}
