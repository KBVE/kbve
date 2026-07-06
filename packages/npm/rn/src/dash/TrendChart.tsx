import { Fragment, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Svg, {
	Circle,
	Defs,
	LinearGradient,
	Path,
	Stop,
} from 'react-native-svg';
import { Stack, Text, tokens } from './_ui';
import type { SeriesPoint } from './clusterHealth';

export interface TrendSeries {
	label: string;
	color: string;
	points: SeriesPoint[];
}

export interface TrendChartProps {
	title: string;
	series: TrendSeries[];
	/** Formats a raw value for the current-value + axis labels. */
	format: (v: number) => string;
	/** Force the y-axis to start at 0 (good for %, counts). */
	zeroFloor?: boolean;
	height?: number;
}

function domainX(series: TrendSeries[]): [number, number] {
	let lo = Infinity;
	let hi = -Infinity;
	for (const s of series)
		for (const p of s.points) {
			if (p.t < lo) lo = p.t;
			if (p.t > hi) hi = p.t;
		}
	return [lo, hi];
}

function domainY(series: TrendSeries[], zeroFloor: boolean): [number, number] {
	let lo = zeroFloor ? 0 : Infinity;
	let hi = -Infinity;
	for (const s of series)
		for (const p of s.points) {
			if (p.v < lo) lo = p.v;
			if (p.v > hi) hi = p.v;
		}
	if (!Number.isFinite(lo)) lo = 0;
	if (!Number.isFinite(hi)) hi = 1;
	if (hi === lo) hi = lo + 1;
	return [lo, hi];
}

function paths(
	pts: SeriesPoint[],
	w: number,
	h: number,
	[x0, x1]: [number, number],
	[y0, y1]: [number, number],
): { line: string; area: string } {
	if (pts.length === 0) return { line: '', area: '' };
	const pad = 3;
	const ih = h - pad * 2;
	const sx = (t: number) => (x1 === x0 ? 0 : ((t - x0) / (x1 - x0)) * w);
	const sy = (v: number) => pad + ih - ((v - y0) / (y1 - y0)) * ih;
	let line = '';
	pts.forEach((p, i) => {
		line += `${i === 0 ? 'M' : 'L'}${sx(p.t).toFixed(1)},${sy(p.v).toFixed(1)} `;
	});
	const first = sx(pts[0].t);
	const last = sx(pts[pts.length - 1].t);
	const area = `${line}L${last.toFixed(1)},${h} L${first.toFixed(1)},${h} Z`;
	return { line: line.trim(), area };
}

export function TrendChart({
	title,
	series,
	format,
	zeroFloor = false,
	height = 56,
}: TrendChartProps) {
	const [w, setW] = useState(0);
	const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

	const hasData = series.some((s) => s.points.length > 0);
	const xd = domainX(series);
	const yd = domainY(series, zeroFloor);
	const primary = series[0];
	const current =
		primary && primary.points.length
			? primary.points[primary.points.length - 1].v
			: null;

	return (
		<View style={styles.wrap}>
			<Stack direction="row" align="center" gap="sm">
				<Text variant="caption" tone="muted" style={styles.title}>
					{title}
				</Text>
				<View style={styles.spacer} />
				{series.length > 1
					? series.map((s) => (
							<Stack
								key={s.label}
								direction="row"
								align="center"
								gap="xs">
								<View
									style={[
										styles.dot,
										{ backgroundColor: s.color },
									]}
								/>
								<Text variant="caption" weight="medium">
									{s.points.length
										? format(
												s.points[s.points.length - 1].v,
											)
										: '—'}
								</Text>
							</Stack>
						))
					: current != null && (
							<Text variant="caption" weight="medium">
								{format(current)}
							</Text>
						)}
			</Stack>

			<View style={[styles.plot, { height }]} onLayout={onLayout}>
				{w > 0 && hasData ? (
					<Svg width={w} height={height}>
						<Defs>
							{series.map((s, i) => (
								<LinearGradient
									key={i}
									id={`grad-${title}-${i}`}
									x1="0"
									y1="0"
									x2="0"
									y2="1">
									<Stop
										offset="0"
										stopColor={s.color}
										stopOpacity={0.28}
									/>
									<Stop
										offset="1"
										stopColor={s.color}
										stopOpacity={0.02}
									/>
								</LinearGradient>
							))}
						</Defs>
						{series.map((s, i) => {
							const { line, area } = paths(
								s.points,
								w,
								height,
								xd,
								yd,
							);
							if (!line) return null;
							const lastP = s.points[s.points.length - 1];
							const sx =
								xd[1] === xd[0]
									? 0
									: ((lastP.t - xd[0]) / (xd[1] - xd[0])) * w;
							const pad = 3;
							const ih = height - pad * 2;
							const sy =
								pad +
								ih -
								((lastP.v - yd[0]) / (yd[1] - yd[0])) * ih;
							return (
								<Fragment key={i}>
									{series.length === 1 && (
										<Path
											d={area}
											fill={`url(#grad-${title}-${i})`}
										/>
									)}
									<Path
										d={line}
										stroke={s.color}
										strokeWidth={2}
										fill="none"
										strokeLinejoin="round"
										strokeLinecap="round"
									/>
									<Circle
										cx={sx}
										cy={sy}
										r={2.5}
										fill={s.color}
									/>
								</Fragment>
							);
						})}
					</Svg>
				) : (
					<View style={styles.empty}>
						<Text variant="caption" tone="faint">
							no data
						</Text>
					</View>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { gap: 4, flexGrow: 1, flexBasis: 220, minWidth: 200 },
	title: { textTransform: 'uppercase', letterSpacing: 0.5 },
	spacer: { flexGrow: 1 },
	plot: {
		width: '100%',
		borderRadius: tokens.radius.md,
		backgroundColor: tokens.color.surfaceAlt,
		overflow: 'hidden',
	},
	empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	dot: { width: 8, height: 8, borderRadius: 4 },
});
