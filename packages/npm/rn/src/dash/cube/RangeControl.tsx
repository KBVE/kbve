import { Pressable, StyleSheet } from 'react-native';
import { Stack, Text, tokens } from '../_ui';
import type { RangeKey } from './cubeApi';

export interface RangeControlProps {
	value: RangeKey;
	onChange: (k: RangeKey) => void;
}

const OPTIONS: { key: RangeKey; label: string }[] = [
	{ key: '24h', label: '24h' },
	{ key: '7d', label: '7d' },
	{ key: '30d', label: '30d' },
	{ key: 'all', label: 'All' },
];

export function RangeControl({ value, onChange }: RangeControlProps) {
	return (
		<Stack direction="row" gap="xs">
			{OPTIONS.map((o) => {
				const on = o.key === value;
				return (
					<Pressable
						key={o.key}
						onPress={() => onChange(o.key)}
						style={[styles.seg, on ? styles.segOn : null]}>
						<Text
							variant="caption"
							weight={on ? 'medium' : undefined}
							style={{
								color: on
									? tokens.color.onPrimary
									: tokens.color.textMuted,
							}}>
							{o.label}
						</Text>
					</Pressable>
				);
			})}
		</Stack>
	);
}

const styles = StyleSheet.create({
	seg: {
		paddingHorizontal: tokens.space.md,
		paddingVertical: 4,
		borderRadius: tokens.radius.pill,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	segOn: {
		backgroundColor: tokens.color.primary,
		borderColor: tokens.color.primary,
	},
});
