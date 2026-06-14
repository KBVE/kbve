import { memo } from 'react';
import { View } from 'react-native';
import type { ViewProps, ViewStyle } from 'react-native';
import { tokens } from '../theme';

export interface StackProps extends ViewProps {
	direction?: 'row' | 'column';
	gap?: keyof typeof tokens.space;
	align?: ViewStyle['alignItems'];
	justify?: ViewStyle['justifyContent'];
	wrap?: boolean;
}

export const Stack = memo(function Stack({
	direction = 'column',
	gap = 'md',
	align,
	justify,
	wrap = false,
	style,
	children,
	...rest
}: StackProps) {
	return (
		<View
			style={[
				{
					flexDirection: direction,
					gap: tokens.space[gap],
					alignItems: align,
					justifyContent: justify,
					flexWrap: wrap ? 'wrap' : 'nowrap',
				},
				style,
			]}
			{...rest}>
			{children}
		</View>
	);
});
