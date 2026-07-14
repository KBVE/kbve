import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../theme';

export interface DividerProps {
	vertical?: boolean;
}

export const Divider = memo(function Divider({
	vertical = false,
}: DividerProps) {
	return <View style={vertical ? styles.vertical : styles.horizontal} />;
});

const styles = StyleSheet.create({
	horizontal: {
		height: StyleSheet.hairlineWidth,
		backgroundColor: tokens.color.border,
		alignSelf: 'stretch',
	},
	vertical: {
		width: StyleSheet.hairlineWidth,
		backgroundColor: tokens.color.border,
		alignSelf: 'stretch',
	},
});
