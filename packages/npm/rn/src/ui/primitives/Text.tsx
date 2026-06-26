import { memo } from 'react';
import { StyleSheet, Text as RNText } from 'react-native';
import type { TextProps as RNTextProps } from 'react-native';
import { tokens } from '../theme';
import { useTheme } from '../ThemeProvider';

export type TextVariant =
	| 'display'
	| 'title'
	| 'subtitle'
	| 'body'
	| 'label'
	| 'caption';
export type TextTone =
	| 'default'
	| 'muted'
	| 'faint'
	| 'primary'
	| 'success'
	| 'danger'
	| 'warning';
export type TextWeight = 'regular' | 'medium' | 'bold';

export interface TextProps extends RNTextProps {
	variant?: TextVariant;
	tone?: TextTone;
	weight?: TextWeight;
}

export const Text = memo(function Text({
	variant = 'body',
	tone = 'default',
	weight,
	style,
	...rest
}: TextProps) {
	const t = useTheme();
	const toneColor = {
		default: t.color.text,
		muted: t.color.textMuted,
		faint: t.color.textFaint,
		primary: t.color.primary,
		success: t.color.success,
		danger: t.color.danger,
		warning: t.color.warning,
	}[tone];
	return (
		<RNText
			style={[
				variantStyle[variant],
				{ color: toneColor },
				weight ? weightStyle[weight] : null,
				style,
			]}
			{...rest}
		/>
	);
});

const variantStyle = StyleSheet.create({
	display: { fontSize: tokens.font.display, fontWeight: '700' },
	title: { fontSize: tokens.font.title, fontWeight: '700' },
	subtitle: { fontSize: tokens.font.subtitle, fontWeight: '600' },
	body: { fontSize: tokens.font.body },
	label: { fontSize: tokens.font.label, fontWeight: '600' },
	caption: { fontSize: tokens.font.caption },
});

const weightStyle = StyleSheet.create({
	regular: { fontWeight: '400' },
	medium: { fontWeight: '600' },
	bold: { fontWeight: '700' },
});
