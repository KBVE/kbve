import { memo } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../theme';
import { AppBar } from './AppBar';
import { TabBar } from './TabBar';
import type { TabItem } from './TabBar';
import { navStore, useTab } from './navStore';

export interface NavRoute {
	id: string;
	label: string;
	icon: TabItem['icon'];
	screen: ReactNode;
	title?: string;
	appBar?: boolean;
}

export interface NavShellProps {
	routes: NavRoute[];
	/** Optional full-bleed layer rendered behind all chrome (e.g. a GPU effect). */
	background?: ReactNode;
}

export const NavShell = memo(function NavShell({
	routes,
	background,
}: NavShellProps) {
	const active = useTab();
	const route = routes.find((r) => r.id === active) ?? routes[0];
	const tabs: TabItem[] = routes.map((r) => ({
		id: r.id,
		label: r.label,
		icon: r.icon,
	}));
	return (
		<View style={[styles.root, background ? styles.rootBare : null]}>
			{background ? (
				<View style={StyleSheet.absoluteFill} pointerEvents="none">
					{background}
				</View>
			) : null}
			{route.appBar !== false ? (
				<AppBar title={route.title ?? route.label} />
			) : null}
			<View style={styles.content}>{route.screen}</View>
			<TabBar
				tabs={tabs}
				active={route.id}
				onTabPress={navStore.setTab}
			/>
		</View>
	);
});

const styles = StyleSheet.create({
	root: { flex: 1, backgroundColor: tokens.color.bg },
	rootBare: { backgroundColor: 'transparent' },
	content: { flex: 1 },
});
