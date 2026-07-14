import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { tokens } from '../theme';
import { Text } from '../primitives/Text';
import { openExternal } from '../../platform/openExternal';

export interface FooterLink {
	label: string;
	href: string;
	external?: boolean;
}

export interface FooterGroup {
	heading?: string;
	links: FooterLink[];
}

export interface FooterProps {
	brand?: string;
	tagline?: string;
	groups?: FooterGroup[];
	note?: string;
	onNavigate?: (href: string) => void;
}

const DEFAULT_GROUPS: FooterGroup[] = [
	{
		heading: 'Explore',
		links: [
			{ label: 'About', href: 'https://kbve.com/about/', external: true },
			{ label: 'Legal', href: 'https://kbve.com/legal/', external: true },
			{
				label: 'Discord',
				href: 'https://kbve.com/discord/',
				external: true,
			},
		],
	},
];

function FooterLinkItem({
	label,
	onPress,
}: {
	label: string;
	onPress: () => void;
}) {
	const [hover, setHover] = useState(false);
	return (
		<Pressable
			accessibilityRole="link"
			onPress={onPress}
			onHoverIn={() => setHover(true)}
			onHoverOut={() => setHover(false)}
			style={styles.linkHit as never}>
			<Text
				style={{
					fontSize: 14,
					color: hover
						? tokens.color.primary
						: tokens.color.textMuted,
				}}>
				{label}
			</Text>
		</Pressable>
	);
}

export const Footer = memo(function Footer({
	brand = 'KBVE',
	tagline = 'Open-source games, tools, and cloud infrastructure.',
	groups = DEFAULT_GROUPS,
	note = '© KBVE',
	onNavigate,
}: FooterProps) {
	const go = (link: FooterLink) => {
		if (link.external) {
			openExternal(link.href);
			return;
		}
		onNavigate?.(link.href);
	};

	return (
		<View style={styles.footer}>
			<View style={styles.inner}>
				<View style={styles.brandCol}>
					<Text style={styles.brand}>{brand}</Text>
					<Text style={styles.tagline}>{tagline}</Text>
				</View>
				<View style={styles.cols}>
					{groups.map((group, i) => (
						<View key={group.heading ?? i} style={styles.col}>
							{group.heading ? (
								<Text style={styles.heading}>
									{group.heading}
								</Text>
							) : null}
							{group.links.map((link) => (
								<FooterLinkItem
									key={link.href}
									label={link.label}
									onPress={() => go(link)}
								/>
							))}
						</View>
					))}
				</View>
			</View>
			<View style={styles.base}>
				<Text style={styles.note}>{note}</Text>
			</View>
		</View>
	);
});

const styles = StyleSheet.create({
	footer: {
		width: '100%',
		backgroundColor: tokens.color.bg,
		borderTopWidth: 1,
		borderTopColor: tokens.color.border,
	},
	inner: {
		width: '100%',
		maxWidth: 1120,
		alignSelf: 'center',
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		gap: tokens.space.xxl,
		paddingHorizontal: tokens.space.xl,
		paddingVertical: tokens.space.xxl,
	},
	brandCol: { maxWidth: 280, gap: tokens.space.sm },
	brand: {
		fontSize: 20,
		fontWeight: '800',
		letterSpacing: 2,
		color: tokens.color.primary,
	},
	tagline: {
		fontSize: 14,
		lineHeight: 20,
		color: tokens.color.textMuted,
	},
	cols: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: tokens.space.xxl,
	},
	col: { gap: tokens.space.sm, minWidth: 120 },
	heading: {
		fontSize: 12,
		fontWeight: '700',
		letterSpacing: 1,
		textTransform: 'uppercase',
		color: tokens.color.bronze,
		marginBottom: tokens.space.xs,
	},
	linkHit: { cursor: 'pointer' },
	base: {
		width: '100%',
		maxWidth: 1120,
		alignSelf: 'center',
		paddingHorizontal: tokens.space.xl,
		paddingVertical: tokens.space.lg,
		borderTopWidth: 1,
		borderTopColor: tokens.color.border,
	},
	note: { fontSize: 13, color: tokens.color.textFaint },
});
