import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from '../primitives/Text';
import { Stack } from '../primitives/Stack';
import { Sheet } from '../overlays/Sheet';
import { tokens } from '../theme';
import type { SelectProps } from './Select.types';

export function Select<T extends string>({
	value, options, placeholder = 'Select…', disabled, onValueChange,
}: SelectProps<T>) {
	const [open, setOpen] = useState(false);
	const selected = options.find((o) => o.value === value);
	return (
		<>
			<Pressable
				disabled={disabled}
				onPress={() => setOpen(true)}
				accessibilityRole="button"
				accessibilityState={{ disabled, expanded: open }}
				style={[styles.trigger, disabled && styles.disabled]}>
				<Text variant="caption">{selected?.label ?? placeholder}</Text>
			</Pressable>
			<Sheet visible={open} onClose={() => setOpen(false)} placement="bottom">
				<Stack gap="xs" style={styles.sheet}>
					{options.map((o) => (
						<Pressable
							key={o.value}
							disabled={o.disabled}
							onPress={() => { onValueChange(o.value); setOpen(false); }}
							style={styles.option}>
							<Text variant="caption" weight={o.value === value ? 'medium' : undefined}>
								{o.label}
							</Text>
						</Pressable>
					))}
				</Stack>
			</Sheet>
		</>
	);
}
const styles = StyleSheet.create({
	trigger: {
		paddingHorizontal: tokens.space.md, paddingVertical: 6,
		borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.color.border,
		backgroundColor: tokens.color.surface,
	},
	disabled: { opacity: 0.4 },
	sheet: { padding: tokens.space.md },
	option: { paddingVertical: tokens.space.sm, paddingHorizontal: tokens.space.md },
});
export type { SelectProps, SelectOption } from './Select.types';
