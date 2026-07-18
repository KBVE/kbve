import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { tokens } from '../theme';
import { Text } from '../primitives/Text';
import { openExternal } from '../../platform/openExternal';
import { NavItem } from './NavItem.web';

export interface NavLink {
	label: string;
	href: string;
	icon?: string;
	external?: boolean;
}

export interface NavBarProps {
	brand?: string;
	links?: NavLink[];
	active?: string;
	onNavigate?: (href: string) => void;
}

const DEFAULT_LINKS: NavLink[] = [
	{ label: 'Docs', href: '/docs/', icon: 'grid' },
	{ label: 'Project', href: '/project/', icon: 'build' },
	{ label: 'Gaming', href: '/gaming/', icon: 'sparkles' },
	{ label: 'Blog', href: '/blog/', icon: 'chatbubble' },
];

export const NavBar = memo(function NavBar({
	brand = 'KBVE',
	links = DEFAULT_LINKS,
	active,
	onNavigate,
}: NavBarProps) {
	const go = (link: Pick<NavLink, 'href' | 'external'>) => {
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
					accessibilityLabel={brand}
					onPress={() => go({ href: '/' })}
					style={styles.brandHit as never}>
					<Text style={styles.brand}>{brand}</Text>
				</Pressable>
				<View style={styles.links}>
					{links.map((link) => (
						<NavItem
							key={link.href}
							label={link.label}
							icon={link.icon}
							active={active === link.href}
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
});
