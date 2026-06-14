import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewProps } from 'react-native';
import { tokens } from '../theme';

export interface SurfaceProps extends ViewProps {
	padded?: boolean;
	elevated?: boolean;
}

export const Surface = memo(function Surface({
	padded = true,
	elevated = false,
	style,
	children,
	...rest
}: SurfaceProps) {
	return (
		<View
			style={[
				styles.base,
				elevated ? styles.elevated : null,
				padded ? styles.padded : null,
				style,
			]}
			{...rest}>
			{children}
		</View>
	);
});

const styles = StyleSheet.create({
	base: {
		backgroundColor: tokens.color.surface,
		borderRadius: tokens.radius.lg,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	elevated: { backgroundColor: tokens.color.surfaceAlt },
	padded: { padding: tokens.space.lg },
});
