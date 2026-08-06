import { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gradient } from '../ui/primitives/Gradient';
import { Text } from '../ui/primitives/Text';
import { Badge } from '../ui/primitives/Badge';
import { Button } from '../ui/primitives/Button';
import { Icon } from '../ui/primitives/Icon';
import { PressableSurface } from '../ui/primitives/PressableSurface';
import { TileCard } from '../ui/cards/TileCard';
import { tokens } from '../ui/theme';
import type { IconName } from '../icons';
import { useAuth } from '../auth/useAuth';
import { useStaff } from '../auth/useStaff';
import { createPluginRegistry } from '../plugin/registry';
import { PluginHost } from '../plugin/host';
import { defaultHostApi } from '../sandbox/hostApis';
import { createWgpuPlugin } from '../examples/wgpuPlugin';
import { createIsometricPlugin } from '../examples/isometricPlugin';
import { openExternal } from '../platform/openExternal';
import { ClickHouseScreen } from './ClickHouseScreen';
import { McScreen } from './McScreen';
import { S3BackupScreen } from './S3BackupScreen';
import { MarketsScreen } from './MarketsScreen';

const open = (url: string) => openExternal(url);

type PanelId = 'clickhouse' | 'mc' | 's3' | 'markets';

interface Panel {
	id: PanelId;
	icon: IconName;
	title: string;
	blurb: string;
	accent: string;
	heading: string;
	staff?: boolean;
	Screen: () => React.JSX.Element;
}

const PANELS: Panel[] = [
	{
		id: 'clickhouse',
		icon: 'database',
		title: 'Logs',
		blurb: 'ClickHouse cluster analytics',
		accent: '#f59e0b',
		heading: 'ClickHouse · Logs',
		staff: true,
		Screen: ClickHouseScreen,
	},
	{
		id: 'mc',
		icon: 'pickaxe',
		title: 'Minecraft',
		blurb: 'Server GameOps controls',
		accent: '#22c55e',
		heading: 'Minecraft · GameOps',
		staff: true,
		Screen: McScreen,
	},
	{
		id: 's3',
		icon: 'archive',
		title: 'Backups',
		blurb: 'Kilobase S3 snapshots',
		accent: '#6366f1',
		heading: 'Kilobase · S3 Backups',
		staff: true,
		Screen: S3BackupScreen,
	},
	{
		id: 'markets',
		icon: 'cart',
		title: 'Store',
		blurb: 'Credits and marketplace',
		accent: '#a855f7',
		heading: 'Store · Marketplace',
		Screen: MarketsScreen,
	},
];

const ACTIONS: { id: string; icon: IconName; label: string; url: string }[] = [
	{
		id: 'dashboard',
		icon: 'dashboard',
		label: 'Dashboard',
		url: 'https://kbve.com/dashboard/',
	},
	{
		id: 'profile',
		icon: 'user',
		label: 'Profile',
		url: 'https://kbve.com/profile',
	},
	{
		id: 'discord',
		icon: 'users',
		label: 'Community',
		url: 'https://kbve.com/discord/',
	},
];

const FEATURED: {
	id: string;
	icon: IconName;
	title: string;
	tag: string;
	desc: string;
	accent: string;
	url: string;
}[] = [
	{
		id: 'cryptothrone',
		icon: 'compass',
		title: 'Cryptothrone',
		tag: 'LIVE',
		desc: '2D MMO sandbox realm.',
		accent: '#14b8a6',
		url: 'https://kbve.com/cryptothrone/',
	},
	{
		id: 'rareicon',
		icon: 'sparkles',
		title: 'Rareicon',
		tag: 'BETA',
		desc: 'Sci-fi action-RPG bullet-hell roguelite.',
		accent: '#8b5cf6',
		url: 'https://kbve.com/rareicon/',
	},
	{
		id: 'chuck',
		icon: 'gamepad',
		title: 'Chuck',
		tag: 'UE5',
		desc: 'Unreal Engine client.',
		accent: '#f97316',
		url: 'https://kbve.com/',
	},
];

