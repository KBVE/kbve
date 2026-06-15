import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import type { TextInputProps } from 'react-native';
import Animated from 'react-native-reanimated';
import { tokens } from '../theme';
import { useShake } from '../useShake';
import { Text } from './Text';

export interface FormFieldHandle {
	focus: () => void;
	shake: () => void;
}

export interface FormFieldProps extends TextInputProps {
	label?: string;
	error?: string | null;
	hint?: string;
}

export const FormField = forwardRef<FormFieldHandle, FormFieldProps>(
	function FormField({ label, error, hint, style, ...rest }, ref) {
		const input = useRef<TextInput>(null);
		const shake = useShake();
		const invalid = Boolean(error);

		useEffect(() => {
			if (invalid) shake.shake();
		}, [invalid, error]);

		useImperativeHandle(ref, () => ({
			focus: () => input.current?.focus(),
			shake: shake.shake,
		}));

		return (
			<Animated.View style={[styles.container, shake.style]}>
				{label ? (
					<Text variant="label" tone="muted">
						{label}
					</Text>
				) : null}
				<TextInput
					ref={input}
					style={[styles.input, invalid && styles.inputError, style]}
					placeholderTextColor={tokens.color.textFaint}
					{...rest}
				/>
				{invalid ? (
					<Text variant="caption" tone="danger">
						{error}
					</Text>
				) : hint ? (
					<Text variant="caption" tone="faint">
						{hint}
					</Text>
				) : null}
			</Animated.View>
		);
	},
);

const styles = StyleSheet.create({
	container: { gap: tokens.space.xs },
	input: {
		width: '100%',
		backgroundColor: tokens.color.surface,
		color: tokens.color.text,
		borderRadius: tokens.radius.md,
		borderWidth: 1,
		borderColor: tokens.color.border,
		paddingHorizontal: tokens.space.lg,
		paddingVertical: tokens.space.md,
		fontSize: tokens.font.body,
	},
	inputError: { borderColor: tokens.color.danger },
});
