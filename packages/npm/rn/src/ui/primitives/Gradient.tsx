import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewProps } from 'react-native';
import { tokens } from '../theme';

export type GradientName = keyof typeof tokens.gradient;

export interface GradientProps extends ViewProps {
	name?: GradientName;
	colors?: readonly string[];
	steps?: number;
}

function toRgb(color: string): [number, number, number] {
	const n = parseInt(color.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: [number, number, number]): string {
	return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function ramp(palette: readonly string[], steps: number): string[] {
	if (palette.length < 2)
		return Array.from({ length: steps }, () => palette[0] ?? '#000000');
	const segments = palette.length - 1;
	return Array.from({ length: steps }, (_, i) => {
		const t = (i / (steps - 1)) * segments;
		const index = Math.min(Math.floor(t), segments - 1);
		const f = t - index;
		const a = toRgb(palette[index]);
		const b = toRgb(palette[index + 1]);
		return toHex([
			a[0] + (b[0] - a[0]) * f,
			a[1] + (b[1] - a[1]) * f,
			a[2] + (b[2] - a[2]) * f,
		]);
	});
}

export const Gradient = memo(function Gradient({
	name = 'hero',
	colors,
	steps = 16,
	style,
	children,
	...rest
}: GradientProps) {
	const bands = ramp(colors ?? tokens.gradient[name], steps);
	return (
		<View style={[styles.base, style]} {...rest}>
			<View style={StyleSheet.absoluteFill}>
				{bands.map((color, i) => (
					<View
						key={i}
						style={[styles.band, { backgroundColor: color }]}
					/>
				))}
			</View>
			{children}
		</View>
	);
});

const styles = StyleSheet.create({
	base: { overflow: 'hidden' },
	band: { flex: 1 },
});
