import { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { ImageStyle, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../ThemeProvider';
import { Text } from './Text';

export interface AvatarProps {
	name?: string;
	uri?: string | null;
	src?: string | null;
	alt?: string;
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
	name,
	uri,
	src,
	alt,
	size = 40,
	style,
}: AvatarProps) {
	const t = useTheme();
	const source = uri ?? src;
	const label = name ?? alt ?? '';
	const dim = { width: size, height: size, borderRadius: size / 2 };
	const surface: ViewStyle = {
		backgroundColor: t.color.surfaceAlt,
		borderColor: t.color.border,
	};

	if (source) {
		return (
			<Image
				source={{ uri: source }}
				style={
					[styles.base, surface, dim, style] as StyleProp<ImageStyle>
				}
			/>
		);
	}

	return (
		<View style={[styles.base, surface, styles.fallback, dim, style]}>
			<Text variant="label" style={{ fontSize: size * 0.4 }}>
				{initials(label)}
			</Text>
		</View>
	);
});

const styles = StyleSheet.create({
	base: { borderWidth: 1 },
	fallback: { alignItems: 'center', justifyContent: 'center' },
});
