import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../theme';
import { Text } from '../primitives/Text';
import { openExternal } from '../../platform/openExternal';

const LINKS = [
	{ label: 'About', url: 'https://kbve.com/about/' },
	{ label: 'Legal', url: 'https://kbve.com/legal/' },
	{ label: 'Discord', url: 'https://kbve.com/discord/' },
];

export const Footer = memo(function Footer() {
	return (
		<View style={styles.footer}>
			<View style={styles.links}>
				{LINKS.map((link) => (
					<Text
						key={link.url}
						variant="caption"
						tone="primary"
						onPress={() => openExternal(link.url)}>
						{link.label}
					</Text>
				))}
			</View>
			<Text variant="caption" tone="faint">
				© KBVE · v0.0.1
			</Text>
		</View>
	);
});

const styles = StyleSheet.create({
	footer: {
		alignItems: 'center',
		gap: tokens.space.sm,
		paddingVertical: tokens.space.xl,
	},
	links: { flexDirection: 'row', gap: tokens.space.lg },
});
