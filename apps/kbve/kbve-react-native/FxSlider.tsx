import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Text } from '@kbve/rn';

export interface FxSliderProps {
	label: string;
	value: number;
	min: number;
	max: number;
	onChange(value: number): void;
}

/// Minimal pure-JS slider (no native module). Drag the track to set a value in
/// [min,max]; reports continuously via onChange.
export function FxSlider({ label, value, min, max, onChange }: FxSliderProps) {
	const width = useRef(1);
	const [pos, setPos] = useState(value);

	const onLayout = (e: LayoutChangeEvent) => {
		width.current = e.nativeEvent.layout.width || 1;
	};

	const set = (locationX: number) => {
		const ratio = Math.min(Math.max(locationX / width.current, 0), 1);
		const next = min + ratio * (max - min);
		setPos(next);
		onChange(next);
	};

	const responder = useMemo(
		() =>
			PanResponder.create({
				onStartShouldSetPanResponder: () => true,
				onMoveShouldSetPanResponder: () => true,
				onPanResponderGrant: (e) => set(e.nativeEvent.locationX),
				onPanResponderMove: (e) => set(e.nativeEvent.locationX),
			}),
		[],
	);

	const ratio = (pos - min) / (max - min);

	return (
		<View style={styles.row}>
			<Text variant="caption" tone="muted">
				{label} {pos.toFixed(1)}
			</Text>
			<View
				style={styles.track}
				onLayout={onLayout}
				{...responder.panHandlers}>
				<View style={[styles.fill, { width: `${ratio * 100}%` }]} />
				<View style={[styles.thumb, { left: `${ratio * 100}%` }]} />
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	row: { gap: 6 },
	track: {
		height: 28,
		justifyContent: 'center',
		borderRadius: 999,
		backgroundColor: 'rgba(255,255,255,0.12)',
	},
	fill: {
		position: 'absolute',
		height: '100%',
		borderRadius: 999,
		backgroundColor: 'rgba(120,180,255,0.45)',
	},
	thumb: {
		position: 'absolute',
		width: 18,
		height: 18,
		marginLeft: -9,
		borderRadius: 999,
		backgroundColor: '#dfe8ff',
	},
});
