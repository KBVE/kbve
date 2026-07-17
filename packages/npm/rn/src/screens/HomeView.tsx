import { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gradient } from '../ui/primitives/Gradient';
import { Text } from '../ui/primitives/Text';
import { Badge } from '../ui/primitives/Badge';
import { Button } from '../ui/primitives/Button';
import { PressableSurface } from '../ui/primitives/PressableSurface';
import { tokens } from '../ui/theme';
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

const open = (url: string) => openExternal(url);

const ACTIONS = [
	{
		id: 'dashboard',
		label: 'Dashboard',
		hint: 'Your services',
		url: 'https://kbve.com/dashboard/',
	},
	{
		id: 'profile',
		label: 'Profile',
		hint: 'Public handle',
		url: 'https://kbve.com/profile',
	},
	{
		id: 'discord',
		label: 'Community',
		hint: 'Discord',
		url: 'https://kbve.com/discord/',
	},
];

const FEATURED = [
	{
		id: 'cryptothrone',
		title: 'Cryptothrone',
		tag: 'LIVE',
		desc: '2D MMO sandbox realm.',
		url: 'https://kbve.com/cryptothrone/',
	},
	{
		id: 'rareicon',
		title: 'Rareicon',
		tag: 'BETA',
		desc: 'Sci-fi action-RPG bullet-hell roguelite.',
		url: 'https://kbve.com/rareicon/',
	},
	{
		id: 'chuck',
		title: 'Chuck',
		tag: 'UE5',
		desc: 'Unreal Engine client.',
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
	const [showClickHouse, setShowClickHouse] = useState(false);
	const [showMc, setShowMc] = useState(false);

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
				<View
					style={[
						styles.canvasBar,
						{ paddingTop: insets.top + tokens.space.sm },
					]}>
					<Text variant="label">Isometric · Native GPU</Text>
					<Button
						title="Close"
						variant="ghost"
						onPress={() => setLaunched(false)}
					/>
				</View>
				<PluginHost registry={registry} slot="canvas" api={api} />
			</View>
		);
	}

	if (showClickHouse) {
		return (
			<View style={styles.root}>
				<View
					style={[
						styles.canvasBar,
						{ paddingTop: insets.top + tokens.space.sm },
					]}>
					<Text variant="label">ClickHouse · Dashboard</Text>
					<Button
						title="Close"
						variant="ghost"
						onPress={() => setShowClickHouse(false)}
					/>
				</View>
				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={styles.body}>
					<ClickHouseScreen />
				</ScrollView>
			</View>
		);
	}

	if (showMc) {
		return (
			<View style={styles.root}>
				<View
					style={[
						styles.canvasBar,
						{ paddingTop: insets.top + tokens.space.sm },
					]}>
					<Text variant="label">Minecraft · GameOps</Text>
					<Button
						title="Close"
						variant="ghost"
						onPress={() => setShowMc(false)}
					/>
				</View>
				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={styles.body}>
					<McScreen />
				</ScrollView>
			</View>
		);
	}

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
						title="▶  Launch Isometric (Native GPU)"
						variant="primary"
						onPress={() => setLaunched(true)}
					/>

					{staff.isStaff ? (
						<Button
							title="📊  ClickHouse Dashboard"
							variant="secondary"
							onPress={() => setShowClickHouse(true)}
						/>
					) : null}

					{staff.isStaff ? (
						<Button
							title="⛏  Minecraft Dashboard"
							variant="secondary"
							onPress={() => setShowMc(true)}
						/>
					) : null}

					<Text variant="subtitle">Quick actions</Text>
					<View style={styles.actions}>
						{ACTIONS.map((action) => (
							<PressableSurface
								key={action.id}
								style={styles.action}
								padded={false}
								onPress={() => open(action.url)}>
								<View style={styles.actionAccent} />
								<View style={styles.actionBody}>
									<Text variant="label">{action.label}</Text>
									<Text variant="caption" tone="muted">
										{action.hint}
									</Text>
								</View>
							</PressableSurface>
						))}
					</View>

					<Text variant="subtitle" style={styles.sectionTitle}>
						Featured
					</Text>
					<View style={styles.featured}>
						{FEATURED.map((item) => (
							<PressableSurface
								key={item.id}
								onPress={() => open(item.url)}
								style={styles.card}>
								<View style={styles.cardHeader}>
									<Text variant="subtitle">{item.title}</Text>
									<Badge label={item.tag} tone="primary" />
								</View>
								<Text variant="body" tone="muted">
									{item.desc}
								</Text>
							</PressableSurface>
						))}
					</View>
				</View>
			</ScrollView>
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
	actions: { flexDirection: 'row', gap: tokens.space.sm },
	action: {
		flex: 1,
		overflow: 'hidden',
	},
	actionAccent: { height: 3, backgroundColor: tokens.color.primary },
	actionBody: { padding: tokens.space.md, gap: 2 },
	sectionTitle: { marginTop: tokens.space.lg },
	featured: { gap: tokens.space.md },
	card: { gap: tokens.space.sm },
	cardHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
});
