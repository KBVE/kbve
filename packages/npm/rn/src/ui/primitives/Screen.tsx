import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ViewProps } from 'react-native';
import { tokens } from '../theme';

export interface ScreenProps extends ViewProps {
	center?: boolean;
	padded?: boolean;
}

export const Screen = memo(function Screen({
	center = false,
	padded = true,
	style,
	children,
	...rest
}: ScreenProps) {
	return (
		<SafeAreaView
			style={[
				styles.base,
				padded ? styles.padded : null,
				center ? styles.center : null,
				style,
			]}
			{...rest}>
			{children}
		</SafeAreaView>
	);
});

const styles = StyleSheet.create({
	base: { flex: 1, backgroundColor: tokens.color.bg },
	padded: { paddingHorizontal: tokens.space.xl },
	center: {
		alignItems: 'center',
		justifyContent: 'center',
		gap: tokens.space.md,
	},
});
