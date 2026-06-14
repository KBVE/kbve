import { memo } from 'react';
import { StyleSheet, Text as RNText } from 'react-native';
import type { TextProps as RNTextProps } from 'react-native';
import { tokens } from '../theme';

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
	| 'danger';
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
	return (
		<RNText
			style={[
				variantStyle[variant],
				toneStyle[tone],
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

const toneStyle = StyleSheet.create({
	default: { color: tokens.color.text },
	muted: { color: tokens.color.textMuted },
	faint: { color: tokens.color.textFaint },
	primary: { color: tokens.color.primary },
	success: { color: tokens.color.success },
	danger: { color: tokens.color.danger },
});

const weightStyle = StyleSheet.create({
	regular: { fontWeight: '400' },
	medium: { fontWeight: '600' },
	bold: { fontWeight: '700' },
});
