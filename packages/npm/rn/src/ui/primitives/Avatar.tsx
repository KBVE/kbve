import { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { ImageStyle, StyleProp, ViewStyle } from 'react-native';
import { tokens } from '../theme';
import { Text } from './Text';

export interface AvatarProps {
	name?: string;
	uri?: string | null;
	size?: number;
	style?: ViewStyle;
}

function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const Avatar = memo(function Avatar({
	name = '',
	uri,
	size = 40,
	style,
}: AvatarProps) {
	const dim = {
		width: size,
		height: size,
		borderRadius: size / 2,
	};

	if (uri) {
		return (
			<Image
				source={{ uri }}
				style={[styles.base, dim, style] as StyleProp<ImageStyle>}
			/>
		);
	}

	return (
		<View style={[styles.base, styles.fallback, dim, style]}>
			<Text variant="label" style={{ fontSize: size * 0.4 }}>
				{initials(name)}
			</Text>
		</View>
	);
});

const styles = StyleSheet.create({
	base: {
		backgroundColor: tokens.color.surfaceAlt,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	fallback: { alignItems: 'center', justifyContent: 'center' },
});
