import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { AgentSessionStatus, AgentStore } from '@kbve/core';
import { Screen } from '../ui/primitives/Screen';
import { Surface } from '../ui/primitives/Surface';
import { Stack } from '../ui/primitives/Stack';
import { Text } from '../ui/primitives/Text';
import { Badge } from '../ui/primitives/Badge';
import type { BadgeTone } from '../ui/primitives/Badge';
import { Button } from '../ui/primitives/Button';
import { tokens } from '../ui/theme';
import { useAgent } from '../agent/useAgent';
import { useAuth, useAuthActions } from '../auth/useAuth';
import { createPluginRegistry } from '../plugin/registry';
import { PluginHost } from '../plugin/host';
import { defaultHostApi } from '../sandbox/hostApis';
import { createIsometricPlugin } from '../examples/isometricPlugin';
import { createWgpuPlugin } from '../examples/wgpuPlugin';

const STATUS_TONE: Record<AgentSessionStatus, BadgeTone> = {
	idle: 'neutral',
	connecting: 'warning',
	running: 'primary',
	waiting_approval: 'warning',
	error: 'danger',
	closed: 'neutral',
};

export interface HomeScreenProps {
	store: AgentStore;
	isometricUrl?: string;
}

export function HomeScreen({ store, isometricUrl }: HomeScreenProps) {
	const auth = useAuth();
	const { signOut } = useAuthActions();
	const vm = useAgent(store);
	const [launched, setLaunched] = useState(false);

	const registry = useMemo(() => createPluginRegistry(), []);
	const api = useMemo(() => defaultHostApi({ agent: store }), [store]);
	const native = Platform.OS !== 'web';

	useEffect(() => {
		const manifest = native
			? createWgpuPlugin()
			: createIsometricPlugin(isometricUrl);
		registry.dispatch({
			type: 'install',
			manifest,
			grant: ['agent:read', 'notify'],
		});
		registry.dispatch({ type: 'enable', id: manifest.id });
	}, [registry, isometricUrl, native]);

	if (launched) {
		return (
			<Screen padded={false}>
				<View style={styles.canvasBar}>
					<Text variant="label">Isometric</Text>
					<Button
						title="Close"
						variant="ghost"
						onPress={() => setLaunched(false)}
					/>
				</View>
				<PluginHost registry={registry} slot="canvas" api={api} />
			</Screen>
		);
	}

	const identity = auth.username ?? auth.user?.email ?? 'unknown';

	return (
		<Screen>
			<Stack gap="lg" style={styles.body}>
				<Stack gap="xs">
					<Text variant="display">KBVE</Text>
					<Text variant="caption" tone="muted">
						signed in as {identity}
					</Text>
				</Stack>

				<Surface>
					<Stack gap="md">
						<View style={styles.row}>
							<Text variant="label" tone="muted">
								agent
							</Text>
							<Badge
								label={vm.status}
								tone={STATUS_TONE[vm.status]}
							/>
						</View>
						<View style={styles.row}>
							<Text variant="label" tone="muted">
								connection
							</Text>
							<Badge
								label={vm.connection}
								tone={vm.connected ? 'success' : 'neutral'}
							/>
						</View>
					</Stack>
				</Surface>

				<Stack gap="sm">
					<Button
						title="Open session"
						variant="primary"
						onPress={() => store.dispatch({ type: 'open_session' })}
					/>
					<Button
						title="Launch Isometric"
						variant="secondary"
						onPress={() => setLaunched(true)}
					/>
					<Button
						title="Sign out"
						variant="ghost"
						onPress={signOut}
					/>
				</Stack>
			</Stack>
		</Screen>
	);
}

const styles = StyleSheet.create({
	body: { flex: 1, justifyContent: 'center' },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	canvasBar: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: tokens.space.lg,
		paddingVertical: tokens.space.sm,
		borderBottomWidth: 1,
		borderBottomColor: tokens.color.border,
	},
});
