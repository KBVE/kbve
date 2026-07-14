import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { tokens } from '../theme';
import { Text } from './Text';

export interface CheckboxProps {
	checked: boolean;
	onChange: (next: boolean) => void;
	disabled?: boolean;
	children?: ReactNode;
}

export const Checkbox = memo(function Checkbox({
	checked,
	onChange,
	disabled = false,
	children,
}: CheckboxProps) {
	return (
		<View style={[styles.row, disabled && styles.disabled]}>
			<Pressable
				style={[styles.box, checked && styles.boxChecked]}
				disabled={disabled}
				hitSlop={8}
				onPress={() => onChange(!checked)}>
				{checked ? (
					<Text variant="caption" weight="bold" style={styles.check}>
						✓
					</Text>
				) : null}
			</Pressable>
			<View style={styles.label}>{children}</View>
		</View>
	);
});

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: tokens.space.sm,
	},
	disabled: { opacity: 0.5 },
	box: {
		width: 22,
		height: 22,
		borderRadius: tokens.radius.sm,
		borderWidth: 1,
		borderColor: tokens.color.border,
		backgroundColor: tokens.color.surface,
		alignItems: 'center',
		justifyContent: 'center',
	},
	boxChecked: {
		backgroundColor: tokens.color.primary,
		borderColor: tokens.color.primary,
	},
	check: { color: '#fff' },
	label: { flex: 1 },
});
