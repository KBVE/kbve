import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { tokens } from '../theme';
import { Text } from '../primitives/Text';
import { openExternal } from '../../platform/openExternal';

export interface NavLink {
	label: string;
	href: string;
	external?: boolean;
}

export interface NavBarProps {
	brand?: string;
	links?: NavLink[];
	onNavigate?: (href: string) => void;
}

const DEFAULT_LINKS: NavLink[] = [
	{ label: 'Docs', href: '/docs/' },
	{ label: 'Project', href: '/project/' },
	{ label: 'Gaming', href: '/gaming/' },
	{ label: 'Blog', href: '/blog/' },
];

function NavLinkItem({
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
			style={styles.link as never}>
			<Text
				style={{
					fontSize: 15,
					fontWeight: '600',
					color: hover
						? tokens.color.primary
						: tokens.color.textMuted,
				}}>
				{label}
			</Text>
		</Pressable>
	);
}

export const NavBar = memo(function NavBar({
	brand = 'KBVE',
	links = DEFAULT_LINKS,
	onNavigate,
}: NavBarProps) {
	const go = (link: NavLink) => {
		if (link.external) {
			openExternal(link.href);
			return;
		}
		onNavigate?.(link.href);
	};

	return (
		<View style={styles.bar}>
			<View style={styles.inner}>
				<Pressable
					accessibilityRole="link"
					onPress={() => go({ label: brand, href: '/' })}
					style={styles.brandHit as never}>
					<Text style={styles.brand}>{brand}</Text>
				</Pressable>
				<View style={styles.links}>
					{links.map((link) => (
						<NavLinkItem
							key={link.href}
							label={link.label}
							onPress={() => go(link)}
						/>
					))}
				</View>
			</View>
		</View>
	);
});

const styles = StyleSheet.create({
	bar: {
		width: '100%',
		minHeight: 60,
		justifyContent: 'center',
		backgroundColor: tokens.color.bgSubtle,
		borderBottomWidth: 1,
		borderBottomColor: tokens.color.border,
	},
	inner: {
		width: '100%',
		maxWidth: 1120,
		alignSelf: 'center',
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: tokens.space.xl,
		paddingVertical: tokens.space.sm,
		gap: tokens.space.lg,
	},
	brandHit: { cursor: 'pointer' },
	brand: {
		fontSize: 22,
		fontWeight: '800',
		letterSpacing: 2,
		color: tokens.color.primary,
	},
	links: {
		flexDirection: 'row',
		alignItems: 'center',
		flexWrap: 'wrap',
		gap: tokens.space.lg,
	},
	link: { cursor: 'pointer', paddingVertical: tokens.space.xs },
});