export function HomeView() {
	const auth = useAuth();
	const staff = useStaff();
	const insets = useSafeAreaInsets();
	const username = auth.username ?? 'you';
	const initials = username.slice(0, 2).toUpperCase();

	const native = Platform.OS !== 'web';
	const registry = useMemo(() => createPluginRegistry(), []);
	const api = useMemo(() => defaultHostApi(), []);
	const [launched, setLaunched] = useState(false);
	const [panelId, setPanelId] = useState<PanelId | null>(null);

	useEffect(() => {
		const manifest = native ? createWgpuPlugin() : createIsometricPlugin();
		registry.dispatch({
			type: 'install',
			manifest,
			grant: ['agent:read', 'notify'],
		});
		registry.dispatch({ type: 'enable', id: manifest.id });
	}, [registry, native]);

	if (launched) {
		return (
			<View style={styles.root}>
				<CanvasBar
					title="Isometric · Native GPU"
					top={insets.top}
					onClose={() => setLaunched(false)}
				/>
				<PluginHost registry={registry} slot="canvas" api={api} />
			</View>
		);
	}

	const panel = panelId ? PANELS.find((p) => p.id === panelId) : undefined;
	if (panel) {
		const { Screen } = panel;
		return (
			<View style={styles.root}>
				<CanvasBar
					title={panel.heading}
					top={insets.top}
					onClose={() => setPanelId(null)}
				/>
				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={styles.body}>
					<Screen />
				</ScrollView>
			</View>
		);
	}

	const panels = PANELS.filter((p) => !p.staff || staff.isStaff);

	return (
		<View style={styles.root}>
			<ScrollView
				showsVerticalScrollIndicator={false}
				contentContainerStyle={styles.scroll}>
				<Gradient
					name="hero"
					style={[
						styles.hero,
						{ paddingTop: insets.top + tokens.space.xxl },
					]}>
					<Text style={styles.kicker}>WELCOME TO</Text>
					<Text style={styles.title}>KBVE</Text>
					<Text style={styles.tagline}>Build · Play · Operate</Text>
					<View style={styles.user}>
						<View style={styles.avatar}>
							<Text variant="label" style={styles.avatarText}>
								{initials}
							</Text>
						</View>
						<View style={styles.userMeta}>
							<Text variant="label" style={styles.userName}>
								@{username}
							</Text>
							{staff.isStaff ? (
								<Badge label="STAFF" tone="primary" />
							) : null}
						</View>
					</View>
				</Gradient>

				<View style={styles.body}>
					<Button
						title="Launch Isometric"
						icon="play"
						variant="primary"
						onPress={() => setLaunched(true)}
					/>

					<Text variant="subtitle">Panels</Text>
					<View style={styles.grid}>
						{panels.map((p) => (
							<TileCard
								key={p.id}
								icon={p.icon}
								title={p.title}
								blurb={p.blurb}
								accent={p.accent}
								style={styles.gridItem}
								onPress={() => setPanelId(p.id)}
							/>
						))}
					</View>

					<Text variant="subtitle" style={styles.sectionTitle}>
						Quick actions
					</Text>
					<View style={styles.actions}>
						{ACTIONS.map((action) => (
							<PressableSurface
								key={action.id}
								style={styles.action}
								onPress={() => open(action.url)}
								accessibilityRole="link"
								accessibilityLabel={action.label}>
								<Icon
									name={action.icon}
									size={22}
									color={tokens.color.primary}
								/>
								<Text variant="caption" numberOfLines={1}>
									{action.label}
								</Text>
							</PressableSurface>
						))}
					</View>

					<Text variant="subtitle" style={styles.sectionTitle}>
						Featured
					</Text>
					<View style={styles.featured}>
						{FEATURED.map((item) => (
							<TileCard
								key={item.id}
								wide
								icon={item.icon}
								title={item.title}
								blurb={item.desc}
								accent={item.accent}
								badge={item.tag}
								onPress={() => open(item.url)}
							/>
						))}
					</View>
				</View>
			</ScrollView>
		</View>
	);
}

function CanvasBar({
	title,
	top,
	onClose,
}: {
	title: string;
	top: number;
	onClose: () => void;
}) {
	return (
		<View style={[styles.canvasBar, { paddingTop: top + tokens.space.sm }]}>
			<Text variant="label">{title}</Text>
			<Button
				title="Close"
				icon="close"
				variant="ghost"
				onPress={onClose}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1, backgroundColor: tokens.color.bg },
	scroll: { paddingBottom: tokens.space.xxl },
	canvasBar: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: tokens.space.lg,
		paddingBottom: tokens.space.sm,
		borderBottomWidth: 1,
		borderBottomColor: tokens.color.border,
	},
	hero: {
		paddingHorizontal: tokens.space.xl,
		paddingBottom: tokens.space.xl,
		borderBottomLeftRadius: tokens.radius.xl,
		borderBottomRightRadius: tokens.radius.xl,
		gap: tokens.space.xs,
	},
	kicker: {
		color: '#1b1814',
		fontSize: tokens.font.caption,
		fontWeight: '700',
		letterSpacing: 2,
		opacity: 0.7,
	},
	title: {
		color: '#15120d',
		fontSize: 52,
		fontWeight: '800',
		letterSpacing: 1,
	},
	tagline: {
		color: '#2a2014',
		fontSize: tokens.font.body,
		fontWeight: '600',
	},
	user: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.md,
		marginTop: tokens.space.lg,
	},
	avatar: {
		width: 44,
		height: 44,
		borderRadius: tokens.radius.pill,
		backgroundColor: '#1b1814',
		alignItems: 'center',
		justifyContent: 'center',
		borderWidth: 2,
		borderColor: '#f5ecd8',
	},
	avatarText: { color: tokens.color.primary, fontWeight: '700' },
	userMeta: { gap: 4 },
	userName: { color: '#1b1814', fontWeight: '700' },
	body: { padding: tokens.space.xl, gap: tokens.space.md },
	grid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: tokens.space.sm,
	},
	gridItem: { flexGrow: 1, flexBasis: '47%' },
	actions: { flexDirection: 'row', gap: tokens.space.sm },
	action: {
		flex: 1,
		alignItems: 'center',
		gap: tokens.space.xs,
		paddingVertical: tokens.space.md,
	},
	sectionTitle: { marginTop: tokens.space.lg },
	featured: { gap: tokens.space.sm },
});
